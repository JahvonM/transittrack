// Screenshots key screens in light + dark (mocked signed-in admin) -> /tmp/shots/*.png
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
const shots = (process.argv[3] || "/:user,/admin:admin,/mechanic:mechanic").split(",");
fs.mkdirSync("/tmp/shots", { recursive: true });
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const s of shots) {
    const [p, role] = s.split(":");
    const user = { id: "u1", email: "qa@example.com", full_name: "QA User", role, company_id: "c1" };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => {
      localStorage.setItem("base44_access_token", "fake");
      localStorage.setItem("token", "fake");
      localStorage.setItem("tt-theme-v2", t);
    }, theme);
    await ctx.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("public-settings")) return route.continue();
      if (url.includes("/entities/User/me")) return route.fulfill({ json: user });
      if (url.includes("/entities/")) return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });
    const page = await ctx.newPage();
    await page.goto(base + p, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(3500);
    const name = `/tmp/shots/${theme}${p.replace(/\//g, "_") || "_home"}.png`;
    await page.screenshot({ path: name });
    console.log("shot", name);
    await ctx.close();
  }
}
await browser.close();
