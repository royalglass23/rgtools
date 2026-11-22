/* eslint-disable @typescript-eslint/no-require-imports -- Playwright loads this explicit .cjs fixture configuration as CommonJS. */
const path = require('node:path')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../../../..')
const { defineConfig, devices } = createRequire(path.join(root, 'apps/web/package.json'))('@playwright/test')
const output = path.join(root, 'tmp/rg408-production-e2e')
module.exports = defineConfig({
  testDir: path.join(root, 'apps/web/tests/e2e'),
  testMatch: ['dashboard-work-orders.spec.ts', 'kanban-security.spec.js'],
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true, timeout: 180000,
  expect: { timeout: 10000 },
  outputDir: path.join(output, 'test-results'),
  reporter: [['list'], ['json', { outputFile: path.join(output, 'playwright.json') }], ['html', { outputFolder: path.join(output, 'html'), open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3058', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
