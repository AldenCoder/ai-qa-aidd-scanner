const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/generated',
  timeout: 15000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['json']],
  outputDir: process.env.EVIDENCE_DIR || 'evidence/playwright-output',
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3100',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
