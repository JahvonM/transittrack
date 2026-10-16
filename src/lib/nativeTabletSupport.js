import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { deviceRequest } from "@/lib/deviceAuth";
const Support = registerPlugin("TabletSupport");
export const nativeSupportAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("TabletSupport");
export async function supportCapabilities() {
 if (!nativeSupportAvailable()) return { remoteViewingReady: false };
 return Support.getCapabilities();
}
export async function handleTabletSupport(deviceId, notice) {
 if (!nativeSupportAvailable() || !/^[A-Za-z0-9_-]{6,128}$/.test(notice?.id || "")) return;
 const request = deviceRequest(deviceId);
 if (!/^[a-f0-9]{64}$/.test(request.device_token || "")) return;
 // Native code independently authenticates and fetches the capability. No JS stream tokens.
 return Support.offer({ ...request, session_id: notice.id });
}
export async function stopTabletSupport() {
 if (nativeSupportAvailable()) await Support.stop();
}

export function useSupportCameraReserved() {
 const [reserved, setReserved] = useState(false);
 useEffect(() => {
  if (!nativeSupportAvailable()) return undefined;
  let active = true, listener;
  const update = s => { if(active) setReserved(s.cameraReserved === true); };
  void (async () => {
   listener = await Support.addListener("state", update);
   if(!active) { await listener.remove(); return; }
   update(await Support.getState());
  })().catch(() => {});
  return () => { active = false; void listener?.remove(); };
 }, []);
 return reserved;
}
