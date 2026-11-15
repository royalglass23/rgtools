import { existsSync } from 'node:fs'
import path from 'node:path'

import { Pool } from '@neondatabase/serverless'
import { neonConfig } from '@neondatabase/serverless'
import { loadEnvConfig } from '@next/env'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

import * as schema from './schema'
import * as leadSchema from './schema-leads'
import * as psGeneratorSchema from './schema-ps-generator'
import * as quoteMovementSchema from './schema-quote-movement'
import * as workOrderSchema from './schema-workorders'

function findWorkspaceRoot(start: string) {
  let current = start

  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) return start
    current = parent
  }
}

if (!process.env.DATABASE_URL) {
  loadEnvConfig(findWorkspaceRoot(process.cwd()))
}

neonConfig.webSocketConstructor = ws

// Optional loopback-only proxy for disposable local PostgreSQL acceptance tests.
// Production/remote database connections always retain Neon's secure defaults.
if (process.env.DATABASE_WS_PROXY && process.env.DATABASE_URL &&
    new URL(process.env.DATABASE_URL).hostname === '127.0.0.1' &&
    /^127\.0\.0\.1:\d+$/.test(process.env.DATABASE_WS_PROXY)) {
  neonConfig.wsProxy = () => process.env.DATABASE_WS_PROXY!
  neonConfig.useSecureWebSocket = false
  neonConfig.pipelineConnect = false
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

export const db = drizzle(pool, {
  schema: { ...schema, ...leadSchema, ...psGeneratorSchema, ...quoteMovementSchema, ...workOrderSchema },
})
