import { randomBytes, randomUUID } from 'node:crypto'
import {
  readE2eDatabaseProof,
  verifyIsolatedE2eDatabase,
  type E2eDatabaseProof,
} from './e2e-database-safety'

export type WorkOrderAcceptanceDatabaseProof = E2eDatabaseProof

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
  return verifyIsolatedE2eDatabase({
    expectedSentinel,
    purpose: 'MT-199 acceptance',
    readProof,
  })
}

export async function readWorkOrderAcceptanceDatabaseProof(
  query: Parameters<typeof readE2eDatabaseProof>[0],
): Promise<WorkOrderAcceptanceDatabaseProof> {
  return readE2eDatabaseProof(query)
}
