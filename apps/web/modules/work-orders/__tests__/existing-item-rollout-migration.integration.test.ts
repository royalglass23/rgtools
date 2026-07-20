// @vitest-environment node

import { Pool, neonConfig } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  readWorkOrderAcceptanceDatabaseProof,
  verifyWorkOrderAcceptanceDatabase,
} from '@/tests/e2e/work-order-acceptance-safety'

const isolatedDatabaseUrl = process.env.E2E_DATABASE_URL
const expectedDatabaseSentinel = process.env.E2E_DATABASE_SENTINEL
const describeWithIsolatedDatabase = isolatedDatabaseUrl ? describe : describe.skip

describeWithIsolatedDatabase('existing-item rollout migration numbering', () => {
  let pool: Pool | undefined

  beforeAll(async () => {
    if (!isolatedDatabaseUrl) return
    neonConfig.webSocketConstructor = globalThis.WebSocket
    pool = new Pool({ connectionString: isolatedDatabaseUrl })
    await verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: expectedDatabaseSentinel,
      readProof: () => readWorkOrderAcceptanceDatabaseProof((statement) =>
        pool!.query<{ databaseName: string; sentinel: string | null }>(statement)),
    })
  })

  afterAll(async () => {
    if (pool) await pool.end()
  })

  it('records Quote Movement 0061–0065 before Work Orders 0066–0067 without superseded collisions', async () => {
    if (!pool) throw new Error('The isolated Work Orders integration database was not created.')

    const result = await pool.query<{ createdAt: string }>(`
      SELECT created_at::text AS "createdAt"
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at
    `)

    const createdAt = result.rows.map((row) => row.createdAt)
    expect(createdAt).toEqual(expect.arrayContaining([
      '1784498672934',
      '1784501388245',
      '1784508785193',
      '1784511138274',
      '1784514000000',
      '1784517000000',
      '1784517060000',
    ]))
    expect(createdAt).not.toEqual(expect.arrayContaining([
      '1784512800000',
      '1784516400000',
    ]))
  })

  it('rehearses the inverse schema operations inside a rollback without changing Work Orders data', async () => {
    if (!pool) throw new Error('The isolated Work Orders integration database was not created.')
    const client = await pool.connect()
    const countTables = [
      'work_order_items',
      'work_order_item_enrichment_jobs',
      'work_order_item_production_specifications',
      'work_order_item_production_specification_revisions',
    ] as const
    const readCounts = async () => Object.fromEntries(await Promise.all(countTables.map(async (table) => {
      const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)
      return [table, result.rows[0]?.count ?? '0']
    })))

    try {
      await client.query('BEGIN')
      const before = await readCounts()
      await client.query(`
        ALTER TABLE work_order_item_enrichment_jobs DROP COLUMN rollout_run_id;
        ALTER TABLE work_order_item_enrichment_jobs DROP COLUMN rollout_was_retried;
        DROP TABLE work_order_existing_item_rollout_runs;
      `)
      expect(await readCounts()).toEqual(before)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }

    const restored = await pool.query<{ tableExists: boolean; restoredColumnCount: number }>(`
      SELECT
        to_regclass('public.work_order_existing_item_rollout_runs') IS NOT NULL AS "tableExists",
        (
          SELECT count(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'work_order_item_enrichment_jobs'
            AND column_name IN ('rollout_run_id', 'rollout_was_retried')
        ) AS "restoredColumnCount"
    `)
    expect(restored.rows[0]).toEqual({ tableExists: true, restoredColumnCount: 2 })
  })
})
