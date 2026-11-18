// Admin → Kiosk tablets: which GPS a driver tablet uses (see TabletGpsControls).
// The tablet picks the choice up on its next check-in (every 15 seconds while
// the driver app is open). "Set on the tablet" hands the choice back to the
// tablet's own GPS settings.
export const GPS_CHOICES = [
  { value: "usb", label: "GPS module" },
  { value: "tablet", label: "Tablet's own GPS" },
  { value: null, label: "Set on the tablet" },
];

export const adminGpsChosen = device => (["usb", "tablet"].includes(device?.gps_source) ? device.gps_source : null);

// What the tablet last said it is using, and whether it has caught up with Admin's choice.
export function gpsReport(device, now = Date.now()) {
  const h = device?.helper_health || {};
  const chosen = adminGpsChosen(device);
  const fresh = !!h.reported_at && now - Date.parse(h.reported_at) < 10 * 60 * 1000;
  const using = fresh && ["usb", "tablet"].includes(h.gps_source) ? h.gps_source : null;
  let text = !fresh ? "The tablet hasn't reported in the last 10 minutes."
    : using === "usb" ? `Using the GPS module${h.gps ? ` · ${h.gps}` : ""}`
    : using === "tablet" ? "Using the tablet's own GPS"
    : "This tablet's app doesn't report its GPS. Install the latest tablet app to switch it from here.";
  const waiting = !!(chosen && using && using !== chosen);
  if (waiting) text += ". Switching: the tablet changes over within a minute while the driver app is open.";
  return { chosen, using, waiting, text };
}
