import { randomBytes, randomUUID } from 'node:crypto'

export type WorkOrderAcceptanceDatabaseProof = {
  databaseName: string
  sentinel: string | null
}

type WorkOrderAcceptanceQueryResult =
  | WorkOrderAcceptanceDatabaseProof[]
  | { rows: WorkOrderAcceptanceDatabaseProof[] }

const WORK_ORDER_ACCEPTANCE_SENTINEL_QUERY = `
  SELECT
    current_database() AS "databaseName",
    sentinel
  FROM rgtools_e2e.database_sentinel
  WHERE id = 1
`

export function createWorkOrderAcceptanceCredentials() {
  return {
    username: `mt199-${randomUUID()}`,
    password: randomBytes(32).toString('base64url'),
  }
}

export async function verifyWorkOrderAcceptanceDatabase({
  expectedSentinel,
  readProof,
}: {
  expectedSentinel: string | undefined
  readProof: () => Promise<WorkOrderAcceptanceDatabaseProof>
}) {
  if (!expectedSentinel?.trim()) {
    throw new Error('E2E_DATABASE_SENTINEL is required to verify an isolated MT-199 acceptance database.')
  }
  if (expectedSentinel.length < 32) {
    throw new Error('E2E_DATABASE_SENTINEL must contain at least 32 characters.')
  }

  const proof = await readProof()
  if (proof.sentinel !== expectedSentinel) {
    throw new Error(`Refusing to run MT-199 acceptance against database ${proof.databaseName}: isolated database sentinel did not match.`)
  }

  return proof
}

export async function readWorkOrderAcceptanceDatabaseProof(
  query: (statement: string) => Promise<WorkOrderAcceptanceQueryResult>,
): Promise<WorkOrderAcceptanceDatabaseProof> {
  const result = await query(WORK_ORDER_ACCEPTANCE_SENTINEL_QUERY)
  const rows = Array.isArray(result) ? result : result.rows
  return rows[0] ?? { databaseName: 'unknown', sentinel: null }
}
