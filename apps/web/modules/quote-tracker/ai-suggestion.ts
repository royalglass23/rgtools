import { currentQuoteStats } from '@/modules/quote-tracker/current-stats'
import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  runAiGuidanceGeneration,
  type AiGuidanceFailureRecord,
} from '@/modules/ai-guidance/runtime'
import { quoteAiGenerationFailures, quoteAiSuggestions, quoteConversationSnapshots, quoteEngagement, quoteEvents, quotes } from '@rgtools/db/schema'
import { classifyQuoteSignal, type QuoteSignalClassification, type QuoteSignalConversationSnapshot, type QuoteSignalEngagement, type QuoteSignalQuote } from './quote-signals'
import { formatDateTime } from './presentation'
import { AI_GUIDANCE_TIMEOUT_MESSAGE, fetchAiGuidanceOpenAi, isAiGuidanceTimeoutError } from './ai-timeout'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const AI_SUGGESTION_PROMPT_VERSION = 'quote-ai-guidance-v1'
export const AI_SUGGESTION_INPUT_VERSION = 'quote-ai-guidance-input-v1'
export {
  AI_GUIDANCE_FAILURE_COOLDOWN_MS,
  AI_GUIDANCE_REGENERATION_COOLDOWN_MS,
} from '@/modules/ai-guidance/runtime'

export const RECOMMENDED_MOVES = [
  'call today',
  'send follow-up email',
  'wait',
  'clarify scope',
  'update quote',
  'involve decision-maker',
  'close loop',
  'low priority',
] as const

export const CONFIDENCE_LEVELS = ['Low', 'Medium', 'High'] as const

