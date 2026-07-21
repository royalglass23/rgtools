import { defineConfig, defaultExclude } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: [...defaultExclude, 'tests/e2e/**', 'tests/integration/**'],
  },
  resolve: {
    alias: [
      { find: '@rgtools/db/schema-leads', replacement: path.resolve(__dirname, '../../packages/db/src/schema-leads.ts') },
      { find: '@rgtools/db/schema-ps-generator', replacement: path.resolve(__dirname, '../../packages/db/src/schema-ps-generator.ts') },
      { find: '@rgtools/db/schema-workorders', replacement: path.resolve(__dirname, '../../packages/db/src/schema-workorders.ts') },
      { find: '@rgtools/db/schema', replacement: path.resolve(__dirname, '../../packages/db/src/schema.ts') },
      { find: '@rgtools/db', replacement: path.resolve(__dirname, '../../packages/db/src/index.ts') },
      { find: '@', replacement: path.resolve(__dirname, '.') },
    ],
  },
})
