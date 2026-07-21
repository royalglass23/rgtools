import { db } from '@/lib/db'
import { leadEmailLog } from '@rgtools/db/schema-leads'
import { errorMessage } from '@/lib/error-message'
import type { CalculatorEstimateForEmail } from '@/modules/lead-intake/calculator/map-calculator-submission'

type FetchFn = typeof fetch

export type CustomerEstimateEmailInput = {
  leadId: string
  to: string
  customerName: string
  estimate: CalculatorEstimateForEmail
  projectType: string
  answers?: Record<string, unknown>
  correlationId: string
  fetchFn?: FetchFn
}

export type CustomerEstimateEmailResult =
  | { ok: true; skipped?: false; providerMessageId?: string }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string }

export async function sendCustomerEstimateEmail(
  input: CustomerEstimateEmailInput,
): Promise<CustomerEstimateEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM

  if (!apiKey || !from) {
    await logEmail(input, { status: 'skipped', error: 'RESEND_API_KEY or RESEND_FROM is not configured' })
    return { ok: true, skipped: true, reason: 'resend-not-configured' }
  }

  try {
    const response = await (input.fetchFn ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: `${input.customerName || 'Your'} Royal Glass estimate is here`,
        html: renderCustomerEstimateEmail(input),
      }),
    })

    const json = await response.json().catch(() => ({})) as { id?: string; message?: string }
    if (!response.ok) {
      const error = json.message || `Resend email failed with HTTP ${response.status}`
      await logEmail(input, { status: 'failed', error })
      return { ok: false, error }
    }

    await logEmail(input, { status: 'sent', providerMessageId: json.id })
    return { ok: true, providerMessageId: json.id }
  } catch (error) {
    const message = errorMessage(error)
    await logEmail(input, { status: 'failed', error: message })
    return { ok: false, error: message }
  }
}

const PROJECT_LABELS: Record<string, string> = {
  ground_level: 'Ground Level Fence',
  balcony_balustrade: 'Balcony / Patio Balustrade',
  premium_pool_fence: 'Premium Pool Fence',
  stair_balustrade: 'Stair Balustrade',
}

const GLASS_TYPE_LABELS: Record<string, string> = {
  toughened_12mm: '12mm Toughened + Capping',
  laminated: 'Laminated Glass',
}

const GLASS_COLOUR_LABELS: Record<string, string> = {
  clear: 'Clear',
  low_iron: 'Low Iron / Ultra-Clear',
  tinted: 'Tinted',
  frosted: 'Frosted',
}

const FIXING_LABELS: Record<string, string> = {
  spigot_round: 'Spigot Round',
  standoff_posts: 'Stand-off Posts',
  viking: 'Viking System',
  jh_clamps: 'JH Clamps',
  side_channel: 'Side Channel',
  top_channel: 'Top Channel',
  aluminium_1: 'Aluminium 1',
  aluminium_2: 'Aluminium 2',
  sed: 'SED (Special Engineer Design)',
}

const FINISH_LABELS: Record<string, string> = {
  standard_chrome: 'Standard chrome',
  matte_black: 'Matte black',
  brushed_chrome: 'Brushed chrome',
  powder_coated: 'Powder coated',
  not_sure: 'To be confirmed',
}

