export type StatusTag = 'hot' | 'warm' | 'cold' | 'dead'

export type EngagementData = {
  totalOpens: number
  totalTimeMs: number
  maxScrollDepth: number
  uniqueSessions: number
  uniqueDevices: number
  forwardingSuspected: boolean
  hasCta: boolean
  hasReturnVisit: boolean
  createdAt?: Date
}

export const STATUS_TAG_RULES: Record<StatusTag, string> = {
  hot: '30+ sec active time with 75%+ scroll, 45+ sec with 50%+ scroll, or 2+ opens with meaningful engagement.',
  warm: '20+ sec active time or 30%+ scroll without a Hot signal.',
  cold: 'Opened, but engagement is still low or incomplete.',
  dead: 'Never opened after 3+ days since creation.',
}

const DAY_MS = 24 * 60 * 60 * 1000
const SECOND_MS = 1000
const HOT_QUICK_REVIEW_TIME_MS = 30 * SECOND_MS
const HOT_QUICK_REVIEW_SCROLL_DEPTH = 75
const HOT_STEADY_REVIEW_TIME_MS = 45 * SECOND_MS
const HOT_STEADY_REVIEW_SCROLL_DEPTH = 50
const HOT_REPEAT_OPEN_TIME_MS = 30 * SECOND_MS
const HOT_REPEAT_OPEN_SCROLL_DEPTH = 30
const WARM_MIN_TIME_MS = 20 * SECOND_MS
const WARM_MIN_SCROLL_DEPTH = 30

export const ENGAGEMENT_THRESHOLDS = {
  quickTime: HOT_QUICK_REVIEW_TIME_MS, quickScroll: HOT_QUICK_REVIEW_SCROLL_DEPTH,
  steadyTime: HOT_STEADY_REVIEW_TIME_MS, steadyScroll: HOT_STEADY_REVIEW_SCROLL_DEPTH,
  repeatTime: HOT_REPEAT_OPEN_TIME_MS, repeatScroll: HOT_REPEAT_OPEN_SCROLL_DEPTH,
  warmTime: WARM_MIN_TIME_MS, warmScroll: WARM_MIN_SCROLL_DEPTH,
} as const

export function computeScore(e: EngagementData): number {
  const raw =
    e.totalOpens * 10 +
    (Math.max(0, e.maxScrollDepth) / 100) * 20 +
    e.uniqueDevices * 10 +
    (e.forwardingSuspected ? 15 : 0) +
    (e.hasCta ? 25 : 0)

  return Math.min(100, Math.max(0, Math.round(raw)))
}

export function computeStatusTag(e: EngagementData): StatusTag {
  const hasPrimaryHotSignal =
    (e.totalTimeMs >= HOT_QUICK_REVIEW_TIME_MS && e.maxScrollDepth >= HOT_QUICK_REVIEW_SCROLL_DEPTH) ||
    (e.totalTimeMs >= HOT_STEADY_REVIEW_TIME_MS && e.maxScrollDepth >= HOT_STEADY_REVIEW_SCROLL_DEPTH) ||
    (e.totalOpens >= 2 && (e.totalTimeMs >= HOT_REPEAT_OPEN_TIME_MS || e.maxScrollDepth >= HOT_REPEAT_OPEN_SCROLL_DEPTH))

  const hasSecondaryHotSignal =
    e.hasReturnVisit ||
    e.hasCta ||
    e.forwardingSuspected ||
    e.uniqueDevices >= 2

  if (
    hasPrimaryHotSignal ||
    hasSecondaryHotSignal
  ) {
    return 'hot'
  }

  if (e.totalOpens > 0 && (e.totalTimeMs >= WARM_MIN_TIME_MS || e.maxScrollDepth >= WARM_MIN_SCROLL_DEPTH)) {
    return 'warm'
  }

  if (e.totalOpens > 0) {
    return 'cold'
  }

  if (e.createdAt && Date.now() - e.createdAt.getTime() >= 3 * DAY_MS) {
    return 'dead'
  }

  return 'cold'
}
