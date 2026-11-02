import { test, expect } from "@playwright/test";
import { fleetData, mockFleet } from "./helpers/fleetFixture.js";

// Admin → Office displays: every control, against a fake officeDisplay
// server and (where noted) a fake McSween Transport Desktop bridge that
// records what the Windows app would do. Simulated: no real monitors.

const SHOTS = process.env.SHOTS || "";

function adminServer() {
  const s = { displays: [], calls: [], seq: 0, streaming: true };
  const view = (d) => ({ ...d, connected: !!d.token, online: !!d.token && d.kind === "paired", last_seen_at: d.token ? new Date().toISOString() : null, cameras: d.cameras || [] });
  const find = (id) => s.displays.find((d) => d.id === id);
  s.handle = (body) => {
    s.calls.push(body);
    const d = body.display_id ? find(body.display_id) : null;
    switch (body.action) {
      case "list": return { displays: s.displays.map(view), companies: [{ id: "a", name: "Mc Sween's Transport" }], vehicles: [{ id: "bus-a", name: "Bus 1", plate_number: "HB 211", company_id: "a" }, { id: "bus-b", name: "Bus 2", plate_number: "HB 305", company_id: "a" }],
        cameras: [{ id: "cam-1", vehicle_id: "bus-a", vehicle_name: "Bus 1", label: "Driver tablet", company_id: "a" }], streaming: s.streaming, limits: { max_cameras: 4, max_displays: 20 } };
      case "save": {
        if (d) { Object.assign(d, body.settings); return { display: view(d) }; }
        const created = { id: `disp-${++s.seq}`, status: "active", blanked: false, ...body.settings };
        s.displays.push(created);
        return { display: view(created) };
      }
      case "window_open": d.token = "e".repeat(64); return { display_token: d.token, access_until: new Date(Date.now() + 7_200_000).toISOString() };
      case "window_close": if (d) d.token = null; return { ok: true };
      case "window_renew": return { ok: true };
      case "blank": d.blanked = body.blanked; return { display: view(d) };
      case "revoke": d.token = null; d.status = "revoked"; return { display: view(d) };
      case "delete": s.displays = s.displays.filter((x) => x !== d); return { ok: true };
      case "pair_approve": if (body.code !== "K7Q4MZ") return { status: 404, json: { error: "That code isn't valid or has expired." } }; d.token = "p".repeat(64); d.status = "active"; return { ok: true, display: view(d) };
      case "camera_start": d.cameras = [{ session_id: "s1", device_id: "cam-1", state: "requested", expires_at: new Date(Date.now() + 600_000).toISOString() }]; return { results: [{ device_id: "cam-1", ok: true }], display: view(d) };
      case "camera_stop": d.cameras = []; return { display: view(d) };
      default: return { status: 400, json: { error: "Invalid request" } };
    }
  };
  return s;
}

