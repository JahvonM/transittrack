import { defineConfig, devices } from '@playwright/test';

// Default browser tests intercept every API request with mocks. Legacy live
// specs are excluded: they need migration and separately authorized test sessions.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['company-isolation.spec.js','kiosk-boarding.spec.js','map-location.spec.js','qr-login.spec.js','offline-update.spec.js','tablet-context.spec.js','saved-work.spec.js','message-notifications.spec.js','server-codes.spec.js','driver-phone.spec.js','driver-phone-shift.spec.js','driver-phone-step3.spec.js','notifications.spec.js','app-errors.spec.js','new-account.spec.js','update-reload.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
