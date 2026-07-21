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

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

export const db = drizzle(pool, { schema: { ...schema, ...leadSchema, ...psGeneratorSchema, ...workOrderSchema } })
