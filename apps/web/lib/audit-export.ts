import { formatAuditDetail } from '@/lib/audit'

export type AuditExportRow = {
  id: string
  createdAt: Date
  actorId: string | null
  actorName?: string | null
  entityType?: string | null
  action: string
  targetId: string | null
  detail: unknown
  ipAddress?: string | null
  archivedAt?: Date | null
}

function csvValue(value: unknown) {
  if (value == null) return '""'
  const text = value instanceof Date ? value.toISOString() : safeSpreadsheetText(value)
  return `"${text.replace(/"/g, '""')}"`
}

function safeSpreadsheetText(value: unknown) {
  const text = String(value)
  if (typeof value !== 'string') return text

  const startsWithFormulaMarker = /^[=+\-@]/.test(text.trimStart())
  const startsWithControlWhitespace = /^[\t\r\n]/.test(text)
  return startsWithFormulaMarker || startsWithControlWhitespace ? `'${text}` : text
}

export function rowsToCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvValue).join(',')).join('\n')
}

export function auditExportRowsToCsv(rows: AuditExportRow[]) {
  return rowsToCsv([
    ['id', 'createdAt', 'actorId', 'actorName', 'entityType', 'action', 'targetId', 'detail', 'ipAddress', 'archivedAt'],
    ...rows.map((row) => [
      row.id,
      row.createdAt,
      row.actorId,
      row.actorName ?? '',
      row.entityType ?? '',
      row.action,
      row.targetId,
      formatAuditDetail(row.detail),
      row.ipAddress ?? '',
      row.archivedAt ?? '',
    ]),
  ])
}
