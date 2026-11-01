import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { mockFleet } from "./helpers/fleetFixture.js";

// Button-by-button check: on the main passenger, driver phone and office
// screens, every visible button that only opens, shows or switches something
// is pressed once. A screen passes when no press throws an uncaught error or
// brings up the crash screen. Buttons that send, save, delete or change
// records are left alone (they have their own tests), and so are calls and
// links out. This proves the screens hold together with test data; it says
// nothing about real devices.

const SKIP = /sign ?out|log ?out|delete|remove|revoke|stop card|switch back on|end shift|start shift|unpair|reset|withdraw|send|submit|save|turn down|confirm|resolve|archive|issue|replace|lost|suspend|deactivate|disable|enable|approve|decline|regenerate|pair|restart|lock|update|install|clear|cancel|report|call|whatsapp|email|share|download|export|print|copy|retry|try again|refresh|notifications on|allow|mark|didn't show|got on|got off|undo|skip today|running late|i'm running late|full screen/i;

const SCREENS = {
  staff: ["/staff", "/rides", "/help", "/my-card", "/more"],
  driver: ["/driver-phone", "/driver-phone/me"],
  admin: ["/admin/overview", "/admin/fleet-workspace", "/admin/support", "/admin/cards", "/admin/kiosks", "/admin/notifications"],
};

const record = (entry) => { if (process.env.BUTTON_SWEEP_REPORT) fs.appendFileSync(process.env.BUTTON_SWEEP_REPORT, JSON.stringify(entry) + "\n"); };

async function buttonNames(page) {
  return page.getByRole("button").evaluateAll((els) => [...new Set(els
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled && e.getAttribute("aria-disabled") !== "true"; })
    .map((e) => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim())
    .filter((n) => n && n.length <= 80))]);
}

for (const [role, paths] of Object.entries(SCREENS)) {
  for (const path of paths) {
    test(`${role} ${path}: every safe button`, async ({ page }) => {
      test.setTimeout(150_000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e?.message || e).slice(0, 300)));
      await mockFleet(page, { role });
      await page.setViewportSize(role === "admin" ? { width: 1366, height: 900 } : { width: 390, height: 844 });
      const open = async () => { await page.goto(path); await page.waitForTimeout(1200); };
      await open();
      const names = await buttonNames(page);
      const pressed = [], skipped = [], crashedOn = [];
      for (const name of names) {
        if (SKIP.test(name)) { skipped.push(name); continue; }
        const button = page.getByRole("button", { name, exact: true }).first();
        if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) continue;
        const ok = await button.click({ timeout: 2500 }).then(() => true, () => false);
        if (!ok) continue;
        pressed.push(name);
        await page.waitForTimeout(250);
        if (await page.getByRole("heading", { name: "Something went wrong" }).count()) crashedOn.push(name);
        await page.keyboard.press("Escape").catch(() => {});
        await page.keyboard.press("Escape").catch(() => {});
        if (new URL(page.url()).pathname !== path || crashedOn.length) await open();
      }
      record({ role, path, pressed, skipped, crashedOn, errors });
      expect(pressed.length, "buttons pressed").toBeGreaterThan(0);
      expect(crashedOn, "crash screen after pressing").toEqual([]);
      expect(errors, "uncaught errors").toEqual([]);
    });
  }
}
