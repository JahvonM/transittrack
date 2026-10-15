import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { deviceRequest } from "@/lib/deviceAuth";
import { idleFor } from "@/lib/tabletUpdate";
import { SAVED_KEYS, readSaved } from "@/lib/savedWork";
const Control = registerPlugin("TabletControl");
export const nativeTabletControlAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("TabletControl");
const markers = new Map();
export function useTabletWorkSafety(deviceId, safe) {
  useEffect(() => {
    if (!deviceId) return undefined;
    const marker = { deviceId, safe: safe === true };
    markers.set(marker, marker);
    return () => { markers.delete(marker); };
  }, [deviceId, safe]);
}
export function rebootWorkSafe(deviceId) {
  if (!deviceId || typeof document === "undefined" || document.visibilityState !== "visible") return false;
  const matching = [...markers.values()].filter(x => x.deviceId === deviceId);
  if (matching.length !== 1 || matching[0].safe !== true || !idleFor(180000)) return false;
  try { return SAVED_KEYS.every(key => readSaved(key).length === 0); } catch { return false; }
}
export async function refreshNativeControl(deviceId) {
  if (!nativeTabletControlAvailable()) return null;
  await Control.setWorkSafety({ device_id: deviceId || "", safe: rebootWorkSafe(deviceId) });
  const state = await Control.getState();
  if (typeof window !== "undefined") window.__ttNativeControl = { ...state, at: Date.now() };
  return state;
}
let running = false;
export async function handleTabletControl(deviceId, notice) {
  if (running || !nativeTabletControlAvailable() || !deviceId) return;
  const request = deviceRequest(deviceId);
  if (!/^[a-f0-9]{64}$/.test(request.device_token || "")) return;
  running = true;
  try {
    await refreshNativeControl(deviceId);
    // Recover result delivery after a restart/lost response; never rerun a side effect.
    const pending = await Control.pendingReceipts({ device_id: deviceId });
    const ids = [...new Set([...(Array.isArray(pending?.ids) ? pending.ids.slice(0, 4) : []), notice?.id])]
      .filter(id => typeof id === "string" && /^[a-f0-9]{32}$/.test(id));
    for (const command_id of ids) await Control.execute({ device_id: deviceId, device_token: request.device_token, command_id }).catch(() => {});
    await refreshNativeControl(deviceId);
  } finally { running = false; }
}
