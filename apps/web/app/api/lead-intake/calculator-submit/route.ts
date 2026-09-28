import { NextRequest, NextResponse, after } from 'next/server'
import { getClientIp } from '@/modules/lead-intake/anti-spam/client-ip'
import { checkLeadSubmitRateLimit } from '@/modules/lead-intake/anti-spam/rate-limit'
import { verifyTurnstileToken } from '@/modules/lead-intake/anti-spam/verify-turnstile'
import {
  mapCalculatorSubmissionToIntakeInput,
  normalizeEstimate,
  type CalculatorSubmission,
} from '@/modules/lead-intake/calculator/map-calculator-submission'
import { saveLeadSubmitFailure } from '@/modules/lead-intake/calculator/submit-failures'
import {
  databaseDiagnostic,
  isProvisionalPhoneConflict,
} from '@/modules/lead-intake/calculator/contact-review'
import {
  findCalculatorLeadBySubmissionRef,
  hasCompletedCustomerEstimateEmail,
} from '@/modules/lead-intake/calculator/idempotency'
import { numberValue, stringValue } from '@/modules/lead-intake/calculator/parse'
import { errorMessage } from '@/lib/error-message'
import { sendCustomerEstimateEmail } from '@/modules/lead-intake/email/customer-estimate'
import { syncLeadToServiceM8 } from '@/modules/lead-intake/servicem8/sync'
import { submitLeadIntakeForUser } from '@/modules/lead-intake/actions'

const MINIMUM_SUBMIT_AGE_MS = 3000
const DEFAULT_ALLOWED_ORIGINS = [
  'https://royalglass.co.nz',
  'https://www.royalglass.co.nz',
  'https://rgtools.co.nz',
  'https://www.rgtools.co.nz',
]

