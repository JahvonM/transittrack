import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';

// The tabs of each admin hub work together: the bus, driver or route picked in
// one tab stays picked in the others (it rides in the address), and each tab
// links straight to the related one. Live fleet and Passengers are one page
// each: everything about a bus or a person opens in one panel.

function linkedData() {
  const data = fleetData();
  // Kevin Thomas drives Bus 1; Bus 2 has no driver yet.
  Object.assign(data.vehicles[0], { driver_id: 'drv-1', driver_name: 'Kevin Thomas' });
  data.tables.DriverShift[0].driver_id = 'drv-1';
  data.tables.DriverShift.push({ id: 'sh-2', company_id: 'a', vehicle_id: 'bus-b', vehicle_name: 'Bus 2', driver_id: 'drv-2', driver_name: 'Ana Joseph', started_at: new Date(Date.now() - 3_600_000).toISOString(), ended_at: new Date(Date.now() - 1_800_000).toISOString(), duration_minutes: 30 });
  // Rita Rider's boarding, and someone else's.
  data.tables.StaffCheckIn[0].person_key = 'user:u-pass';
  data.tables.StaffCheckIn.push({ id: 'c-2', company_id: 'a', vehicle_id: 'bus-b', vehicle_name: 'Bus 2', staff_name: 'Otto Other', status: 'boarded', boarded_at: new Date(Date.now() - 600_000).toISOString(), check_in_method: 'nfc', person_key: 'user:other' });
  return data;
}

async function open(page, path, data = linkedData()) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const session = await mockFleet(page, { role: 'admin', data });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  return { errors, session, data };
}
const tabs = (page, hub) => page.getByRole('navigation', { name: `${hub} tabs` });

