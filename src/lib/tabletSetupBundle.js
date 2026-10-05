import { zipSync, strToU8 } from "fflate";

const batSafe = value => String(value || "").replace(/[^A-Za-z0-9 .,-]/g, "").trim();
export function tabletSetupBundle(script, helperBytes, version, device = null, typeLabel = "") {
  let text = script;
  let scriptName = "TransitTrack-Tablet-Setup.bat";
  if (device) {
    const fill = (key, value) => {
      text = text.replace(new RegExp(`set ${key}=\\r?\\n`), match =>
        `set ${key}=${value}${match.endsWith("\r\n") ? "\r\n" : "\n"}`);
    };
    const number = (String(device.vehicle_name || device.label || "").match(/\d+/) || [""])[0];
    fill("PRESET_TYPE", device.kiosk_type === "driver" ? "1" : "2");
    fill("PRESET_CODE", String(device.pairing_code || "").replace(/[^A-Za-z0-9]/g, ""));
    if (number) fill("PRESET_BUS", number);
    fill("PRESET_NAME", batSafe(`${device.label || "Tablet"} - ${typeLabel}${device.vehicle_name ? ` - ${device.vehicle_name}` : ""}`));
    scriptName = `TransitTrack-Setup-${batSafe(device.label).replace(/[ .,]+/g, "-") || "tablet"}.bat`;
  }
  const readme = `TransitTrack tablet setup - Helper ${version}

1. Extract ALL files from this ZIP into one folder.
2. Sync or export Saved Work, then plug the tablet into your Windows computer.
3. Run ${scriptName} from that folder.
4. Choose UPDATE for an existing tablet and enter its existing FreeKiosk exit PIN.
5. After restarting, confirm Helper ${version}, pairing and a successful card tap.

The Helper APK is already included with the correct name.
Update mode keeps the existing pairing and Helper settings.
This bundle needs ADB on the computer (Google Platform Tools).
`;
  return {
    bytes: zipSync({
      [scriptName]: strToU8(text),
      "TransitTrack-Kiosk-Helper.apk": helperBytes,
      "READ-ME.txt": strToU8(readme),
    }),
    filename: `${scriptName.replace(/\.bat$/, "")}-Helper-${String(version).replace(/[^A-Za-z0-9.-]/g, "")}.zip`,
  };
}
