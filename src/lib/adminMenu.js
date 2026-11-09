// The admin sidebar, by section id. Each section's label and icon live with
// ADMIN_SECTIONS in components/admin/AdminShell.jsx.
//
// A hub is one sidebar link for a few related sections. Its page shows them as
// tabs under the title. Each tab keeps its own address (/admin/<section id>),
// so links and bookmarks to any of them still open that tab.
//
// `carry` is what the tabs share: the bus, driver, route or person picked in
// one tab rides along in the address (?bus=…), so the next tab opens on it.
export const ADMIN_HUBS = [
  {
    // Jobs to do, and the finished ones with their billing, in one place.
    id: "jobs",
    label: "Jobs",
    carry: [],
    tabs: [
      { id: "trips", label: "Jobs" },
      { id: "billing", label: "Completed & billing" },
    ],
  },
  {
    id: "live",
    label: "Live fleet",
    carry: ["bus"],
    tabs: [
      { id: "fleet", label: "Live map" },
      { id: "fleet-workspace", label: "Fleet workspace" },
      { id: "health", label: "Fleet health" },
    ],
  },
  {
    id: "vehicles-drivers",
    label: "Vehicles & drivers",
    carry: ["bus", "driver"],
    tabs: [
      { id: "vehicles", label: "Vehicles" },
      { id: "drivers", label: "Drivers" },
      { id: "shifts", label: "Driver shifts" },
    ],
  },
  {
    id: "routes",
    label: "Routes",
    carry: ["route"],
    tabs: [
      { id: "route-planner", label: "Route planner" },
      { id: "route-explorer", label: "Route explorer" },
      { id: "plan-pickups", label: "Plan pickups" },
      { id: "travel-times", label: "Travel times" },
    ],
  },
  {
    id: "passengers",
    label: "Passengers",
    carry: ["person"],
    tabs: [
      { id: "directory", label: "Directory" },
      { id: "signup-day", label: "Sign-up day" },
      { id: "cards", label: "Card issuing" },
      { id: "card-designs", label: "Card designer" },
      { id: "checkins", label: "Sign-in log" },
    ],
  },
];

// The sidebar from top to bottom. A string is one section, { hub } a hub
// link, { group } a folding group, and "divider" starts the quieter part at
// the bottom. Office displays is reached from Settings.
export const ADMIN_MENU = [
  "overview",
  { hub: "live" },
  { hub: "jobs" },
  { hub: "vehicles-drivers" },
  { hub: "routes" },
  { hub: "passengers" },
  "users",
  "companies",
  { group: "Maintenance", ids: ["service", "faults", "parts", "schedule", "calendar", "templates", "inspection-history", "service-history", "incident-reports", "safety-standards"] },
  { group: "Operations", ids: ["kiosks", "messaging", "lost-items", "ride-history", "passenger-bookings", "support"] },
  "divider",
  "ads",
  { group: "Reports", ids: ["vehicle-logs", "driving-reports", "route-analytics", "fleet-analytics"] },
  "profile",
  { group: "All tools", ids: ["notifications", "app-errors", "audit", "data"] },
];

// The hub a section is a tab of, or null.
export function hubOf(section) {
  return ADMIN_HUBS.find((h) => h.tabs.some((t) => t.id === section)) || null;
}

// The part of an address a hub's other tabs keep ("?bus=b1"), or "".
export function carriedSearch(section, search) {
  const hub = hubOf(section);
  if (!hub?.carry?.length) return "";
  const from = new URLSearchParams(search || "");
  const out = new URLSearchParams();
  for (const key of hub.carry) {
    const value = from.get(key);
    if (value) out.set(key, value);
  }
  const text = out.toString();
  return text ? "?" + text : "";
}

// The folding group a section is in, or null.
export function groupOf(section) {
  return ADMIN_MENU.find((e) => e && e.group && e.ids.includes(section))?.group || null;
}

// Every section the sidebar reaches (a hub reaches all of its tabs).
export function menuSections() {
  return ADMIN_MENU.flatMap((e) => {
    if (e === "divider") return [];
    if (typeof e === "string") return [e];
    if (e.hub) return ADMIN_HUBS.find((h) => h.id === e.hub).tabs.map((t) => t.id);
    return e.ids;
  });
}

// The tab a hub link opens: the one last used in that hub while the console
// has been open, else its first tab.
const lastTab = new Map();
export function rememberTab(section) {
  const hub = hubOf(section);
  if (hub) lastTab.set(hub.id, section);
}
export function hubTarget(hubId) {
  const hub = ADMIN_HUBS.find((h) => h.id === hubId);
  if (!hub) return null;
  const last = lastTab.get(hubId);
  return hub.tabs.some((t) => t.id === last) ? last : hub.tabs[0].id;
}