async function openPage(page, server, { bridge = false, viewport = { width: 1440, height: 1000 } } = {}) {
  await page.setViewportSize(viewport);
  await mockFleet(page, { role: "admin", data: fleetData() });
  await page.route("**/functions/officeDisplay", async (route) => {
    const r = server.handle(route.request().postDataJSON());
    await route.fulfill(r?.status ? { status: r.status, json: r.json } : { json: r });
  });
  if (bridge) {
    await page.addInitScript(() => {
      const calls = [], wins = [], listeners = [];
      const emit = () => listeners.forEach((f) => f(wins.map((w) => ({ ...w }))));
      window.__bridgeCalls = calls;
      window.transittrackDesktop = { openSetup: async () => {}, displays: {
        screens: async () => [{ id: "1", label: "Screen 1", primary: true, width: 1920, height: 1080, scale: 1.25 }, { id: "2", label: "Screen 2", primary: false, width: 3840, height: 2160, scale: 1.5 }],
        list: async () => wins.map((w) => ({ ...w })),
        open: async (o) => { calls.push(["open", o.id, o.screen_id, /^[a-f0-9]{64}$/.test(o.token)]); const w = wins.find((x) => x.id === o.id); if (w) w.screen_id = o.screen_id; else wins.push({ id: o.id, name: o.name, fullscreen: true, minimized: false, screen_id: o.screen_id }); emit(); return { reused: !!w }; },
        close: async (id) => { calls.push(["close", id]); const i = wins.findIndex((w) => w.id === id); if (i >= 0) wins.splice(i, 1); emit(); return { ok: true }; },
        closeAll: async () => { calls.push(["closeAll"]); wins.splice(0); emit(); return { ok: true }; },
        fullscreen: async (id) => { calls.push(["fullscreen", id]); const w = wins.find((x) => x.id === id); w.fullscreen = !w.fullscreen; emit(); return { ok: true }; },
        refresh: async (id) => { calls.push(["refresh", id]); return { ok: true }; },
        show: async (id) => { calls.push(["show", id]); return { ok: true }; },
        onChange: (f) => { listeners.push(f); return () => listeners.splice(listeners.indexOf(f), 1); },
      } };
    });
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin/office-displays");
  await expect(page.getByRole("button", { name: "Add display" }).first()).toBeVisible();
  return errors;
}

async function addDisplay(page, { name, paired = false, layout = "Dispatch board" }) {
  await page.getByRole("button", { name: "Add display" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name").fill(name);
  if (paired) await dialog.getByText("Another computer or a TV browser").click();
  await dialog.getByText(layout, { exact: true }).click();
  await dialog.getByRole("button", { name: "Add display" }).click();
}

test("a monitor on this computer: add, open on the TV, full screen, refresh, close", async ({ page }) => {
  const server = adminServer();
  const errors = await openPage(page, server, { bridge: true });
  await expect(page.getByText("No office displays yet")).toBeVisible();
  // Saving without a name says what's missing.
  await page.getByRole("button", { name: "Add display" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Add display" }).click();
  await expect(page.getByRole("alert")).toHaveText("Give the display a name, such as Office TV.");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  await addDisplay(page, { name: "Office TV" });
  const saved = server.calls.find((c) => c.action === "save").settings;
  expect(saved).toMatchObject({ name: "Office TV", kind: "window", layout: "dispatch", company_ids: ["a"], vehicle_ids: [], show_guest_names: false });
  await expect(page.getByRole("heading", { name: "Office TV" })).toBeVisible();
  await expect(page.getByText("Not open")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Monitor/ })).toHaveValue("2"); // the TV, not the main screen
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-office-displays.png`, fullPage: true });

  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("Open, full screen")).toBeVisible();
  expect(await page.evaluate(() => window.__bridgeCalls)).toContainEqual(["open", "disp-1", "2", true]);
  await page.getByRole("button", { name: "Leave full screen" }).click();
  await expect(page.getByText("Open in a window")).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Not open")).toBeVisible();
  const calls = await page.evaluate(() => window.__bridgeCalls.map((c) => c[0]));
  expect(calls).toEqual(expect.arrayContaining(["open", "fullscreen", "refresh", "close"]));
  expect(server.calls.map((c) => c.action)).toEqual(expect.arrayContaining(["window_open", "window_close"]));
  expect(errors).toEqual([]);
});

test("a paired screen: pair with a code, wrong code explained, revoke", async ({ page }) => {
  const server = adminServer();
  await openPage(page, server);
  await addDisplay(page, { name: "Lobby TV", paired: true, layout: "Fleet overview" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("app.mcsweenstransport.com/display/pair")).toBeVisible();
  await dialog.getByLabel("Code shown on the screen").fill("zzzzzz");
  await dialog.getByRole("button", { name: "Pair screen" }).click();
  await expect(dialog.getByRole("alert")).toContainText("isn't valid or has expired");
  await dialog.getByLabel("Code shown on the screen").fill("k7q4mz");
  await dialog.getByRole("button", { name: "Pair screen" }).click();
  await expect(page.getByText("Screen paired", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Online/)).toBeVisible();
  await page.getByRole("button", { name: "Revoke access" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByText("Access revoked")).toBeVisible();
  expect(server.calls.map((c) => c.action)).toEqual(expect.arrayContaining(["pair_approve", "revoke"]));
});

test("cameras start only from an explicit button and can be stopped", async ({ page }) => {
  const server = adminServer();
  await openPage(page, server, { bridge: true });
  await page.getByRole("button", { name: "Add display" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name").fill("Yard cameras");
  await dialog.getByText("Cameras + map", { exact: true }).click();
  await dialog.getByText("Bus 1 · Driver tablet").click();
  await expect(dialog.getByText("Rotation")).toHaveCount(0); // cameras never rotate
  await dialog.getByRole("button", { name: "Add display" }).click();
  expect(server.calls.filter((c) => c.action === "camera_start")).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Start viewing (10 min)" })).toBeDisabled(); // window not open yet
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Start viewing (10 min)" }).click();
  await expect(page.getByText(/Viewing until/)).toBeVisible();
  await page.getByRole("button", { name: "Stop viewing" }).click();
  await expect(page.getByText(/Viewing until/)).toHaveCount(0);
  expect(server.calls.map((c) => c.action)).toEqual(expect.arrayContaining(["camera_start", "camera_stop"]));
});

test("blank, change, delete; and without the Windows app the monitor option explains itself", async ({ page }) => {
  const server = adminServer();
  await openPage(page, server, { viewport: { width: 390, height: 844 } });
  await addDisplay(page, { name: "Office TV", layout: "Maintenance board" });
  await expect(page.getByText("Open this page in McSween Transport Desktop")).toBeVisible();
  await page.getByRole("button", { name: "Blank screen" }).click();
  await expect(page.getByText("Blanked")).toBeVisible();
  await page.getByRole("button", { name: "Show screen" }).click();
  await expect(page.getByText("Blanked")).toHaveCount(0);
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("dialog").getByText("Light", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/· Light ·/)).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete display" }).click();
  await expect(page.getByText("No office displays yet")).toBeVisible();
  const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(scrollsSideways).toBe(false);
});
