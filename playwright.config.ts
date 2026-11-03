import { defineConfig, devices } from '@playwright/test'

const APP_PORT = 3300
const MOCK_PORT = 3301
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: APP_URL,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: 'pnpm exec tsx e2e/support/mock-auth-server.ts',
      url: `${MOCK_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        MOCK_AUTH_PORT: String(MOCK_PORT),
      },
    },
    {
      command: `pnpm dev --hostname 127.0.0.1 --port ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: String(APP_PORT),
        NEXT_PUBLIC_SUPABASE_URL: MOCK_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mock-publishable-key',
        AUTH_SITE_URL: APP_URL,
      },
    },
  ],
})
