import path from 'node:path'

import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

loadEnvConfig(path.resolve(__dirname, '../..'))

const nextConfig: NextConfig = {
  transpilePackages: ['@rgtools/db'],
  serverExternalPackages: ['@neondatabase/serverless', 'bcryptjs', 'drizzle-orm'],
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
}

export default nextConfig
