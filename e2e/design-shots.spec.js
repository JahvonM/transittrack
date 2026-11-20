// Screenshots of the website's opening story for design review
// (playwright.shots.config.js). Temporary.
import { test } from "@playwright/test";

async function open(page, { width, height }) {
  await page.setViewportSize({ width, height });
  await page.route("**/api/**", (r) => r.request().url().includes("appSupport") ? r.fulfill({ json: { whatsapp_number: "14735550100" } }) : r.fulfill({ json: { id: "test-app", public_settings: { authentication_required: false } } }));
  await page.goto("/site");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}
const at = (page, p) => page.evaluate((p) => { const s = document.querySelector(".mcs-story"); window.scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * p); }, p);
for (const [name, size] of [["d", { width: 1440, height: 900 }], ["m", { width: 390, height: 844 }], ["t", { width: 1024, height: 768 }]]) {
  test(`story-${name}`, async ({ page }) => {
    await open(page, size);
    for (const [label, p] of [["1-start", 0], ["1b-opening", 0.12], ["2-closeup", 0.3], ["3-night", 0.5], ["4-track", 0.7], ["5-book", 0.95]]) {
      await at(page, p); await page.waitForTimeout(400);
      await page.screenshot({ path: `shots/${name}-${label}.png` });
    }
    await page.evaluate(() => { const b = document.querySelector("#services"); window.scrollTo(0, b.offsetTop - 80); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `shots/${name}-6-board.png` });
    await page.evaluate(() => { const b = document.querySelector("#how"); window.scrollTo(0, b.offsetTop - 80); });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `shots/${name}-7-steps.png` });
  });
}
test("story-320", async ({ page }) => { await open(page, { width: 320, height: 640 }); await page.screenshot({ path: "shots/s320-start.png" }); });