function allowedOrigins(): string[] {
  const configured = process.env.CALCULATOR_ALLOWED_ORIGIN
  if (!configured) return DEFAULT_ALLOWED_ORIGINS

  return Array.from(new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]))
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  const ip = getClientIp(request.headers)
  const trustedServerRequest = isTrustedServerRequest(request)
  let payload: unknown = null

  try {
    const originResult = validateOrigin(request, trustedServerRequest)
    if (!originResult.ok) {
      logSubmit({ correlationId, ip, stage: 'cors', outcome: 'rejected', reason: 'origin_not_allowed' })
      return json({ error: 'Forbidden' }, 403, request)
    }

    payload = await readJsonBody(request)
    const submission = payload as CalculatorSubmission
    const submissionRef = normalizeSubmissionRef(submission.submissionRef)

    if (stringValue(submission.lead?.websiteUrl)) {
      logSubmit({ correlationId, ip, stage: 'honeypot', outcome: 'rejected', reason: 'honeypot_filled' })
      return json({ error: 'Forbidden' }, 403, request)
    }

    const loadedAt = numberValue(submission.loadedAt)
    if (!Number.isFinite(loadedAt)) {
      logSubmit({ correlationId, ip, stage: 'time_gate', outcome: 'rejected', reason: 'missing_loaded_at' })
      return json({ error: 'Invalid payload' }, 400, request)
    }

    if (Date.now() - loadedAt < MINIMUM_SUBMIT_AGE_MS) {
      logSubmit({ correlationId, ip, stage: 'time_gate', outcome: 'rejected', reason: 'too_fast' })
      return json({ error: 'Forbidden' }, 403, request)
    }

    if (!trustedServerRequest) {
      const turnstile = await verifyTurnstileToken(submission.turnstileToken, ip)
      if (!turnstile.ok) {
        logSubmit({ correlationId, ip, stage: 'turnstile', outcome: 'rejected', reason: turnstile.reason })
        return json({ error: 'Forbidden' }, 403, request)
      }

      const rateLimit = await checkLeadSubmitRateLimit(ip)
      if (!rateLimit.ok) {
        logSubmit({ correlationId, ip, stage: 'rate_limit', outcome: 'rejected', reason: 'too_many_attempts' })
        return json(
          { error: 'Too many submissions' },
          429,
          request,
          { 'retry-after': String(rateLimit.retryAfterSeconds) },
        )
      }
    }

    let input
    try {
      input = mapCalculatorSubmissionToIntakeInput(submission, {
        submittedAt: new Date(),
        submissionRef,
      })
    } catch (error) {
      const message = errorMessage(error)
      await deadLetter({ correlationId, ip, stage: 'map', error: message, payload, submissionRef })
      return json({ error: 'Unable to submit lead' }, 500, request)
    }

    const existingLead = await findCalculatorLeadBySubmissionRef(submissionRef)
    if (existingLead) {
      const emailInput = buildCustomerEmailInput(existingLead.leadId, submission, input, correlationId)
      const emailAlreadySent = await hasCompletedCustomerEstimateEmail(existingLead.leadId, emailInput.to)
      scheduleLeadDelivery({
        leadId: existingLead.leadId,
        emailInput,
        correlationId,
        ip,
        sendEmail: !emailAlreadySent,
      })
      logSubmit({ correlationId, ip, stage: 'idempotency', outcome: 'accepted', reason: existingLead.leadId })
      return json({
        ok: true,
        leadId: existingLead.leadId,
        submissionRef,
        idempotent: true,
      }, 200, request)
    }

    let result
    try {
      result = await submitLeadIntakeForUser(input, null, { syncServiceM8: false })
    } catch (error) {
      const diagnostic = databaseDiagnostic(error)
      if (!isProvisionalPhoneConflict(diagnostic)) throw error

      logSubmit({
        correlationId,
        ip,
        stage: 'identity_conflict',
        outcome: 'error',
        reason: 'retry_as_contact_review',
        submissionRef,
        ...diagnostic,
      })
      result = await submitLeadIntakeForUser(input, null, {
        syncServiceM8: false,
        forceContactReview: true,
      })
    }
    if (!('success' in result)) {
      await deadLetter({ correlationId, ip, stage: 'save', error: result.error, payload, submissionRef })
      return json({ error: 'Unable to submit lead' }, 500, request)
    }

    logSubmit({ correlationId, ip, stage: 'save', outcome: 'accepted', reason: result.leadId })
    if (result.contactReviewReason) {
      logSubmit({
        correlationId,
        ip,
        stage: 'identity_review',
        outcome: 'accepted',
        reason: 'contact_details_need_checking',
        submissionRef,
      })
    }

    scheduleLeadDelivery({
      leadId: result.leadId,
      emailInput: buildCustomerEmailInput(result.leadId, submission, input, correlationId),
      correlationId,
      ip,
      sendEmail: true,
    })

    return json({ ok: true, leadId: result.leadId, submissionRef }, 200, request)
  } catch (error) {
    const diagnostic = databaseDiagnostic(error)
    const contactConflict = isProvisionalPhoneConflict(diagnostic)
    const reason = contactConflict ? 'contact_details_conflict' : 'unexpected_save_failure'
    logSubmit({
      correlationId,
      ip,
      stage: contactConflict ? 'identity_conflict' : 'save',
      outcome: 'error',
      reason,
      submissionRef: payload !== null
        ? normalizeSubmissionRef((payload as CalculatorSubmission).submissionRef)
        : undefined,
      ...diagnostic,
    })
    if (payload !== null) {
      await deadLetter({
        correlationId,
        ip,
        stage: contactConflict ? 'identity_conflict' : 'save',
        error: reason,
        payload,
        submissionRef: normalizeSubmissionRef((payload as CalculatorSubmission).submissionRef),
      })
    }
    return json({ error: 'Unable to submit lead' }, 500, request)
  }
}

function buildCustomerEmailInput(
  leadId: string,
  submission: CalculatorSubmission,
  input: ReturnType<typeof mapCalculatorSubmissionToIntakeInput>,
  correlationId: string,
) {
  return {
    leadId,
    to: stringValue(submission.lead?.email),
    customerName: input.clientName,
    estimate: normalizeEstimate(submission.estimate),
    projectType: input.projectType,
    answers: submission.answers,
    correlationId,
  }
}

