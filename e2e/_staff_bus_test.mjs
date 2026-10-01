// Card issuing: add company bus staff linked to a bus, change bus, send to the bus tablet.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const shot = process.argv[3] || "/tmp/shots/staffbus.png";

const companies = [{ id: "c1", name: "Island Transit Co." }, { id: "c2", name: "Blue Line" }];
const vehicles = [
  { id: "v1", name: "Bus 12 (BUS-012)", company_id: "c1" },
  { id: "v2", name: "Bus 14", company_id: "c1" },
  { id: "v3", name: "Coaster 3", company_id: "c2" },
];
const tablets = [{ id: "k1", label: "Bus 12 boarding", vehicle_id: "v1", paired: true, active: true, last_seen: new Date().toISOString(), directory_sent_at: null }];
const people = [
  { key: "driver:d1", source: "driver", id: "d1", type: "driver", role: "Driver", name: "Marcus Reid", company_id: "c1", company_name: "Island Transit Co.", assigned_vehicle: "Bus 12 (BUS-012)", status: "Unassigned", default_access: "DEPOT_DRIVER_ZONE" },
];
const calls = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/functions/nfcCards")) {
    const body = req.postDataJSON(); calls.push(body);
    if (body.action === "people") return r.fulfill({ json: { people, cards: [], vehicles, tablets } });
    if (body.action === "add_holder") {
      const v = vehicles.find((x) => x.id === body.vehicle_id);
      const c = companies.find((x) => x.id === v.company_id);
      people.push({ key: "contact:n1", source: "contact", id: "n1", type: "staff", role: "Staff", name: body.full_name, company_id: c.id, company_name: c.name, vehicle_id: v.id, assigned_vehicle: v.name, status: "Unassigned", default_access: "STAFF_BUS_BOARDING" });
      return r.fulfill({ json: { ok: true, person_key: "contact:n1" } });
    }
    if (body.action === "set_bus") {
      const p = people.find((x) => x.key === body.person_key); const v = vehicles.find((x) => x.id === body.vehicle_id);
      p.vehicle_id = v?.id || ""; p.assigned_vehicle = v?.name || "";
      return r.fulfill({ json: { ok: true, person_key: p.key, sent_to_bus: tablets.filter((t) => t.vehicle_id === p.vehicle_id).length } });
    }
    if (body.action === "send_to_bus") { tablets.forEach((t) => { if (t.vehicle_id === body.vehicle_id) t.directory_sent_at = new Date().toISOString(); }); return r.fulfill({ json: { ok: true, sent: tablets.filter((t) => t.vehicle_id === body.vehicle_id).length } }); }
    return r.fulfill({ json: {} });
  }
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
  if (url.includes("/entities/Company")) return r.fulfill({ json: companies });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);

await page.goto(base + "/admin/cards");
await page.getByRole("button", { name: /Add staff/ }).waitFor({ timeout: 20000 });
await page.getByRole("button", { name: /Add staff/ }).click();
const dlg = page.getByRole("dialog");
ok("no role or employee ID in add form", !(await dlg.getByText(/Employee ID|Role/).count()));
await dlg.getByLabel("Full name").fill("Tia Morris");
await dlg.getByRole("combobox", { name: "Company" }).click();
await page.getByRole("option", { name: "Island Transit Co." }).click();
await dlg.getByRole("combobox", { name: "Bus" }).click();
const busOpts = await page.getByRole("option").allTextContents();
ok("bus list only shows that company's buses", busOpts.join("|") === "Bus 12 (BUS-012)|Bus 14");
await page.getByRole("option", { name: "Bus 12 (BUS-012)" }).click();
await dlg.getByRole("button", { name: "Add staff" }).click();
await page.waitForTimeout(1200);
const add = calls.find((c) => c.action === "add_holder");
ok("add_holder sent name + company + bus only", add && add.full_name === "Tia Morris" && add.vehicle_id === "v1" && !("role" in add) && !("employee_id" in add));
ok("new staff selected", await page.getByRole("button", { name: /Program card for Tia Morris/ }).isVisible());
ok("tablet line shown", await page.getByText(/Bus 12 boarding · seen/).isVisible());
await page.getByRole("button", { name: /Send to bus tablet/ }).click();
await page.waitForTimeout(800);
ok("send_to_bus called for Bus 12", calls.some((c) => c.action === "send_to_bus" && c.vehicle_id === "v1"));
await page.getByRole("combobox", { name: "Bus" }).click();
await page.getByRole("option", { name: "Bus 14" }).click();
await page.waitForTimeout(1200);
ok("set_bus moved to Bus 14", calls.some((c) => c.action === "set_bus" && c.vehicle_id === "v2"));
ok("no tablet message for Bus 14", await page.getByText(/No boarding tablet on this bus yet/).isVisible());
await page.screenshot({ path: shot });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
