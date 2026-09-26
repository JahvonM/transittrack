# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: kiosk-bus-boarding.spec.js >> an already-paired bus boarding kiosk heartbeats and shows the lock screen
- Location: e2e/kiosk-bus-boarding.spec.js:12:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('hvyurtet')
Expected: visible
Error: strict mode violation: getByText('hvyurtet') resolved to 2 elements:
    1) <p class="text-xs text-muted-foreground truncate">hvyurtet</p> aka getByText('hvyurtet').first()
    2) <p class="text-xl font-semibold text-muted-foreground">hvyurtet</p> aka getByText('hvyurtet').nth(1)

Call log:
  - Expect "toBeVisible" getByText('hvyurtet') with timeout 5000ms
  - waiting for getByText('hvyurtet')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e7]:
    - generic [ref=e8]:
      - generic [ref=e14]:
        - paragraph [ref=e15]: Island Transit Co.
        - paragraph [ref=e16]: hvyurtet
      - generic [ref=e17]: 1/79
      - paragraph [ref=e23]: 02:45 AM
    - generic [ref=e24]:
      - generic [ref=e27]:
        - generic [ref=e28]:
          - paragraph [ref=e29]: 02:45 AM
          - paragraph [ref=e30]: Saturday, September 26
        - paragraph [ref=e31]: hvyurtet
        - generic [ref=e32]: Slide to check in
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Occupancy
          - paragraph [ref=e45]:
            - text: "1"
            - generic [ref=e46]: / 79
        - button "Turn on location for local weather" [ref=e48] [cursor=pointer]
  - region "Notifications (F8)":
    - list
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | // Real E2E against the live backend. Pairing codes are one-time-use
  4  | // (confirmed in base44/functions/pairKioskDevice/entry.ts — re-pairing an
  5  | // already-paired device 409s), so this doesn't replay the ?code= flow every
  6  | // run. Instead it seeds localStorage with a permanently-paired fixture
  7  | // device's id before the app boots, exactly the steady state every real
  8  | // kiosk tablet is in on any ordinary day after its one-time pairing — and
  9  | // the only way to make this test idempotent.
  10 | const DEVICE_ID = '6ab72f96a01e01329ada39dc'; // "E2E Bus Boarding Test Kiosk", kept paired
  11 | 
  12 | test('an already-paired bus boarding kiosk heartbeats and shows the lock screen', async ({ page }) => {
  13 |   await page.addInitScript((id) => {
  14 |     window.localStorage.setItem('tt_kiosk_device_id', id);
  15 |   }, DEVICE_ID);
  16 | 
  17 |   await page.goto('/kiosk');
  18 | 
  19 |   await expect(page.getByText('Slide to check in')).toBeVisible({ timeout: 15000 });
> 20 |   await expect(page.getByText('hvyurtet')).toBeVisible();
     |                                            ^ Error: expect(locator).toBeVisible() failed
  21 | });
  22 | 
```