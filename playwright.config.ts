import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3999);

// Runs against the production bundle (`npm run build` first) with real guest-host access.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node .deploy/server.mjs',
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(port),
      NODE_ENV: 'production',
      AUTH_MODE: 'guest',
      ENTRA_CLIENT_ID: '',
      ENTRA_TENANT_ID: '',
      COSMOS_ENDPOINT: '',
      COSMOS_KEY: '',
      LOG_LEVEL: 'warn',
      STATIC_DIR: '.deploy/public',
    },
  },
});
