import { test, expect } from "@playwright/test";

async function setup(page, { managed = true, release = null, supportEnabled = false } = {}) {
  const controls = [], writes = [], support = [];
  const device = { id: "tablet-managed", label: "Driver tablet test", company_id: "a", kiosk_type: "driver", vehicle_id: "bus-a",
    vehicle_name: "Bus A", status: "active", paired: true, last_seen: new Date().toISOString(),
    helper_health: { reported_at: new Date().toISOString(), support_available: supportEnabled, support_transport: "webrtc", management_available: true, management_owner: managed, management_locked: false, native_app_package: "com.transittrack.app", native_app_version: "1.0", native_app_code: 1, native_update_available: true, cellular_state: "ready", cellular_carrier: "FLOW", cellular_bars: 2, recovery_available: true, recovery_state: "recovered", internet_validated: true } };
  await page.addInitScript(() => localStorage.setItem("base44_access_token", "isolated-test-session"));
  await page.route("https://api.mapbox.com/**", r => r.fulfill({ status: 404, body: "" }));
  await page.route("**/api/**", r => {
    const url = r.request().url(), b = r.request().postDataJSON() || {};
    if (url.includes("/functions/tabletSupport")) {
      support.push(b);
      if(b.operation==="config")return r.fulfill({json:{enabled:supportEnabled}});
      return r.fulfill({json:{session:{id:"support-session",state:b.operation==="end"?"ended":"waiting_permission",expires_at:new Date(Date.now()+600000).toISOString()}}});
    }
    if (url.includes("/functions/tabletControl")) {
      if (b.operation === "release") return r.fulfill({ json: { release } });
      controls.push(b); device.control_status = { id: "a".repeat(32), action: b.action, state: "waiting", requested_at: new Date().toISOString(), expires_at: new Date(Date.now()+120000).toISOString() };
      return r.fulfill({ json: { ok: true, status: device.control_status } });
    }
    if (url.includes("/functions/entityAccess")) {
      if (["create", "update", "delete"].includes(b.operation)) writes.push(b);
      if (b.entity === "User") return r.fulfill({ json: { result: { id: "admin", role: "admin", full_name: "Test Admin" } } });
      if (b.entity === "AdminBootstrap") return r.fulfill({ json: { result: { datasets: Object.fromEntries((b.datasets || []).map(key => [key, key === "kiosks" ? [device] : []])), errors: {} } } });
      if (b.entity === "KioskDevice") return r.fulfill({ json: { result: [device] } });
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
 await page.route("**/functions/tabletSupport", r=>r.fulfill({json:{enabled:false}}));
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
