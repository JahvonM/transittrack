// Opens Google Maps' own turn-by-turn (the app on Android/iPhone) through
// the given stops, in order. Google allows up to 9 stops in between; the
// last stop is the destination and the start is wherever the phone is.
export function googleMapsDirectionsUrl(stops) {
  const valid = (stops || []).filter((s) => s?.lat != null && s?.lng != null);
  if (!valid.length) return null;
  const dest = valid[valid.length - 1];
  const via = valid.slice(0, -1).slice(0, 9);
  const p = new URLSearchParams({ api: "1", destination: `${dest.lat},${dest.lng}`, travelmode: "driving", dir_action: "navigate" });
  if (via.length) p.set("waypoints", via.map((s) => `${s.lat},${s.lng}`).join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
