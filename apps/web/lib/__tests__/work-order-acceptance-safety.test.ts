import { describe, expect, it, vi } from 'vitest'

import {
  createWorkOrderAcceptanceCredentials,
  readWorkOrderAcceptanceDatabaseProof,
  verifyWorkOrderAcceptanceDatabase,
} from '../../tests/e2e/work-order-acceptance-safety'

describe('createWorkOrderAcceptanceCredentials', () => {
  it('creates unique random credentials for each acceptance run', () => {
    const first = createWorkOrderAcceptanceCredentials()
    const second = createWorkOrderAcceptanceCredentials()

    expect(first.username).toMatch(/^mt199-/)
    expect(first.password.length).toBeGreaterThanOrEqual(32)
    expect(second).not.toEqual(first)
    expect(first.password).not.toBe('MT199-test-only!')
  })
})

describe('verifyWorkOrderAcceptanceDatabase', () => {
  it('requires a configured sentinel before probing the database', async () => {
    const readProof = vi.fn(async () => ({
      databaseName: 'rgtools_shared',
      sentinel: null,
    }))

    await expect(verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: undefined,
      readProof,
    })).rejects.toThrow('E2E_DATABASE_SENTINEL is required')
    expect(readProof).not.toHaveBeenCalled()
  })

  it('rejects a weak sentinel before probing the database', async () => {
    const readProof = vi.fn(async () => ({
      databaseName: 'rgtools_shared',
      sentinel: 'short-marker',
    }))

    await expect(verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: 'short-marker',
      readProof,
    })).rejects.toThrow('at least 32 characters')
    expect(readProof).not.toHaveBeenCalled()
  })

  it('rejects a database whose sentinel does not exactly match the configured proof', async () => {
    const readProof = vi.fn(async () => ({
      databaseName: 'rgtools_shared',
      sentinel: 'shared-database-marker',
    }))

    await expect(verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: 'isolated-mt199-marker-with-32-characters',
      readProof,
    })).rejects.toThrow('Refusing to run MT-199 acceptance against database rgtools_shared')
  })

  it('accepts only an exact strong sentinel match', async () => {
    const sentinel = 'isolated-mt199-marker-with-32-characters'

    await expect(verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: sentinel,
      readProof: async () => ({ databaseName: 'rgtools_mt199_test', sentinel }),
    })).resolves.toEqual({ databaseName: 'rgtools_mt199_test', sentinel })
  })
})

describe('readWorkOrderAcceptanceDatabaseProof', () => {
  it('reads the sentinel from the isolated-only proof table without a custom database parameter', async () => {
    const query = vi.fn(async (statement: string) => {
      expect(statement).toContain('rgtools_e2e.database_sentinel')
      expect(statement).not.toContain('current_setting')
      return [{
        databaseName: 'rgtools_mt199_test',
        sentinel: 'isolated-mt199-marker-with-32-characters',
      }]
    })

    await expect(readWorkOrderAcceptanceDatabaseProof(query)).resolves.toEqual({
      databaseName: 'rgtools_mt199_test',
      sentinel: 'isolated-mt199-marker-with-32-characters',
    })
    expect(query).toHaveBeenCalledOnce()
  })
})
