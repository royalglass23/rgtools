import { randomBytes, randomUUID } from 'node:crypto'

export type WorkOrderAcceptanceDatabaseProof = {
  databaseName: string
  sentinel: string | null
}

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
