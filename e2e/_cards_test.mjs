// Card issuing page + the reader helper (simulate mode) end to end, with mocked data.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
const HELPER = "http://127.0.0.1:8765";
fs.mkdirSync("/tmp/shots", { recursive: true });

const people = [
  { key: "driver:d1", source: "driver", id: "d1", type: "driver", role: "Driver", name: "Marcus Reid", employee_id: "DRV-014", assigned_vehicle: "Bus 12 (BUS-012)", status: "Unassigned", default_access: "DEPOT_DRIVER_ZONE", company_name: "Island Transit Co." },
  { key: "user:m1", source: "user", id: "m1", type: "mechanic", role: "Mechanic", name: "Andre Felix", employee_id: "", assigned_vehicle: "", status: "Unassigned", default_access: "DEPOT_WORKSHOP" },
  { key: "contact:s1", source: "contact", id: "s1", type: "staff", role: "Staff", name: "Kevin Paul", employee_id: "ST-220", status: "Card Issued", default_access: "STAFF_BUS_BOARDING", card: { card_uid: "04AA11BB22CC33", access_level: "STAFF_BUS_BOARDING" } },
  { key: "cardholder:h1", source: "cardholder", id: "h1", type: "other", role: "Dispatcher", name: "Lisa Noel", employee_id: "DSP-3", status: "Unassigned", default_access: "DEPOT_DISPATCH" },
];
const cards = [{ id: "c1", card_uid: "04AA11BB22CC33", card_type: "MIFARE Classic 1K", holder_name: "Kevin Paul", employee_id: "ST-220", role: "Staff", access_level: "STAFF_BUS_BOARDING", issue_date: new Date().toISOString(), issued_by: "Ana Admin", is_active: true }];
const calls = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/functions/nfcCards")) {
    const body = req.postDataJSON(); calls.push(body);
    if (body.action === "people") return r.fulfill({ json: { people, cards } });
    if (body.action === "issue") {
      if (body.uid === "04AA11BB22CC33") return r.fulfill({ json: { ok: false, code: "duplicate", error: "Card 04AA11BB22CC33 is already assigned to Kevin Paul." } });
      const p = people.find((x) => x.key === body.person_key);
      p.status = "Card Issued"; p.card = { card_uid: body.uid, access_level: body.access_level };
      cards.push({ id: "c" + cards.length + 1, card_uid: body.uid, holder_name: p.name, role: p.role, access_level: body.access_level, is_active: true, issue_date: new Date().toISOString() });
      return r.fulfill({ json: { ok: true, card: { id: "new" }, replaced: 0 } });
    }
    if (body.action === "verify") return r.fulfill({ json: { ok: true, uid: body.uid, owner: body.uid === "04AA11BB22CC33" ? { name: "Kevin Paul", card: cards[0] } : null } });
    if (body.action === "revoke") return r.fulfill({ json: { ok: true } });
    return r.fulfill({ json: {} });
  }
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const tap = (uid) => fetch(`${HELPER}/simulate?uid=${uid}&type=MIFARE%20Classic%201K`);
const out = {};
const has = (t) => page.getByText(t).first().isVisible().catch(() => false);

await page.goto(base + "/admin/cards", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
out.readerBadge = await has("ACS ACR122U PICC Interface (simulated)");
out.queueCount = await page.locator('aside[aria-label="Staff queue"] li button').count();

// Issue a card to Marcus
await page.getByRole("button", { name: /Marcus Reid/ }).click();
await page.getByRole("button", { name: /Program card for Marcus Reid/ }).click();
await page.waitForTimeout(400);
out.waitingState = await has("Place NFC card on reader");
await page.screenshot({ path: "/tmp/shots/cards_waiting.png" });
await tap("04A28B226F1C80");
await page.waitForTimeout(2000);
out.successState = await has("Card issued!");
const issue = calls.find((c) => c.action === "issue");
out.issueCall = issue ? JSON.stringify({ person: issue.person_key, uid: issue.uid, type: issue.card_type, access: issue.access_level, emp: issue.employee_id }) : "none";
out.consoleShowsApdu = await has("> FF 00 40 0E 04 02 00 01 01");
await page.screenshot({ path: "/tmp/shots/cards_success.png" });

// Duplicate card → refused, double beep
await page.getByRole("button", { name: /Andre Felix/ }).click();
await page.getByRole("button", { name: /Program card for Andre Felix/ }).click();
await tap("04AA11BB22CC33");
await page.waitForTimeout(2000);
out.duplicateRefused = await has("already assigned to Kevin Paul");
out.errorBeepSent = await has("> FF 00 40 5D 04 02 02 02 01");
await page.screenshot({ path: "/tmp/shots/cards_duplicate.png" });

// Batch mode: after a success, the next unassigned person is armed automatically
await page.getByRole("switch", { name: "Batch mode" }).click();
await page.getByRole("button", { name: /Program card for Andre Felix/ }).click();
await tap("04BB22CC33DD44");
await page.waitForTimeout(3200);
out.batchMovedTo = await page.getByRole("button", { name: /Waiting for .*'s card/ }).innerText().catch(() => "not waiting");

// Card not issued when nobody is waiting (tap ignored)
await page.getByRole("button", { name: "Cancel" }).click();
const before = calls.filter((c) => c.action === "issue").length;
await tap("04CC33DD44EE55");
await page.waitForTimeout(1200);
out.tapIgnoredWhenIdle = calls.filter((c) => c.action === "issue").length === before;

// Check a card
await page.getByRole("tab", { name: "Check a card" }).click();
await tap("04AA11BB22CC33");
await page.waitForTimeout(1500);
out.checkShowsOwner = await has("Kevin Paul");
await page.screenshot({ path: "/tmp/shots/cards_check.png" });

// Issued cards list + revoke
await page.getByRole("tab", { name: /Issued cards/ }).click();
await page.waitForTimeout(600);
out.issuedList = await page.locator("tbody tr").count();
await page.getByRole("button", { name: "Revoke" }).first().click();
await page.getByRole("button", { name: "Revoke card" }).click();
await page.waitForTimeout(800);
out.revokeCalled = calls.some((c) => c.action === "revoke");
await page.screenshot({ path: "/tmp/shots/cards_list.png" });
out.errors = errors.length ? errors : "none";
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(20), v);
await browser.close();