function scheduleLeadDelivery({
  leadId,
  emailInput,
  correlationId,
  ip,
  sendEmail,
}: {
  leadId: string
  emailInput: ReturnType<typeof buildCustomerEmailInput>
  correlationId: string
  ip: string
  sendEmail: boolean
}) {
  try {
    after(async () => {
      const tasks: Promise<void>[] = [
        (async () => {
          try {
            const sm8 = await syncLeadToServiceM8(leadId)
            logSubmit({
              correlationId,
              ip,
              stage: 'sm8',
              outcome: sm8.ok ? 'accepted' : 'error',
              reason: sm8.ok ? sm8.reference : sm8.error,
            })
          } catch (error) {
            logSubmit({ correlationId, ip, stage: 'sm8', outcome: 'error', reason: errorMessage(error) })
          }
        })(),
      ]

      if (sendEmail) {
        tasks.push((async () => {
          try {
            const emailResult = await sendCustomerEstimateEmail(emailInput)
            logSubmit({
              correlationId,
              ip,
              stage: 'email',
              outcome: emailResult.ok ? 'accepted' : 'error',
              reason: emailResult.ok ? 'queued' : emailResult.error,
            })
          } catch (error) {
            logSubmit({ correlationId, ip, stage: 'email', outcome: 'error', reason: errorMessage(error) })
          }
        })())
      }

      await Promise.all(tasks)
    })
  } catch (schedulingError) {
    logSubmit({ correlationId, ip, stage: 'delivery', outcome: 'error', reason: errorMessage(schedulingError) })
  }
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

async function deadLetter(input: {
  correlationId: string
  ip: string
  stage: string
  error: string
  payload: unknown
  submissionRef: string
}) {
  logSubmit({
    correlationId: input.correlationId,
    ip: input.ip,
    stage: input.stage,
    outcome: 'error',
    reason: input.error,
  })
  await saveLeadSubmitFailure(input)
}

function normalizeSubmissionRef(value: unknown): string {
  const ref = stringValue(value)
  if (/^rgcalc_[a-z0-9]+_[a-z0-9]+$/.test(ref)) return ref
  if (/^calculator:[a-zA-Z0-9:_-]+$/.test(ref)) return ref
  return `calculator:${Date.now()}-${crypto.randomUUID()}`
}

function corsHeaders(request: NextRequest, extra: Record<string, string> = {}) {
  const origin = request.headers.get('origin')
  const allowed = origin && allowedOrigins().includes(origin)
  return {
    ...(allowed ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin',
    ...extra,
  }
}

function validateOrigin(
  request: NextRequest,
  trustedServerRequest = isTrustedServerRequest(request),
): { ok: true } | { ok: false } {
  if (trustedServerRequest) return { ok: true }

  const origin = request.headers.get('origin')
  return origin && allowedOrigins().includes(origin) ? { ok: true } : { ok: false }
}

function isTrustedServerRequest(request: NextRequest): boolean {
  const secret = process.env.CALCULATOR_SUBMIT_SECRET || process.env.RGTOOLS_CALCULATOR_SUBMIT_SECRET
  const provided = request.headers.get('x-rg-calculator-secret')
  return Boolean(secret && provided && provided === secret)
}

function json(body: unknown, status: number, request: NextRequest, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(request, headers),
  })
}

function logSubmit(entry: {
  correlationId: string
  ip: string
  stage: string
  outcome: 'accepted' | 'rejected' | 'error'
  reason: string
  submissionRef?: string
  errorType?: string
  databaseCode?: string
  databaseConstraint?: string
}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    source: 'calculator-submit',
    correlationId: entry.correlationId,
    ip: entry.ip,
    stage: entry.stage,
    outcome: entry.outcome,
    reason: entry.reason,
    ...(entry.submissionRef ? { submissionRef: entry.submissionRef } : {}),
    ...(entry.errorType ? { errorType: entry.errorType } : {}),
    ...(entry.databaseCode ? { databaseCode: entry.databaseCode } : {}),
    ...(entry.databaseConstraint ? { databaseConstraint: entry.databaseConstraint } : {}),
  }

  if (entry.outcome === 'error') console.error(JSON.stringify(logEntry))
  else if (entry.outcome === 'rejected') console.warn(JSON.stringify(logEntry))
  else console.info(JSON.stringify(logEntry))
}
