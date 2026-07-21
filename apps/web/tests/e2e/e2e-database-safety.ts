export type E2eDatabaseProof = {
  databaseName: string
  sentinel: string | null
}

type E2eDatabaseQueryResult =
  | E2eDatabaseProof[]
  | { rows: E2eDatabaseProof[] }

const E2E_DATABASE_SENTINEL_QUERY = `
  SELECT
    current_database() AS "databaseName",
    sentinel
  FROM rgtools_e2e.database_sentinel
  WHERE id = 1
`

export async function verifyIsolatedE2eDatabase({
  expectedSentinel,
  purpose,
  readProof,
}: {
  expectedSentinel: string | undefined
  purpose: string
  readProof: () => Promise<E2eDatabaseProof>
}) {
  if (!expectedSentinel?.trim()) {
    throw new Error(
      `E2E_DATABASE_SENTINEL is required to verify an isolated database for ${purpose}.`,
    )
  }
  if (expectedSentinel.length < 32) {
    throw new Error('E2E_DATABASE_SENTINEL must contain at least 32 characters.')
  }

  const proof = await readProof()
  if (proof.sentinel !== expectedSentinel) {
    throw new Error(
      `Refusing to run ${purpose} against database ${proof.databaseName}: isolated database sentinel did not match.`,
    )
  }

  return proof
}

export async function readE2eDatabaseProof(
  query: (statement: string) => Promise<E2eDatabaseQueryResult>,
): Promise<E2eDatabaseProof> {
  const result = await query(E2E_DATABASE_SENTINEL_QUERY)
  const rows = Array.isArray(result) ? result : result.rows
  return rows[0] ?? { databaseName: 'unknown', sentinel: null }
}
