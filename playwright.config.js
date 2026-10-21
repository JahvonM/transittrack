import { defineConfig, devices } from '@playwright/test';

// Default browser tests intercept every API request with mocks. Legacy live
// specs are excluded: they need migration and separately authorized test sessions.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['profile-photo.spec.js','tablet-recordings.spec.js','driver-landscape.spec.js','company-workspace.spec.js','operations-changes.spec.js','direct-tablet-viewer.spec.js','tablet-management.spec.js','kiosk-launch.spec.js','admin-bootstrap.spec.js','admin-load-recovery.spec.js','admin-fast-open.spec.js','driver-portrait.spec.js','passenger-experience.spec.js','company-isolation.spec.js','kiosk-boarding.spec.js','map-location.spec.js','qr-login.spec.js','offline-update.spec.js','tablet-context.spec.js','saved-work.spec.js','message-notifications.spec.js','server-codes.spec.js','driver-phone.spec.js','driver-phone-shift.spec.js','driver-phone-step3.spec.js','notifications.spec.js','app-errors.spec.js','new-account.spec.js','update-reload.spec.js','route-road.spec.js','plan-pickups.spec.js','driver-road-stops.spec.js','saved-work-notice.spec.js','server-busy.spec.js','bluetooth-boarding.spec.js','phone-signin.spec.js','jobs.spec.js'],
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
