export type DatabaseDiagnostic = {
  errorType?: string
  databaseCode?: string
  databaseConstraint?: string
}

export const PROVISIONAL_PHONE_REVIEW_REASON =
  'Contact details need checking: this phone number is already assigned to another provisional client. Verify the submitted email and phone before linking or merging clients.'

export function isProvisionalPhoneConflict(diagnostic: DatabaseDiagnostic): boolean {
  return diagnostic.databaseCode === '23505'
    && diagnostic.databaseConstraint === 'clients_phone_normalized_provisional_uq'
}

export function databaseDiagnostic(error: unknown): DatabaseDiagnostic {
  const seen = new Set<unknown>()
  let current = error
  const errorType = error instanceof Error && /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(error.name)
    ? error.name
    : undefined
  let databaseCode: string | undefined
  let databaseConstraint: string | undefined
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown }
    if (!databaseCode && typeof candidate.code === 'string' && /^[A-Z0-9]{5}$/.test(candidate.code)) {
      databaseCode = candidate.code
    }
    if (!databaseConstraint && typeof candidate.constraint === 'string'
      && /^[a-zA-Z0-9_]{1,100}$/.test(candidate.constraint)) {
      databaseConstraint = candidate.constraint
    }
    current = candidate.cause
  }
  return { errorType, databaseCode, databaseConstraint }
}
