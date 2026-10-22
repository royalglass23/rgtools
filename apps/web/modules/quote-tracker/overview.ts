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

export function buildAttentionRows(groups: AttentionCandidate[][], now: Date): AttentionRow[] {
  const seen = new Set<string>()
  const expiryCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const rows: AttentionRow[] = []

  const longestGroup = Math.max(0, ...groups.map((group) => group.length))
  for (let index = 0; index < longestGroup && rows.length < 12; index++) {
    for (const group of groups) {
      const row = group[index]
      if (!row || seen.has(row.id)) continue
      seen.add(row.id)

      const reasons: string[] = []
      if ((row.totalOpens ?? 0) === 0) reasons.push('No opens yet')
      if (row.statusTag === 'hot') reasons.push('Hot status (may be manual)')
      if ((row.totalOpens ?? 0) >= 2) reasons.push('Opened more than once')
      if (row.forwardingSuspected) reasons.push('Possible forwarding')
      if (row.expiresAt && row.expiresAt > now && row.expiresAt <= expiryCutoff) {
        reasons.push('Link expires soon')
      }

      if (reasons.length > 0) rows.push({ ...row, reasons })
      if (rows.length >= 12) break
    }
  }

  return rows
}
