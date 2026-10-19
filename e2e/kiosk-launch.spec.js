import { test, expect } from "@playwright/test";

async function setup(page, { native = true, saved = {} } = {}) {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.addInitScript(({ native, saved }) => {
    for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value);
    if (native) {
      const noop = new Proxy({}, { get: (_, key) => key === "addListener" ? async () => ({ remove: async () => {} }) : async () => ({}) });
      window.CapacitorPlatforms = { platforms: new Map(), currentPlatform: {
        name: "android", getPlatform: () => "android", isNativePlatform: () => true,
        isPluginAvailable: name => ["TabletHealth", "UsbGps", "UsbNfc"].includes(name),
        registerPlugin: () => noop,
      } };
    }
  }, { native, saved });
  const calls = [];
  await page.route("**/api/**", route => {
    const url = route.request().url(); calls.push(url);
    if (url.includes("/functions/")) return route.fulfill({ status: 503, json: { error: "Offline test" } });
    return route.fulfill({ json: { id: "test", public_settings: { authentication_required: true } } });
  });
  return calls;
}
test("kiosk opens a tablet chooser without an account and saves the driver choice", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What is this tablet for?" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Passenger sections" })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/tt-kiosk-start-portrait.png", fullPage: true });
  await page.getByRole("link", { name: /Driver tablet Driver PIN/ }).click();
  await expect(page).toHaveURL(/\/driver$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("tt_tablet_mode"))).toBe("driver");
  await page.goto("/");
  await expect(page).toHaveURL(/\/driver$/);
});
test("boarding choice remains selected after restart", async ({ page }) => {
  await setup(page);
  await page.goto("/tablet");
  await page.getByRole("link", { name: /^Kiosk tablet NFC cards/ }).click();
  await expect(page).toHaveURL(/\/kiosk$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/kiosk$/);
});
test("upgrade resumes pairing and redirects passenger deep links without changing saved data", async ({ page }) => {
  await setup(page, { saved: { tt_driver_device_id: "test-driver", tt_device_token_test: "test-token", tt_offline_checkins: "saved-work" } });
  await page.goto("/");
  await expect(page).toHaveURL(/\/driver$/);
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/driver$/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/driver$/);
  expect(await page.evaluate(() => [localStorage.getItem("tt_device_token_test"), localStorage.getItem("tt_offline_checkins")])).toEqual(["test-token", "saved-work"]);
});
test("tablet choice is accessible without unpairing and legal pages stay available", async ({ page }) => {
  await setup(page, { saved: { tt_tablet_mode: "driver" } });
  await page.goto("/tablet?choose=1");
  await expect(page.getByRole("heading", { name: "What is this tablet for?" })).toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});
test("web passenger sign-in is unchanged", async ({ page }) => {
  await setup(page, { native: false });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "What is this tablet for?" })).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toBeVisible();
});
