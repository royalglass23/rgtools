import type { StatusTag } from './score'

export type AttentionCandidate = {
  id: string
  clientName: string
  workOrderId: string | null
  statusTag: StatusTag | null
  totalOpens: number | null
  forwardingSuspected: boolean | null
  lastOpenedAt: Date | null
  expiresAt: Date | null
}

export type AttentionRow = AttentionCandidate & { reasons: string[] }

export const OVERVIEW_PAGE_SIZES = [5, 10, 20, 50] as const
export type OverviewPageSize = typeof OVERVIEW_PAGE_SIZES[number]
export type OverviewPageRequest = { page: number; size: OverviewPageSize }
export type OverviewPaging = { activity: OverviewPageRequest; attention: OverviewPageRequest }

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function pageNumber(value: string | string[] | undefined) {
  const parsed = Number(first(value))
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function pageSize(value: string | string[] | undefined): OverviewPageSize {
  const parsed = Number(first(value))
  return OVERVIEW_PAGE_SIZES.find((size) => size === parsed) ?? 5
}

export function parseOverviewPaging(params: SearchParams): OverviewPaging {
  return {
    activity: { page: pageNumber(params.activityPage), size: pageSize(params.activitySize) },
    attention: { page: pageNumber(params.attentionPage), size: pageSize(params.attentionSize) },
  }
}

export function pageBounds(total: number, request: OverviewPageRequest) {
  const pageCount = Math.max(1, Math.ceil(total / request.size))
  const page = Math.min(request.page, pageCount)
  return { total, page, size: request.size, pageCount, offset: (page - 1) * request.size }
}

export function buildAttentionRows(candidates: AttentionCandidate[], now: Date): AttentionRow[] {
  const expiryCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const rows: AttentionRow[] = []

  for (const row of candidates) {
    const reasons: string[] = []
    if ((row.totalOpens ?? 0) === 0) reasons.push('No opens yet')
    if (row.statusTag === 'hot') reasons.push('Hot status (may be manual)')
    if ((row.totalOpens ?? 0) >= 2) reasons.push('Opened more than once')
    if (row.forwardingSuspected) reasons.push('Possible forwarding')
    if (row.expiresAt && row.expiresAt > now && row.expiresAt <= expiryCutoff) {
      reasons.push('Link expires soon')
    }

    if (reasons.length > 0) rows.push({ ...row, reasons })
  }

  return rows
}
