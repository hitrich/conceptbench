import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
})
