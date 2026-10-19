// Device telemetry can be absent on Wi-Fi-only tablets and older APKs.
export function cellularSummary(h = {}) {
  const state = h.cellular_state;
  if (!state) return "";
  const labels = { unsupported: "Wi-Fi-only tablet", absent: "No SIM", pin_required: "SIM needs PIN", puk_required: "SIM needs PUK", network_locked: "SIM network locked", not_ready: "SIM starting", disabled: "SIM disabled", error: "SIM error", restricted: "SIM restricted", unknown: "SIM status unavailable", permission_denied: "SIM status restricted by Android" };
  if (state !== "ready") return labels[state] || "SIM status unavailable";
  const bars = Number.isInteger(h.cellular_bars) && h.cellular_bars >= 0 && h.cellular_bars <= 4 ? ` · ${h.cellular_bars}/4 signal (last reading)` : " · signal unavailable";
  return `${h.cellular_carrier || "SIM ready"}${bars}`;
}
export function recoverySummary(h = {}) {
  if (!h.recovery_available) return "";
  if (h.recovery_state === "retry_required") return "Screen needs manual reopen";
  if (h.recovery_state === "waiting") return "Restoring kiosk screen";
  if (h.recovery_state === "recovered") return "Kiosk screen recovered";
  return "Screen recovery ready";
}