const AI_SUGGESTION_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'quote_ai_suggestion',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'nextViableMove',
        'recommendedMove',
        'suggestedTiming',
        'timingReason',
        'confidence',
        'confidenceReason',
        'likelyCustomerState',
        'reasoning',
        'emailDraft',
        'phoneTalkingPoints',
        'suggestedWinPath',
        'useCareGuidance',
        'partialContextNote',
        'waitRecommendation',
      ],
      properties: {
        nextViableMove: { type: 'string' },
        recommendedMove: { type: 'string', enum: RECOMMENDED_MOVES },
        suggestedTiming: { type: 'string' },
        timingReason: { type: 'string' },
        confidence: { type: 'string', enum: CONFIDENCE_LEVELS },
        confidenceReason: { type: 'string' },
        likelyCustomerState: { type: 'string' },
        reasoning: { type: 'string' },
        emailDraft: {
          type: 'object',
          additionalProperties: false,
          required: ['subject', 'body', 'includeQuoteLink'],
          properties: {
            subject: { type: 'string' },
            body: { type: 'string' },
            includeQuoteLink: { type: 'boolean' },
          },
        },
        phoneTalkingPoints: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
        },
        suggestedWinPath: { type: 'string' },
        useCareGuidance: { type: 'string' },
        partialContextNote: { type: ['string', 'null'] },
        waitRecommendation: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['reason', 'revisitWindow', 'watchForSignals'],
          properties: {
            reason: { type: 'string' },
            revisitWindow: { type: 'string' },
            watchForSignals: {
              type: 'array',
              minItems: 1,
              items: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const

export type RecommendedMove = (typeof RECOMMENDED_MOVES)[number]
export type SuggestionConfidence = (typeof CONFIDENCE_LEVELS)[number]

export type AiSuggestionQuote = QuoteSignalQuote & {
  shortCode: string | null
}

export type AiSuggestionConversationSnapshot = {
  id: string
  createdAt: Date
  sourceStatus: string
  safeError: string | null
  structuredSummary: unknown
}

export type AiSuggestionPromptInput = {
  quote: AiSuggestionQuote
  engagement: QuoteSignalEngagement
  signal: QuoteSignalClassification
  conversationSnapshot: AiSuggestionConversationSnapshot | null
  generatedAt: string
}

export type ValidatedAiSuggestion = {
  nextViableMove: string
  recommendedMove: RecommendedMove
  suggestedTiming: string
  timingReason: string
  confidence: SuggestionConfidence
  confidenceReason: string
  likelyCustomerState: string
  reasoning: string
  emailDraft: {
    subject: string
    body: string
    includeQuoteLink: boolean
  }
  phoneTalkingPoints: string[]
  suggestedWinPath: string
  useCareGuidance: string
  partialContextNote: string | null
  waitRecommendation: {
    reason: string
    revisitWindow: string
    watchForSignals: string[]
  } | null
}

export type AiSuggestionRecord = {
  quoteId: string
  conversationSnapshotId: string | null
  triggeredByUserId: string
  nextViableMove: string
  suggestedWinPath: string
  signalBucket: string
  signalLabel: string
  analyticsSnapshot: unknown
  recommendationKind: string
  revisitAt: Date | null
  watchForSignals: string[]
  staleAt: Date | null
  staleReason: string | null
  recommendedMove: RecommendedMove
  suggestedTiming: string
  timingReason: string
  confidence: SuggestionConfidence
  confidenceReason: string
  likelyCustomerState: string
  reasoning: string
  emailDraftSubject: string
  emailDraftBody: string
  phoneTalkingPoints: string[]
  useCareGuidance: string
  includeQuoteLink: boolean
  partialContextNote: string | null
  waitReason: string | null
  waitRevisitWindow: string | null
  model: string
  promptVersion: string
  inputSnapshotVersion: string
  createdAt: Date
}

export type AiSuggestionDeps = {
  findQuote: (quoteId: string) => Promise<AiSuggestionQuote | null>
  findEngagement: (quoteId: string) => Promise<QuoteSignalEngagement>
  findLatestConversationSnapshot: (quoteId: string) => Promise<AiSuggestionConversationSnapshot | null>
  findLatestSuggestion: (quoteId: string) => Promise<{ createdAt: Date } | null>
  findLatestFailure: (quoteId: string) => Promise<{ retryAfter: Date | null; errorMessage: string } | null>
  generateSuggestion: (input: AiSuggestionPromptInput) => Promise<unknown>
  insertSuggestion: (record: AiSuggestionRecord) => Promise<{ id: string }>
  recordFailure: (input: {
    quoteId: string
    conversationSnapshotId: string | null
  } & AiGuidanceFailureRecord) => Promise<void>
  now: () => Date
  model: string
}

export type GenerateAiSuggestionResult =
  | { ok: true; suggestionId: string }
  | { ok: false; message: string }

export async function generateAiSuggestionForQuote(
  input: { quoteId: string; triggeredByUserId: string },
  deps: AiSuggestionDeps = realAiSuggestionDeps,
): Promise<GenerateAiSuggestionResult> {
  if (!UUID_RE.test(input.quoteId) || !UUID_RE.test(input.triggeredByUserId)) {
    return { ok: false, message: 'Tracked Quote not found.' }
  }

  const quote = await deps.findQuote(input.quoteId)
  if (!quote) return { ok: false, message: 'Tracked Quote not found.' }

  const latestSuggestion = await deps.findLatestSuggestion(input.quoteId)
  const latestFailure = await deps.findLatestFailure(input.quoteId)

  type AiSuggestionRuntimeContext = {
    quote: AiSuggestionQuote
    engagement: QuoteSignalEngagement
    conversationSnapshot: AiSuggestionConversationSnapshot | null
    signal: QuoteSignalClassification
  }

  const result = await runAiGuidanceGeneration<AiSuggestionRuntimeContext, ValidatedAiSuggestion, { id: string }>({
    stage: 'ai_suggestion',
    model: deps.model,
    promptVersion: AI_SUGGESTION_PROMPT_VERSION,
    inputSnapshotVersion: AI_SUGGESTION_INPUT_VERSION,
    triggeredByUserId: input.triggeredByUserId,
    now: deps.now,
    latestSuccessAt: latestSuggestion?.createdAt ?? null,
    latestFailureRetryAfter: latestFailure?.retryAfter ?? null,
    formatDateTime,
    async buildContext({ generatedAt }) {
      const [engagement, conversationSnapshot] = await Promise.all([
        deps.findEngagement(input.quoteId),
        deps.findLatestConversationSnapshot(input.quoteId),
      ])
      const signal = classifyQuoteSignal({
        quote,
        engagement,
        conversationSnapshot: toSignalConversationSnapshot(conversationSnapshot),
        now: generatedAt,
      })

      return {
        quote,
        engagement,
        conversationSnapshot,
        signal,
      }
    },
    generate: ({ context, generatedAt }) => deps.generateSuggestion({
      quote: context.quote,
      engagement: context.engagement,
      signal: context.signal,
      conversationSnapshot: context.conversationSnapshot,
      generatedAt: generatedAt.toISOString(),
    }),
    validate: validateAiSuggestionOutput,
    async save({ context, output: suggestion, generatedAt, metadata }) {
      const partialContextNote = context.conversationSnapshot?.sourceStatus === 'partial'
        ? suggestion.partialContextNote ?? context.conversationSnapshot.safeError ?? 'Generated with partial Conversation Snapshot context.'
        : suggestion.partialContextNote
      const record: AiSuggestionRecord = {
        quoteId: input.quoteId,
        conversationSnapshotId: context.conversationSnapshot?.id ?? null,
        triggeredByUserId: input.triggeredByUserId,
        nextViableMove: suggestion.nextViableMove,
        suggestedWinPath: suggestion.suggestedWinPath,
        signalBucket: context.signal.bucket,
        signalLabel: context.signal.label,
        analyticsSnapshot: context.signal.analyticsSnapshot,
        recommendationKind: context.signal.recommendation.kind,
        revisitAt: context.signal.recommendation.revisitAt ? new Date(context.signal.recommendation.revisitAt) : null,
        watchForSignals: suggestion.waitRecommendation?.watchForSignals ?? context.signal.recommendation.watchForSignals,
        staleAt: null,
        staleReason: null,
        recommendedMove: suggestion.recommendedMove,
        suggestedTiming: suggestion.suggestedTiming,
        timingReason: suggestion.timingReason,
        confidence: suggestion.confidence,
        confidenceReason: suggestion.confidenceReason,
        likelyCustomerState: suggestion.likelyCustomerState,
        reasoning: suggestion.reasoning,
        emailDraftSubject: suggestion.emailDraft.subject,
        emailDraftBody: suggestion.emailDraft.body,
        phoneTalkingPoints: suggestion.phoneTalkingPoints,
        useCareGuidance: suggestion.useCareGuidance,
        includeQuoteLink: suggestion.emailDraft.includeQuoteLink,
        partialContextNote,
        waitReason: suggestion.waitRecommendation?.reason ?? null,
        waitRevisitWindow: suggestion.waitRecommendation?.revisitWindow ?? null,
        model: metadata.model,
        promptVersion: metadata.promptVersion,
        inputSnapshotVersion: metadata.inputSnapshotVersion ?? AI_SUGGESTION_INPUT_VERSION,
        createdAt: generatedAt,
      }

      return deps.insertSuggestion(record)
    },
    recordFailure: (failure, { context }) => deps.recordFailure({
      ...failure,
      quoteId: input.quoteId,
      conversationSnapshotId: context?.conversationSnapshot?.id ?? null,
    }),
    classifyError: classifyAiSuggestionError,
    safeErrorMessage,
  })

  if (!result.ok) return result
  return { ok: true, suggestionId: result.saved.id }
}

export const realAiSuggestionDeps: AiSuggestionDeps = {
  async findQuote(quoteId) {
    const [quote] = await db
      .select({
        id: quotes.id,
        quoteValue: quotes.quoteValue,
        statusTag: currentQuoteStats().statusTag,
        interestScore: currentQuoteStats().aiScore,
        createdAt: quotes.createdAt,
        expiresAt: quotes.expiresAt,
        archivedAt: quotes.archivedAt,
        updatedAt: quotes.updatedAt,
        ownerUserId: quotes.ownerUserId,
        clientName: quotes.clientName,
        companyName: quotes.companyName,
        jobDescription: quotes.jobDescription,
        jobAddress: quotes.jobAddress,
        shortCode: quotes.shortCode,
      })
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1)

    return quote ?? null
  },
  async findEngagement(quoteId) {
    const [engagement] = await db
      .select()
      .from(quoteEngagement)
      .where(eq(quoteEngagement.quoteId, quoteId))
      .limit(1)
    const events = await db
      .select({
        eventType: quoteEvents.eventType,
        sessionId: quoteEvents.sessionId,
        durationMs: quoteEvents.durationMs,
        scrollDepth: quoteEvents.scrollDepth,
        createdAt: quoteEvents.createdAt,
      })
      .from(quoteEvents)
      .where(eq(quoteEvents.quoteId, quoteId))

    const openEvents = events.filter((event) => event.eventType === 'open')
    const openDays = new Set(openEvents.map((event) => event.createdAt.toISOString().slice(0, 10)))

    return {
      totalOpens: engagement?.totalOpens ?? openEvents.length,
      uniqueViewers: engagement?.uniqueSessions ?? new Set(events.map((event) => event.sessionId)).size,
      totalTimeMs: engagement?.totalTimeMs ?? events.reduce((sum, event) => sum + (event.durationMs ?? 0), 0),
      maxScrollDepth: engagement?.maxScrollDepth ?? Math.max(0, ...events.map((event) => event.scrollDepth ?? 0)),
      hasDownload: events.some((event) => event.eventType === 'download'),
      hasCta: events.some((event) => event.eventType === 'cta'),
      forwardingSuspected: engagement?.forwardingSuspected ?? false,
      hasReturnVisit: openDays.size >= 2,
      lastOpenedAt: engagement?.lastOpenedAt ?? openEvents.at(-1)?.createdAt ?? null,
    }
  },
  async findLatestConversationSnapshot(quoteId) {
    const [snapshot] = await db
      .select({
        id: quoteConversationSnapshots.id,
        createdAt: quoteConversationSnapshots.createdAt,
        sourceStatus: quoteConversationSnapshots.sourceStatus,
        safeError: quoteConversationSnapshots.safeError,
        structuredSummary: quoteConversationSnapshots.structuredSummary,
      })
      .from(quoteConversationSnapshots)
      .where(eq(quoteConversationSnapshots.quoteId, quoteId))
      .orderBy(desc(quoteConversationSnapshots.createdAt))
      .limit(1)

    return snapshot ?? null
  },
  async findLatestFailure(quoteId) {
    const [failure] = await db
      .select({
        retryAfter: quoteAiGenerationFailures.retryAfter,
        errorMessage: quoteAiGenerationFailures.errorMessage,
      })
      .from(quoteAiGenerationFailures)
      .where(and(
        eq(quoteAiGenerationFailures.quoteId, quoteId),
        eq(quoteAiGenerationFailures.failureStage, 'ai_suggestion'),
      ))
      .orderBy(desc(quoteAiGenerationFailures.createdAt))
      .limit(1)

    return failure ?? null
  },
  async findLatestSuggestion(quoteId) {
    const [suggestion] = await db
      .select({
        createdAt: quoteAiSuggestions.createdAt,
      })
      .from(quoteAiSuggestions)
      .where(eq(quoteAiSuggestions.quoteId, quoteId))
      .orderBy(desc(quoteAiSuggestions.createdAt))
      .limit(1)

    return suggestion ?? null
  },
  generateSuggestion: generateAiSuggestionJson,
  async insertSuggestion(record) {
    const [suggestion] = await db
      .insert(quoteAiSuggestions)
      .values(record)
      .returning({ id: quoteAiSuggestions.id })

    if (!suggestion) throw new Error('AI Suggestion was not saved')
    return suggestion
  },
  async recordFailure(input) {
    await db.insert(quoteAiGenerationFailures).values(input)
  },
  now: () => new Date(),
  model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
}

async function generateAiSuggestionJson(input: AiSuggestionPromptInput): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const response = await fetchAiGuidanceOpenAi('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: realAiSuggestionDeps.model,
      response_format: AI_SUGGESTION_RESPONSE_FORMAT,
      messages: [
        {
          role: 'system',
          content: [
            'You generate Royal Glass Next Viable Move guidance as JSON matching the provided schema.',
            `recommendedMove must be one of: ${RECOMMENDED_MOVES.join(', ')}.`,
            'confidence must be Low, Medium, or High. Never use a percentage.',
            'Return exactly one emailDraft subject/body and always include phoneTalkingPoints.',
            'If recommendedMove is wait, waitRecommendation must contain a reason, revisitWindow, and watchForSignals; otherwise use null unless wait guidance is still useful.',
            'Use null for partialContextNote unless the Conversation Snapshot sourceStatus is partial.',
            'Do not imply staff can see personal tracking details; reference engagement generally.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            promptVersion: AI_SUGGESTION_PROMPT_VERSION,
            inputSnapshotVersion: AI_SUGGESTION_INPUT_VERSION,
            input,
          }),
        },
      ],
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenAI AI Suggestion failed with HTTP ${response.status}${body ? `: ${body}` : ''}`)
  }

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI AI Suggestion response did not include JSON')
  return JSON.parse(content)
}

function validateAiSuggestionOutput(value: unknown): ValidatedAiSuggestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI Suggestion output was not valid JSON')
  }

  const candidate = value as Record<string, unknown>
  const emailDraft = candidate.emailDraft
  const waitRecommendation = candidate.waitRecommendation
  const recommendedMove = requireEnum(candidate.recommendedMove, RECOMMENDED_MOVES, 'recommendedMove')
  const confidence = requireEnum(candidate.confidence, CONFIDENCE_LEVELS, 'confidence')

  if (!emailDraft || typeof emailDraft !== 'object' || Array.isArray(emailDraft)) {
    throw new Error('AI Suggestion output missing emailDraft')
  }
  const email = emailDraft as Record<string, unknown>
  const parsedWait = parseWaitRecommendation(waitRecommendation, recommendedMove)

  return {
    nextViableMove: requireString(candidate.nextViableMove, 'nextViableMove'),
    recommendedMove,
    suggestedTiming: requireString(candidate.suggestedTiming, 'suggestedTiming'),
    timingReason: requireString(candidate.timingReason, 'timingReason'),
    confidence,
    confidenceReason: requireString(candidate.confidenceReason, 'confidenceReason'),
    likelyCustomerState: requireString(candidate.likelyCustomerState, 'likelyCustomerState'),
    reasoning: requireString(candidate.reasoning, 'reasoning'),
    emailDraft: {
      subject: requireString(email.subject, 'emailDraft.subject'),
      body: requireString(email.body, 'emailDraft.body'),
      includeQuoteLink: requireBoolean(email.includeQuoteLink, 'emailDraft.includeQuoteLink'),
    },
    phoneTalkingPoints: requireStringArray(candidate.phoneTalkingPoints, 'phoneTalkingPoints', { min: 1 }),
    suggestedWinPath: requireString(candidate.suggestedWinPath, 'suggestedWinPath'),
    useCareGuidance: requireString(candidate.useCareGuidance, 'useCareGuidance'),
    partialContextNote: requireNullableString(candidate.partialContextNote, 'partialContextNote'),
    waitRecommendation: parsedWait,
  }
}

function parseWaitRecommendation(value: unknown, recommendedMove: RecommendedMove): ValidatedAiSuggestion['waitRecommendation'] {
  if (recommendedMove !== 'wait') {
    if (value == null) return null
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('AI Suggestion output missing waitRecommendation')
    }
    return {
      reason: requireString((value as Record<string, unknown>).reason, 'waitRecommendation.reason'),
      revisitWindow: requireString((value as Record<string, unknown>).revisitWindow, 'waitRecommendation.revisitWindow'),
      watchForSignals: requireStringArray((value as Record<string, unknown>).watchForSignals, 'waitRecommendation.watchForSignals', { min: 1 }),
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI Suggestion wait recommendation missing waitRecommendation')
  }

  const wait = value as Record<string, unknown>
  return {
    reason: requireString(wait.reason, 'waitRecommendation.reason'),
    revisitWindow: requireString(wait.revisitWindow, 'waitRecommendation.revisitWindow'),
    watchForSignals: requireStringArray(wait.watchForSignals, 'waitRecommendation.watchForSignals', { min: 1 }),
  }
}

function requireString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`AI Suggestion output missing ${key}`)
  }
  return value
}

function requireNullableString(value: unknown, key: string): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new Error(`AI Suggestion output missing ${key}`)
}

function requireBoolean(value: unknown, key: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`AI Suggestion output missing ${key}`)
  return value
}

function requireStringArray(value: unknown, key: string, options: { min?: number } = {}): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`AI Suggestion output missing ${key}`)
  }
  if (options.min && value.length < options.min) throw new Error(`AI Suggestion output missing ${key}`)
  return value
}

function requireEnum<T extends readonly string[]>(value: unknown, allowed: T, key: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`AI Suggestion output has invalid ${key}`)
  }
  return value as T[number]
}

function toSignalConversationSnapshot(
  snapshot: AiSuggestionConversationSnapshot | null,
): QuoteSignalConversationSnapshot {
  if (!snapshot) return null
  type SignalSnapshotSummary = NonNullable<QuoteSignalConversationSnapshot>['structuredSummary']
  const structuredSummary = snapshot.structuredSummary && typeof snapshot.structuredSummary === 'object'
    ? snapshot.structuredSummary as SignalSnapshotSummary
    : null

  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    structuredSummary,
  }
}

function safeErrorMessage(error: unknown): string {
  if (isAiGuidanceTimeoutError(error)) return AI_GUIDANCE_TIMEOUT_MESSAGE
  if (error instanceof SyntaxError) return 'AI Suggestion response was not valid JSON.'
  if (error instanceof Error && error.message) {
    const httpMatch = error.message.match(/HTTP\s+(\d{3})/)
    if (httpMatch) return `AI provider returned HTTP ${httpMatch[1]}.`
    return error.message.slice(0, 300)
  }
  return 'AI Suggestion generation failed.'
}

function classifyAiSuggestionError(error: unknown): string {
  if (isAiGuidanceTimeoutError(error)) return 'timeout'
  if (error instanceof SyntaxError) return 'malformed_json'
  if (!(error instanceof Error)) return 'generation_error'
  if (error.message.includes('OPENAI_API_KEY')) return 'configuration_error'
  if (error.message.includes('HTTP')) return 'ai_response_error'
  if (error.message.includes('was not saved')) return 'save_error'
  if (error.message.startsWith('AI Suggestion output')) return 'validation_error'
  return 'generation_error'
}
