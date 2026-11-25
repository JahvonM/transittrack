import { test, expect } from "@playwright/test";

async function setup(page, { managed = true, release = null, supportEnabled = false, kiosk = null, others = [] } = {}) {
  const controls = [], writes = [], support = [];
  const device = { id: "tablet-managed", label: "Driver tablet test", company_id: "a", kiosk_type: "driver", vehicle_id: "bus-a",
    vehicle_name: "Bus A", status: "active", paired: true, last_seen: new Date().toISOString(),
    helper_health: { reported_at: new Date().toISOString(), support_available: supportEnabled, support_transport: "webrtc", management_available: true, management_owner: managed, management_locked: false, native_app_package: "com.transittrack.app", native_app_version: "1.0", native_app_code: 1, native_update_available: true, cellular_state: "ready", cellular_carrier: "FLOW", cellular_bars: 2, recovery_available: true, recovery_state: "recovered", internet_validated: true, ...(kiosk || {}) } };
  await page.addInitScript(() => localStorage.setItem('sb-localhost-auth-token',JSON.stringify({access_token:"isolated-test-session",refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:4102444800,user:{id:'test-user'}})));
  await page.route("https://api.mapbox.com/**", r => r.fulfill({ status: 404, body: "" }));
  await page.route("**/api/**", r => {
    const url = r.request().url(), b = r.request().postDataJSON() || {};
    if (url.includes("/functions/v1/tabletSupport")) {
      support.push(b);
      if(b.operation==="config")return r.fulfill({json:{enabled:supportEnabled}});
      return r.fulfill({json:{session:{id:"support-session",state:b.operation==="end"?"ended":"waiting_permission",expires_at:new Date(Date.now()+600000).toISOString()}}});
    }
    if (url.includes("/functions/v1/tabletControl")) {
      if (b.operation === "release") return r.fulfill({ json: { release } });
      controls.push(b); device.control_status = { id: "a".repeat(32), action: b.action, state: "waiting", requested_at: new Date().toISOString(), expires_at: new Date(Date.now()+120000).toISOString() };
      return r.fulfill({ json: { ok: true, status: device.control_status } });
    }
    if (url.includes("/functions/v1/entityAccess")) {
      if (["create", "update", "delete"].includes(b.operation)) writes.push(b);
      if (b.operation === "update" && b.entity === "KioskDevice" && b.id === device.id) Object.assign(device, b.data);
      if (b.entity === "User") return r.fulfill({ json: { result: { id: "admin", role: "admin", full_name: "Test Admin" } } });
      if (b.entity === "AdminBootstrap") return r.fulfill({ json: { result: { datasets: Object.fromEntries((b.datasets || []).map(key => [key, key === "kiosks" ? [device, ...others] : []])), errors: {} } } });
      if (b.entity === "KioskDevice") return r.fulfill({ json: { result: [device, ...others] } });
      return r.fulfill({ json: { result: [] } });
    }
    return r.fulfill({ json: { id: "test-app", public_settings: { authentication_required: false } } });
  });
  return { controls, writes, support };
}
test("admin tablet actions require a deliberate confirmation and never edit device records directly", async ({ page }) => {
  const { controls, writes } = await setup(page);
  await page.goto("/admin/kiosks");
  await page.getByRole("button", { name: "Tablet controls", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Managed Android controls are available");
  await page.getByRole("button", { name: "Restart tablet", exact: true }).click();
  expect(controls).toHaveLength(0);
  await expect(page.getByRole("dialog")).toContainText("Saved uploads");
  await page.getByRole("button", { name: "Send admin request", exact: true }).click();
  await expect.poll(() => controls.length).toBe(1);
  expect(controls[0]).toEqual({ operation: "request", device_id: "tablet-managed", action: "reboot" });
  await expect(page.getByRole("dialog")).toContainText("Waiting for tablet");
  expect(writes).toHaveLength(0);
  await page.screenshot({ path: "/tmp/tt-managed-admin.png", fullPage: true });
});
test("unmanaged tablets explain Android restriction and cannot submit lock or restart", async ({ page }) => {
  const { controls } = await setup(page, { managed: false });
  await page.goto("/admin/kiosks");
  await page.getByRole("button", { name: "Tablet controls", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("has not granted this app managed-device ownership");
  await expect(page.getByRole("button", { name: "Restart tablet", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Test kiosk lock · 10 min", exact: true })).toBeDisabled();
  expect(controls).toHaveLength(0);
});

test("native release check reports installed APK and does not send an installation without a release", async ({ page }) => {
  const { controls, writes } = await setup(page);
  await page.goto("/admin/kiosks");
  await page.getByRole("button", { name: "Tablet controls", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("1.0 · build 1");
  await page.getByRole("button", { name: "Check native update", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No approved combined kiosk APK");
  await expect(page.getByRole("button", { name: "Request native update", exact: true })).toHaveCount(0);
  expect(controls).toHaveLength(0); expect(writes).toHaveLength(0);
  await page.screenshot({ path: "/tmp/tt-native-update-admin.png", fullPage: true });
});
test("native update has its own deliberate admin request, with no client APK URL", async ({ page }) => {
  const { controls, writes } = await setup(page, { release: { id: "kiosk-2", version_name: "1.1", version_code: 2 } });
  await page.goto("/admin/kiosks");
  await page.getByRole("button", { name: "Tablet controls", exact: true }).click();
  await page.getByRole("button", { name: "Check native update", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Available: 1.1 · build 2");
  expect(controls).toHaveLength(0);
  await page.getByRole("button", { name: "Request native update", exact: true }).click();
  await expect.poll(() => controls.length).toBe(1);
  expect(controls[0]).toEqual({ operation: "request", device_id: "tablet-managed", action: "app_update", release_id: "kiosk-2" });
  expect(writes).toHaveLength(0);
});

test("remote viewing stays unavailable without service configuration", async ({ page }) => {
 await setup(page);
 await page.route("**/functions/v1/tabletSupport", r=>r.fulfill({json:{enabled:false}}));
 await page.goto("/admin/kiosks");
 await page.getByRole("button",{name:"Tablet controls",exact:true}).click();
 await expect(page.getByText("Direct remote viewing is not enabled yet.")).toBeVisible();
 await expect(page.getByRole("button",{name:"View screen",exact:true})).toBeDisabled();
});
test("admin requests permission and can stop before capture", async ({ page }) => {
 const {support}=await setup(page,{supportEnabled:true});
 await page.goto("/admin/kiosks");
 await page.getByRole("button",{name:"Tablet controls",exact:true}).click();
 await page.getByRole("button",{name:"View screen",exact:true}).click();
 await expect(page.getByText("Waiting for tablet startup or Android permission")).toBeVisible();
 expect(support.filter(x=>x.operation==="request")).toEqual([{operation:"request",device_id:"tablet-managed",capability:"screen"}]);
 expect(support.some(x=>x.operation==="viewer")).toBe(false);
 await page.getByRole("button",{name:"Stop viewing",exact:true}).click();
 await expect.poll(()=>support.some(x=>x.operation==="end")).toBe(true);
 await expect(page.getByRole("button",{name:"View screen",exact:true})).toBeEnabled();
 await page.screenshot({path:"/tmp/tt-support-admin.png",fullPage:true});
});
test("closing the admin controls ends a pending viewing session", async ({page})=>{
 const {support}=await setup(page,{supportEnabled:true});
 await page.goto("/admin/kiosks");
 await page.getByRole("button",{name:"Tablet controls",exact:true}).click();
 await page.getByRole("button",{name:"View front camera",exact:true}).click();
 await expect(page.getByText("Waiting for tablet startup or Android permission")).toBeVisible();
 await page.keyboard.press("Escape");
 await expect.poll(()=>support.some(x=>x.operation==="end")).toBe(true);
});

test("admin sees cellular and screen recovery health without starting a control session", async ({ page }) => {
  const { controls, writes, support } = await setup(page);
  await page.goto("/admin/kiosks");
  await expect(page.getByText("FLOW · 2/4 signal (last reading)", { exact: true })).toBeVisible();
  await expect(page.getByText("Kiosk screen recovered", { exact: true })).toBeVisible();
  expect(controls).toEqual([]); expect(writes).toEqual([]); expect(support).toEqual([]);
});

test("permanent kiosk setup is capability-gated and never collects a PIN in the admin page", async ({ page }) => {
  const { controls } = await setup(page, { kiosk: { kiosk_available: true, kiosk_enabled: false, kiosk_recovery_ready: false } });
  await page.goto("/admin/kiosks");
  await page.getByRole("button", { name: "Tablet controls", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable permanent kiosk", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Set recovery PIN", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Set and confirm an 8–12 digit recovery PIN there");
  expect(controls).toHaveLength(0);
  await page.getByRole("button", { name: "Send admin request", exact: true }).click();
  await expect.poll(() => controls.length).toBe(1);
  expect(controls[0]).toEqual({ operation: "request", device_id: "tablet-managed", action: "kiosk_prepare" });
});

test("ready managed kiosk can deliberately enable permanent locking", async ({ page }) => {
  const { controls } = await setup(page, { kiosk: { kiosk_available: true, kiosk_enabled: false, kiosk_recovery_ready: true } });
  await page.goto("/admin/kiosks");
  await page.getByRole("button", { name: "Tablet controls", exact: true }).click();
  await expect(page.getByLabel("Managed kiosk status")).toContainText("Recovery PIN: ready");
  await page.getByRole("button", { name: "Enable permanent kiosk", exact: true }).click();
  expect(controls).toHaveLength(0);
  await page.getByRole("button", { name: "Send admin request", exact: true }).click();
  await expect.poll(() => controls.length).toBe(1);
  expect(controls[0].action).toBe("kiosk_enable");
});

test("older installations cannot issue permanent kiosk commands", async ({ page }) => {
  const { controls } = await setup(page);
  await page.goto("/admin/kiosks");
  await page.getByRole("button", { name: "Tablet controls", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set recovery PIN", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enable permanent kiosk", exact: true })).toBeDisabled();
  expect(controls).toHaveLength(0);
});

test("each paired tablet says how its pass stands, and the top line counts the ones to fix", async ({ page }) => {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
  const tablet = (id, label, pass) => ({ id, label, company_id: "a", kiosk_type: "bus_boarding", vehicle_id: "bus-a", vehicle_name: "Bus A", status: "active", paired: true, last_seen: new Date().toISOString(), pass });
  await setup(page, { others: [
    tablet("moved", "Moved tablet", { state: "moved", expires_at: day(40) }),
    tablet("soon", "Ending tablet", { state: "expiring", expires_at: day(12) }),
    tablet("fine", "Fine tablet", { state: "ok", expires_at: day(80) }),
  ] });
  await page.goto("/admin/kiosks");
  await expect(page.getByRole("status").filter({ hasText: "1 tablet needs a new pairing code now · 1 tablet's pass ends within 30 days" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Needs a new pairing code" })).toContainText("Its bus, company or type changed after it was paired");
  await expect(page.getByText(/^Pass ends /)).toBeVisible();
  await expect(page.getByText("In 12 days.", { exact: false })).toBeVisible();
  await expect(page.getByText(/^Pass until /)).toBeVisible();
});

test("an admin renews a pass in its last 30 days after confirming, and only that tablet offers it", async ({ page }) => {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
  const tablet = (id, label, pass) => ({ id, label, company_id: "a", kiosk_type: "bus_boarding", vehicle_id: "bus-a", vehicle_name: "Bus A", status: "active", paired: true, last_seen: new Date().toISOString(), pass });
  const ending = tablet("soon", "Ending tablet", { state: "expiring", expires_at: day(12) });
  await setup(page, { others: [
    tablet("moved", "Moved tablet", { state: "moved", expires_at: day(40) }),
    ending,
    tablet("gone", "Ended tablet", { state: "expired", expires_at: day(-2) }),
    tablet("fine", "Fine tablet", { state: "ok", expires_at: day(80) }),
  ] });
  const renewals = [];
  await page.route("**/functions/v1/manageAccessCodes", (r) => {
    renewals.push(r.request().postDataJSON());
    ending.pass = { state: "ok", expires_at: day(90) };
    return r.fulfill({ json: { ok: true, expires_at: day(90) } });
  });
  await page.goto("/admin/kiosks");
  await expect(page.getByRole("button", { name: /^Renew pass for / })).toHaveCount(1);
  // Backing out changes nothing.
  await page.getByRole("button", { name: "Renew pass for Ending tablet" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Renew Ending tablet's pass?");
  await expect(confirm).toContainText("90 more days");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  expect(renewals).toEqual([]);
  // Confirming renews only that tablet.
  await page.getByRole("button", { name: "Renew pass for Ending tablet" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Renew pass" }).click();
  await expect.poll(() => renewals).toEqual([{ action: "renew_pass", device_id: "soon" }]);
  await expect(page.getByText("Pass renewed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Renew pass for / })).toHaveCount(0);
});

test("admin switches a driver tablet between the GPS module and the tablet's own GPS", async ({ page }) => {
  const { writes, controls } = await setup(page, { kiosk: { gps_source: "usb", gps: "Fix (8 sats)" } });
  await page.goto("/admin/kiosks");
  const gps = page.getByRole("radiogroup", { name: "GPS for Driver tablet test" });
  await expect(gps.getByRole("radio", { name: "Set on the tablet" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Using the GPS module · Fix (8 sats)", { exact: true })).toBeVisible();
  await gps.getByRole("radio", { name: "Tablet's own GPS" }).click();
  await expect.poll(() => writes.find(w => w.entity === "KioskDevice" && w.operation === "update")).toMatchObject({ id: "tablet-managed", data: { gps_source: "tablet" } });
  await expect(gps.getByRole("radio", { name: "Tablet's own GPS" })).toHaveAttribute("aria-checked", "true");
  // The tablet still says it uses the module until its next check-in.
  await expect(page.getByText(/Using the GPS module · Fix \(8 sats\)\. Switching/)).toBeVisible();
  await gps.getByRole("radio", { name: "Set on the tablet" }).click();
  await expect.poll(() => writes.filter(w => w.entity === "KioskDevice").at(-1)?.data).toEqual({ gps_source: null });
  expect(controls).toEqual([]);
});

