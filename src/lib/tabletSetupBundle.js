const batSafe = value => String(value || "").replace(/[^A-Za-z0-9 .,-]/g, "").trim();

// Marker for the helper lines at the end of the setup file. Built from two
// parts so the setup file's own PowerShell line never matches it.
export const HELPER_LINE = "::TTAPK ";

function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// One self-contained Windows setup file: the script with the signed
// TransitTrack Helper built in (base64 lines after the script's last line,
// never executed by cmd). The script unpacks it, checks its SHA-256 and
// installs it, so there is no separate APK to keep beside it.
export function tabletSetupBundle(script, helperBytes, version, device = null, typeLabel = "", sha256 = "") {
  let text = script;
  let scriptName = "TransitTrack-Tablet-Setup.bat";
  const eol = /\r\n/.test(script) ? "\r\n" : "\n";
  const fill = (key, value) => {
    text = text.replace(new RegExp(`set ${key}=\\r?\\n`), match =>
      `set ${key}=${value}${match.endsWith("\r\n") ? "\r\n" : "\n"}`);
  };
  fill("HELPER_VERSION", String(version || "").replace(/[^A-Za-z0-9.-]/g, ""));
  if (/^[0-9a-f]{64}$/.test(sha256)) fill("HELPER_SHA256", sha256);
  if (device) {
    const number = (String(device.vehicle_name || device.label || "").match(/\d+/) || [""])[0];
    fill("PRESET_TYPE", device.kiosk_type === "driver" ? "1" : "2");
    fill("PRESET_CODE", String(device.pairing_code || "").replace(/[^A-Za-z0-9]/g, ""));
    if (number) fill("PRESET_BUS", number);
    fill("PRESET_NAME", batSafe(`${device.label || "Tablet"} - ${typeLabel}${device.vehicle_name ? ` - ${device.vehicle_name}` : ""}`));
    scriptName = `TransitTrack-Setup-${batSafe(device.label).replace(/[ .,]+/g, "-") || "tablet"}.bat`;
  }
  const b64 = toBase64(helperBytes);
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(HELPER_LINE + b64.slice(i, i + 76));
  if (!text.endsWith(eol)) text += eol;
  text += `rem ===== TransitTrack Helper ${batSafe(version)} - built in, do not edit below =====${eol}${lines.join(eol)}${eol}`;
  const bytes = new TextEncoder().encode(text);
  return {
    bytes,
    filename: `${scriptName.replace(/\.bat$/, "")}-Helper-${String(version).replace(/[^A-Za-z0-9.-]/g, "")}.bat`,
  };
}
