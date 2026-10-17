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
 const [reserved, setReserved] = useState(() => nativeSupportAvailable());
 useEffect(() => {
  if (!nativeSupportAvailable()) return undefined;
  let active = true, listener;
  const update = s => { if(active) setReserved(s.cameraReserved === true); };
  void (async () => {
   listener = await Support.addListener("state", update);
   if(!active) { await listener.remove(); return; }
   update(await Support.getState());
  })().catch(() => {});
  // Local native state only: dashcam leases change without a server support request.
  const timer = setInterval(() => { void Support.getState().then(update).catch(() => {}); }, 1000);
  return () => { active = false; clearInterval(timer); void listener?.remove(); };
 }, []);
 return reserved;
}

export async function handleTabletRecordings(deviceId, notice) {
 if (!nativeSupportAvailable() || !/^[A-Za-z0-9_-]{6,128}$/.test(notice?.id || "")) return;
 const request = deviceRequest(deviceId);
 if (!/^[a-f0-9]{64}$/.test(request.device_token || "")) return;
 return Support.offerRecordings({...request, session_id:notice.id});
}
