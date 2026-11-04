// Test e2e trên trình duyệt thật.  npm run e2e   (lần đầu: npx playwright install chromium webkit)
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },      // Android / Chrome
    { name: 'webkit-mobile',   use: { ...devices['iPhone 14'] } }     // iOS / Safari
  ]
});
