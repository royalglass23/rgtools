import { realpathSync } from 'node:fs'
import path from 'node:path'

import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

loadEnvConfig(path.resolve(__dirname, '../..'))

const workspaceRoot = realpathSync.native(path.resolve(__dirname, '../..'))

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/knowledge-response', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
    ] }]
  },
  transpilePackages: ['@rgtools/db'],
  serverExternalPackages: ['@neondatabase/serverless', 'bcryptjs', 'drizzle-orm'],
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
}

export default nextConfig