function str(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function renderCustomerEstimateEmail(input: CustomerEstimateEmailInput): string {
  const a = input.answers ?? {}
  const scenario = str(a.scenario)
  const project = PROJECT_LABELS[input.projectType] ?? PROJECT_LABELS[scenario] ?? 'Glass Project'
  const length = Math.round(Number(a.length)) || 0
  const name = escapeHtml(input.customerName || 'there')

  const low = `$${input.estimate.low.toLocaleString()}`
  const high = `$${input.estimate.high.toLocaleString()}`
  const estSub = `Excluding GST${length > 0 ? ` · based on ${length}m effective length` : ''}`

  // Project summary rows
  const summaryRows: [string, string][] = []
  summaryRows.push(['Project type', project])
  if (length > 0) summaryRows.push(['Length', `${length}m`])
  if (scenario !== 'stair_balustrade' && str(a.corners)) summaryRows.push(['Corners', str(a.corners)])
  if (scenario === 'premium_pool_fence' && str(a.gates)) summaryRows.push(['Gates', str(a.gates)])
  const glassType = str(a.glassType)
  if (glassType) summaryRows.push(['Glass type', GLASS_TYPE_LABELS[glassType] ?? glassType])
  const glassColour = str(a.glassColour)
  if (glassColour) summaryRows.push(['Glass colour', GLASS_COLOUR_LABELS[glassColour] ?? glassColour])
  const fixing = str(a.fixingMethod) || str(a.fixing)
  if (fixing) summaryRows.push(['Fixing method', FIXING_LABELS[fixing] ?? fixing])
  const finish = str(a.hardwareFinish) || str(a.hardware)
  if (finish) summaryRows.push(['Hardware finish', FINISH_LABELS[finish] ?? finish])

  const rowsHtml = summaryRows.map(([label, value], i) => {
    const border = i < summaryRows.length - 1 ? '1px solid #f3f4f6' : 'none'
    return `<tr>
  <td style="padding:9px 0;color:#6b7280;font-size:13px;border-bottom:${border};">${escapeHtml(label)}</td>
  <td style="padding:9px 0;color:#111827;font-size:13px;font-weight:500;text-align:right;border-bottom:${border};">${escapeHtml(value)}</td>
</tr>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Your Royal Glass Estimate</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:32px auto;padding:0 12px 40px;">
<div style="border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">

<!-- Header -->
<div style="background:linear-gradient(135deg,#152f4a 0%,#1a3c5e 55%,#20496f 100%);padding:40px 36px 36px;">
  <p style="color:#7cb9f5;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 10px 0;">Royal Glass Limited</p>
  <h1 style="color:#ffffff;font-size:27px;font-weight:700;margin:0;line-height:1.3;">Your ${escapeHtml(project)} estimate<br>is ready, ${name}.</h1>
</div>

<!-- Body -->
<div style="background:#ffffff;padding:36px;">

  <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 26px 0;">
    We've looked at your project details and we know exactly what needs to happen to make this a success.
    This is the kind of work we do every single day &mdash; and we're genuinely good at it.
  </p>

  <!-- Estimate band -->
  <div style="background:linear-gradient(135deg,#152f4a 0%,#1a3c5e 100%);border-radius:14px;margin:0 0 30px 0;padding:30px 28px;text-align:center;">
    <p style="color:#7cb9f5;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 12px 0;">Your indicative estimate</p>
    <p style="color:#ffffff;font-size:38px;font-weight:700;margin:0 0 4px 0;letter-spacing:-0.02em;">${low} &ndash; ${high}</p>
    <p style="color:#7cb9f5;font-size:13px;margin:6px 0 0 0;">${escapeHtml(estSub)}</p>
  </div>

  <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 16px 0;">
    <strong style="color:#1a3c5e;">You don't need to worry about a thing from here.</strong>
    NZ Building Code compliance, producer statements, council paperwork &mdash; we handle all of it, end to end.
  </p>

  <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 28px 0;">
    We've completed hundreds of projects just like yours across Auckland and we know how to get it right &mdash;
    on time, on budget, and looking exactly how you envisioned it.
  </p>

  <!-- Steps -->
  <div style="background:#f8fafc;border:1px solid #e5eaf0;border-radius:12px;padding:26px;margin:0 0 30px 0;">
    <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 20px 0;">What happens from here</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="38" valign="top" style="padding-bottom:18px;">
          <div style="background:#1a3c5e;color:#fff;font-size:12px;font-weight:700;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;">1</div>
        </td>
        <td valign="top" style="padding-bottom:18px;padding-left:8px;">
          <p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 4px 0;">We'll be in touch within 1 business day</p>
          <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.6;">One of our team will call to answer any questions and lock in a time to visit your site.</p>
        </td>
      </tr>
      <tr>
        <td width="38" valign="top" style="padding-bottom:18px;">
          <div style="background:#1a3c5e;color:#fff;font-size:12px;font-weight:700;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;">2</div>
        </td>
        <td valign="top" style="padding-bottom:18px;padding-left:8px;">
          <p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 4px 0;">Site visit &mdash; no obligation, no pressure</p>
          <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.6;">We come to you, take precise measurements, and sort out every site-specific detail on the spot.</p>
        </td>
      </tr>
      <tr>
        <td width="38" valign="top">
          <div style="background:#1a3c5e;color:#fff;font-size:12px;font-weight:700;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;">3</div>
        </td>
        <td valign="top" style="padding-left:8px;">
          <p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 4px 0;">A clear, fixed-price quote in writing</p>
          <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.6;">No surprises, no hidden costs. You'll know exactly what you're getting before you commit to anything.</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin:0 0 36px 0;">
    <a href="tel:0800769254" style="display:inline-block;background:#1a3c5e;color:#ffffff;font-size:15px;font-weight:600;padding:15px 34px;border-radius:9px;text-decoration:none;letter-spacing:0.01em;">Call us: 0800 769 254</a>
    <p style="font-size:13px;color:#9ca3af;margin:10px 0 0 0;">Or just reply to this email &mdash; we read every one.</p>
  </div>

  <!-- Project summary -->
  ${rowsHtml ? `<div style="border-top:1px solid #e5e7eb;padding-top:24px;">
    <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 14px 0;">Your project summary</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rowsHtml}
    </table>
  </div>` : ''}

</div>

<!-- Footer -->
<div style="background:#f8fafc;border-top:1px solid #e5eaf0;padding:22px 36px;text-align:center;">
  <p style="font-size:13px;color:#374151;font-weight:600;margin:0 0 5px 0;">Royal Glass Limited</p>
  <p style="font-size:12px;color:#9ca3af;margin:0 0 5px 0;">13E Paul Matthews Road, Rosedale, Auckland 0632</p>
  <p style="font-size:12px;margin:0 0 12px 0;">
    <a href="tel:0800769254" style="color:#1a3c5e;text-decoration:none;font-weight:500;">0800 769 254</a>
    &nbsp;&middot;&nbsp;
    <a href="https://royalglass.co.nz" style="color:#1a3c5e;text-decoration:none;font-weight:500;">royalglass.co.nz</a>
  </p>
  <p style="font-size:11px;color:#d1d5db;margin:0;">This is an indicative estimate only. Final pricing is confirmed after our free site visit. Prices exclude GST.</p>
</div>

</div>
</div>
</body>
</html>`
}

async function logEmail(
  input: CustomerEstimateEmailInput,
  result: { status: string; providerMessageId?: string; error?: string },
) {
  await db.insert(leadEmailLog).values({
    leadId: input.leadId,
    recipient: input.to,
    status: result.status,
    providerMessageId: result.providerMessageId ?? null,
    error: result.error ?? null,
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