test('Vehicles & drivers: a bus leads to its driver and their shifts, and the pick follows the tabs', async ({ page }) => {
  const { errors, session } = await open(page, '/admin/vehicles');
  await page.getByRole('link', { name: 'Open driver Kevin Thomas of Bus 1' }).click();
  await expect(page).toHaveURL(/\/admin\/drivers\?driver=drv-1&bus=bus-a$/);
  const kevin = page.locator('#driver-drv-1');
  await expect(kevin).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Picked: Kevin Thomas' })).toBeVisible();
  // Back to his bus from his card.
  await kevin.getByRole('link', { name: 'Open Bus 1 in Vehicles' }).click();
  await expect(page).toHaveURL(/\/admin\/vehicles\?bus=bus-a&driver=drv-1$/);
  await expect(page.locator('#vehicle-bus-a')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#vehicle-bus-b')).not.toHaveAttribute('aria-current', 'true');
  // The Driver shifts tab opens on him.
  await tabs(page, 'Vehicles & drivers').getByRole('link', { name: 'Driver shifts' }).click();
  await expect(page).toHaveURL(/\/admin\/shifts\?bus=bus-a&driver=drv-1$/);
  await expect(page.getByText("Showing Kevin Thomas's shifts only.")).toBeVisible();
  const table = page.getByRole('region', { name: 'All shifts table' });
  await expect(table.getByText('Kevin Thomas')).toBeVisible();
  await expect(table.getByText('Ana Joseph')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(table.getByText('Ana Joseph')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/shifts$/);
  // A bus without a driver: assign one straight from the Drivers tab.
  await tabs(page, 'Vehicles & drivers').getByRole('link', { name: 'Vehicles' }).click();
  await page.getByRole('link', { name: 'Assign a driver to Bus 2' }).click();
  await expect(page).toHaveURL(/\/admin\/drivers\?bus=bus-b$/);
  await expect(page.getByText('Bus 2 has no driver.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Driver for Bus 2' }).click();
  await page.getByRole('option', { name: 'Ana Joseph' }).click();
  await expect.poll(() => session.calls.some((c) => c.fn === 'entityAccess' && c.body?.entity === 'Vehicle' && c.body?.operation === 'update' && c.body?.id === 'bus-b' && c.body?.data?.driver_id === 'drv-2')).toBe(true);
  await expect(page).toHaveURL(/driver=drv-2/);
  await expect(page.locator('#driver-drv-2')).toHaveAttribute('aria-current', 'true');
  await page.screenshot({ path: '/tmp/tt-admin-connected-drivers.png' });
  expect(errors).toEqual([]);
});

test('Passengers: one panel per person with their company, bus, pickup, card, printed card and sign-ins', async ({ page }) => {
  const { errors } = await open(page, '/admin/directory');
  // One page: no tabs under the title.
  await expect(page.getByRole('navigation', { name: /tabs$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Rita Rider' }).click();
  const panel = page.getByRole('dialog', { name: 'Rita Rider' });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/directory\?person=user%3Au-pass$/);
  await expect(panel.getByRole('region', { name: 'Company, bus and pickup' })).toContainText('Bus 1');
  await expect(panel.getByRole('list', { name: "Rita Rider's recent sign-ins" })).toContainText('Got on Bus 1');
  await expect(panel.getByText('Otto Other')).toHaveCount(0);
  // Her card is programmed right in her panel, and her printed card shows there.
  await expect(panel.getByRole('region', { name: 'Card', exact: true }).getByRole('button', { name: 'Program card' })).toBeVisible();
  await expect(panel.getByTestId('person-card-preview')).toContainText('Rita Rider');
  await page.screenshot({ path: '/tmp/tt-admin-connected-person.png' });
  // See all: the sign-in log, hers only. Closing it comes back to her panel.
  await panel.getByRole('button', { name: 'See all' }).click();
  const log = page.getByRole('dialog', { name: 'Sign-in log' });
  await expect(log.getByText("Showing Rita Rider's boardings only.")).toBeVisible();
  await expect(log.getByText('Otto Other')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(log).toBeHidden();
  await expect(panel).toBeVisible();
  // Design and print opens the card designer on her.
  await panel.getByRole('button', { name: 'Design and print' }).click();
  const design = page.getByRole('dialog', { name: 'Card design' });
  await expect(design.getByTestId('card-artwork-preview')).toContainText('Rita Rider');
  await page.keyboard.press('Escape');
  await expect(design).toBeHidden();
  await expect(panel).toBeVisible();
  // Closing her panel lets her go: the full sign-in log shows everyone.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/directory$/);
  await page.getByRole('button', { name: 'Full sign-in log' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign-in log' }).getByText('Otto Other')).toBeVisible();
  await expect(page.getByText("Showing Rita Rider's boardings only.")).toHaveCount(0);
  // An old link to her sign-ins still opens them, and "Show everyone" lets her go.
  await page.goto('/admin/checkins?person=user%3Au-pass');
  await expect(page.getByRole('dialog', { name: 'Sign-in log' }).getByText("Showing Rita Rider's boardings only.")).toBeVisible();
  await page.getByRole('button', { name: 'Show everyone' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign-in log' }).getByText('Otto Other')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/checkins$/);
  expect(errors).toEqual([]);
});

test('Live fleet: a bus picked anywhere opens its panel, and its parts come back to it', async ({ page }) => {
  const { errors } = await open(page, '/admin/fleet');
  await page.getByRole('region', { name: 'Buses' }).getByRole('button', { name: /^Bus 1, / }).click();
  await expect(page).toHaveURL(/\/admin\/fleet\?bus=bus-a$/);
  const bus1 = page.getByRole('dialog', { name: 'Bus 1' });
  await expect(bus1.getByRole('region', { name: 'Now' })).toContainText('Kevin Thomas');
  // Its tablets and GPS are in its panel; Whole fleet opens the health table
  // and closing it comes back to Bus 1.
  await expect(bus1.getByRole('region', { name: 'Tablets and GPS' })).toBeVisible();
  await bus1.getByRole('button', { name: 'Whole fleet' }).click();
  const health = page.getByRole('dialog', { name: 'Fleet health' });
  await expect(health.getByRole('region', { name: 'Fleet health table' })).toContainText('Bus 2');
  await page.keyboard.press('Escape');
  await expect(health).toBeHidden();
  await expect(bus1).toBeVisible();
  // From the health table, a bus's name opens that bus.
  await expect(page.locator('[role=dialog][data-state=closed]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(bus1).toBeHidden();
  await page.getByRole('main').getByRole('button', { name: 'Fleet health', exact: true }).click();
  await health.getByRole('button', { name: 'Open Bus 2', exact: true }).click();
  await expect(health).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Bus 2' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/fleet\?bus=bus-b$/);
  // Old links to a bus in Fleet health or Fleet workspace open its panel.
  for (const path of ['/admin/health?bus=bus-a', '/admin/fleet-workspace?bus=bus-a']) {
    await page.goto(path);
    await expect(page.getByRole('dialog', { name: 'Bus 1' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /^(Fleet health|Cameras)$/ })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('Routes: the route picked in the planner opens in the explorer, Plan pickups and Travel times', async ({ page }) => {
  const data = linkedData();
  data.tables.Route.push({ id: 'route-b', company_id: 'a', company_name: data.company.name, name: 'Hill route', type: 'staff', active: true, stops: [] });
  const { errors } = await open(page, '/admin/route-planner', data);
  await page.route('**/functions/routeStops', (route) => route.fulfill({ json: {
    companies: [{ id: 'a', name: data.company.name }],
    routes: [{ id: 'route-a', name: 'Coastal route', company_id: 'a', stops: [] }, { id: 'route-b', name: 'Hill route', company_id: 'a', stops: [] }],
    buses: [{ id: 'bus-a', name: 'Bus 1', company_id: 'a', route_id: 'route-a', route_name: 'Coastal route', capacity: 25, riders: 1 }],
    people: [
      { key: 'user:u-pass', company_id: 'a', name: 'Rita Rider', status: 'needs_bus', pickup: { lat: 12.01, lng: -61.77, name: 'Grand Anse' }, route_id: 'route-a', route_name: 'Coastal route', suggested: { id: 'bus-a', name: 'Bus 1' } },
      { key: 'user:hill', company_id: 'a', name: 'Hal Hill', status: 'route_no_bus', pickup: { lat: 12.03, lng: -61.75, name: 'Hilltop' }, route_id: 'route-b', route_name: 'Hill route' },
    ],
  } }));
  await page.getByRole('region', { name: 'Routes' }).getByRole('button', { name: /Coastal route/ }).click();
  await expect(page).toHaveURL(/\/admin\/route-planner\?route=route-a$/);
  await tabs(page, 'Routes').getByRole('link', { name: 'Route explorer' }).click();
  await expect(page.getByRole('group', { name: 'Choose a route' }).getByRole('button', { name: 'Coastal route' })).toHaveAttribute('aria-pressed', 'true');
  await tabs(page, 'Routes').getByRole('link', { name: 'Plan pickups' }).click();
  await expect(page).toHaveURL(/\/admin\/plan-pickups\?route=route-a$/);
  await expect(page.getByText('Showing riders of Coastal route only.')).toBeVisible();
  await expect(page.getByText('Rita Rider').first()).toBeVisible();
  await expect(page.getByText('Hal Hill')).toHaveCount(0);
  await tabs(page, 'Routes').getByRole('link', { name: 'Travel times' }).click();
  await expect(page.getByText('Showing Coastal route only.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Travel times for Hill route' })).toHaveCount(0);
  // From a route's travel times straight back to the planner.
  await page.getByRole('link', { name: 'Open Coastal route in the Route planner' }).click();
  await expect(page).toHaveURL(/\/admin\/route-planner\?route=route-a$/);
  await expect(page.getByRole('region', { name: 'Routes' }).getByRole('button', { name: /Coastal route/ })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
