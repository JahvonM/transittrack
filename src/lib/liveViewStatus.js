// What a bus's camera box in Admin → Fleet workspace says while its live view
// isn't playing: one plain line from what the viewer knows (whether viewing is
// switched on, whether this tablet can send video, where the session is).
import { tabletSupportFailure } from "@/lib/tabletSupportFailure";

// A tablet that can send live video right now: paired, and its app reports
// direct (WebRTC) viewing available.
export function tabletCanStream(device) {
  const h = device?.helper_health || {};
  return !!device?.paired && h.support_available === true && h.support_transport === "webrtc";
}

export function liveViewStatus({ enabled, device, busy = false, session = null }) {
  if (enabled == null) return "Checking live viewing…";
  if (enabled === false) return "Live viewing isn't switched on yet.";
  if (device?.helper_health?.support_transport !== "webrtc") return "This tablet needs the direct-viewing update.";
  if (!tabletCanStream(device)) return "This tablet can't send video right now.";
  if (!session) return busy ? "Asking the tablet…" : "Choose Back camera or Front camera.";
  switch (session.state) {
    case "requested": return "Waiting for the tablet to check in…";
    case "waiting_permission": return "Waiting for the tablet…";
    case "connecting":
    case "active": return "Connecting video…";
    case "failed": return tabletSupportFailure(session.failure_code) || "The tablet couldn't start the video.";
    case "denied": return "The tablet didn't allow the video.";
    case "expired":
    case "ended": return "This view has ended. Choose a camera to watch again.";
    default: return "Connecting video…";
  }
}
