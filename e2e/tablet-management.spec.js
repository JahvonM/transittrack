import { test, expect } from "@playwright/test";

async function setup(page, { managed = true } = {}) {
  const controls = [], writes = [];
  const device = { id: "tablet-managed", label: "Driver tablet test", company_id: "a", kiosk_type: "driver", vehicle_id: "bus-a",
    vehicle_name: "Bus A", status: "active", paired: true, last_seen: new Date().toISOString(),
    helper_health: { reported_at: new Date().toISOString(), management_available: true, management_owner: managed, management_locked: false } };
  await page.addInitScript(() => localStorage.setItem("base44_access_token", "isolated-test-session"));
  await page.route("https://api.mapbox.com/**", r => r.fulfill({ status: 404, body: "" }));
  await page.route("**/api/**", r => {
    const url = r.request().url(), b = r.request().postDataJSON() || {};
    if (url.includes("/functions/tabletControl")) {
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
  return { controls, writes };
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
