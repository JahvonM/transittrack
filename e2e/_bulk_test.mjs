// Card issuing: compact single view + bulk setup with the simulated reader helper.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const HELPER = "http://127.0.0.1:8765";
const companies = [{ id: "c1", name: "Island Transit Co." }];
const vehicles = [{ id: "v1", name: "Bus 12 (BUS-012)", company_id: "c1" }, { id: "v2", name: "Bus 14", company_id: "c1" }];
const staff = (id, name, vid, vname, status = "Unassigned") => ({ key: `contact:${id}`, source: "contact", id, type: "staff", role: "Staff", name, company_id: "c1", company_name: "Island Transit Co.", vehicle_id: vid, assigned_vehicle: vname, status, default_access: "STAFF_BUS_BOARDING" });
const people = [
  staff("s1", "Ana Lopez", "v1", "Bus 12 (BUS-012)"),
  staff("s2", "Ben Ode", "v1", "Bus 12 (BUS-012)"),
  staff("s3", "Cara Diaz", "v1", "Bus 12 (BUS-012)"),
  staff("s4", "Dev Ram", "v2", "Bus 14"),
  staff("s5", "Eve Kim", "v1", "Bus 12 (BUS-012)", "Card Issued"),
  { key: "driver:d1", source: "driver", id: "d1", type: "driver", role: "Driver", name: "Marcus Reid", company_id: "c1", assigned_vehicle: "Bus 12 (BUS-012)", status: "Unassigned", default_access: "DEPOT_DRIVER_ZONE" },
];
const issued = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/functions/nfcCards")) {
    const body = req.postDataJSON();
    if (body.action === "people") return r.fulfill({ json: { people, cards: [], vehicles, tablets: [{ id: "k1", label: "Bus 12 boarding", vehicle_id: "v1", paired: true, active: true, last_seen: new Date().toISOString() }] } });
    if (body.action === "issue") {
      if (issued.some((i) => i.uid === body.uid)) return r.fulfill({ json: { ok: false, code: "duplicate", error: `Card ${body.uid} is already assigned to someone.` } });
      issued.push(body);
      const p = people.find((x) => x.key === body.person_key); if (p) p.status = "Card Issued";
      return r.fulfill({ json: { ok: true, card: { id: "n" + issued.length }, replaced: 0, sent_to_bus: 1 } });
    }
    return r.fulfill({ json: { ok: true } });
  }
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
  if (url.includes("/entities/Company")) return r.fulfill({ json: companies });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
try { await ctx.grantPermissions(["local-network-access"], { origin: base }); } catch { /* ignore */ }
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);
const tap = (uid) => fetch(`${HELPER}/simulate?uid=${uid}&type=MIFARE%20Classic%201K`);

await page.goto(base + "/admin/cards");
await page.getByRole("button", { name: "Connect reader" }).click();
await page.waitForTimeout(2000);
await page.getByRole("button", { name: /Ana Lopez/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/shots/ci_single.png" });
ok("single view: program button beside the person", await page.getByRole("button", { name: /Program card/ }).isVisible());

await page.getByRole("tab", { name: "Bulk setup" }).click();
await page.waitForTimeout(400);
await page.getByRole("combobox", { name: "Bus" }).click();
await page.getByRole("option", { name: "Bus 12 (BUS-012)" }).click();
await page.waitForTimeout(300);
const rows = await page.locator("tbody tr").count();
ok("bulk list = Bus 12 staff without a card (3)", rows === 3);
await page.screenshot({ path: "/tmp/shots/ci_bulk_pick.png" });
await page.getByRole("button", { name: /Start · 3 cards/ }).click();
await page.waitForTimeout(400);
ok("asks for first person", await page.getByText("Ana Lopez").first().isVisible());
await tap("04AA00000001"); await page.waitForTimeout(1500);
ok("moved to second person", await page.locator("p.text-2xl", { hasText: "Ben Ode" }).isVisible());
await tap("04AA00000001"); await page.waitForTimeout(1200);
ok("duplicate card refused, stays on Ben", await page.getByText(/already assigned/).isVisible() && await page.locator("p.text-2xl", { hasText: "Ben Ode" }).isVisible());
await page.screenshot({ path: "/tmp/shots/ci_bulk_run.png" });
await page.getByLabel("Card ID").fill("04:aa:00:00:00:02");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
ok("typed/scanned ID works, now Cara", await page.locator("p.text-2xl", { hasText: "Cara Diaz" }).isVisible());
await page.getByRole("button", { name: "Skip" }).click();
await page.waitForTimeout(600);
ok("finished summary", await page.getByText("All done").isVisible() && await page.getByText(/2 cards issued · 1 skipped/).isVisible());
ok("issue calls", JSON.stringify(issued.map((i) => [i.person_key, i.uid])) === JSON.stringify([["contact:s1", "04AA00000001"], ["contact:s2", "04AA00000002"]]));
await page.screenshot({ path: "/tmp/shots/ci_bulk_done.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
