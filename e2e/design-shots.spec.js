// Screenshots of the website's opening section for design review
// (playwright.shots.config.js). Temporary.
import { test } from "@playwright/test";

async function open(page, { width, height }, still = false) {
  await page.setViewportSize({ width, height });
  if (still) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (r) => r.request().url().includes("appSupport") ? r.fulfill({ json: { whatsapp_number: "14735550100" } }) : r.fulfill({ json: { id: "test-app", public_settings: { authentication_required: false } } }));
  await page.goto("/site");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(3000);
}
for (const [name, size, full] of [["site-1440", { width: 1440, height: 900 }, false], ["site-1280", { width: 1280, height: 800 }, false], ["site-1024", { width: 1024, height: 768 }, false], ["site-390", { width: 390, height: 844 }, false], ["site-320", { width: 320, height: 640 }, true], ["site-1440-full", { width: 1440, height: 900 }, true]]) {
  test(name, async ({ page }) => { await open(page, size); await page.screenshot({ path: `shots/${name}.png`, fullPage: full }); });
}
test("site-1440-still", async ({ page }) => { await open(page, { width: 1440, height: 900 }, true); await page.screenshot({ path: "shots/site-1440-still.png" }); });
