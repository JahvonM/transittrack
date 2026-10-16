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
