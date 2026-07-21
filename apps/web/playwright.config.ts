import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3010)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`
const adapterPort = Number(process.env.E2E_ADAPTER_PORT ?? 32199)
const isolatedDatabaseUrl = process.env.E2E_DATABASE_URL
const isolatedWorkOrderEnv = isolatedDatabaseUrl
  ? {
      DATABASE_URL: isolatedDatabaseUrl,
      SERVICEM8_API_KEY: 'controlled-e2e-key',
      SERVICEM8_API_BASE_URL: `http://127.0.0.1:${adapterPort}/api_1.0`,
      OPENAI_API_KEY: 'controlled-e2e-key',
      OPENAI_RESPONSES_URL: `http://127.0.0.1:${adapterPort}/v1/responses`,
    }
  : undefined

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI && !isolatedDatabaseUrl,
    timeout: 180_000,
    env: isolatedWorkOrderEnv,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
