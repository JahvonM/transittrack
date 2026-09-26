import { defineConfig, devices } from '@playwright/test';

// Runs against the real production Base44 backend (see vite.config.js's
// preview proxy) with a locally-served build of the current dist/ — so a
// test run always needs `npm run build` first. Tests that need a real
// logged-in session (admin/mechanic/company/staff) require a verified test
// account's credentials, since email OTP verification can't be completed
// programmatically; see e2e/README.md for what that unlocks.
export default defineConfig({
  testDir: './e2e',
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
