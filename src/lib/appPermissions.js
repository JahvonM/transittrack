// The device permissions McSween Transport uses, asked for together the first
// time someone opens the app (FirstOpenSetup). Each request resolves to:
//   "granted" | "denied" | "prompt" (not decided yet) | "unsupported"
// "unsupported" covers a browser without the feature and a device with no
// camera or microphone. Nothing here throws.

export const NOTIFICATIONS_ALLOWED_EVENT = "tt-notifications-allowed";

export const APP_PERMISSIONS = [
  { id: "notifications", title: "Notifications", why: "Ride updates, your bus arriving and new messages." },
  { id: "location", title: "Location", why: "Shows where you are on the map and helps set your pickup point." },
  { id: "media", title: "Camera and microphone", why: "Scan bus and company codes, and record voice messages." },
];

const nav = (win) => win?.navigator || {};

async function queryState(win, name) {
  try {
    const status = await nav(win).permissions.query({ name });
    return ["granted", "denied", "prompt"].includes(status?.state) ? status.state : null;
  } catch {
    return null; // this browser can't say (Firefox for camera, older Safari)
  }
}

export async function permissionStatus(id, win = typeof window !== "undefined" ? window : null) {
  if (id === "notifications") {
    const N = win?.Notification;
    if (!N) return "unsupported";
    return N.permission === "default" ? "prompt" : N.permission === "granted" || N.permission === "denied" ? N.permission : "prompt";
  }
  if (id === "location") {
    if (!nav(win).geolocation) return "unsupported";
    return (await queryState(win, "geolocation")) || "prompt";
  }
  if (id === "media") {
    if (!nav(win).mediaDevices?.getUserMedia) return "unsupported";
    const [camera, microphone] = await Promise.all([queryState(win, "camera"), queryState(win, "microphone")]);
    if (camera === "granted" && microphone === "granted") return "granted";
    if (camera === "denied" && microphone === "denied") return "denied";
    return "prompt";
  }
  return "unsupported";
}

function askNotifications(win) {
  const N = win?.Notification;
  if (!N?.requestPermission) return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      const state = value === "granted" || value === "denied" ? value : "prompt";
      if (state === "granted") { try { win.dispatchEvent(new Event(NOTIFICATIONS_ALLOWED_EVENT)); } catch { /* push registers on the next open */ } }
      resolve(state);
    };
    try {
      // Older Safari answers through the callback instead of a promise.
      const result = N.requestPermission(finish);
      if (result?.then) result.then(finish, () => finish("prompt"));
    } catch {
      finish("prompt");
    }
  });
}

function askLocation(win) {
  const geo = nav(win).geolocation;
  if (!geo?.getCurrentPosition) return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    try {
      geo.getCurrentPosition(
        () => resolve("granted"),
        // 1 = refused. No fix yet (2) or too slow (3) still means it was allowed.
        (error) => resolve(error?.code === 1 ? "denied" : "granted"),
        { enableHighAccuracy: false, maximumAge: Infinity, timeout: 20000 },
      );
    } catch {
      resolve("prompt");
    }
  });
}

const stop = (stream) => { try { stream?.getTracks?.().forEach((track) => track.stop()); } catch { /* already stopped */ } };

// One prompt for both where the browser allows it, then the camera or the
// microphone alone on a device that lacks the other.
async function askMedia(win) {
  const media = nav(win).mediaDevices;
  if (!media?.getUserMedia) return "unsupported";
  let missing = 0;
  for (const constraints of [{ video: true, audio: true }, { audio: true }, { video: true }]) {
    try {
      stop(await media.getUserMedia(constraints));
      return "granted";
    } catch (error) {
      const name = error?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
      // In use by another app: the permission itself was given.
      if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "granted";
      missing += 1; // NotFoundError / OverconstrainedError: try the next one
    }
  }
  return missing ? "unsupported" : "prompt";
}

export function requestPermission(id, win = typeof window !== "undefined" ? window : null) {
  if (id === "notifications") return askNotifications(win);
  if (id === "location") return askLocation(win);
  if (id === "media") return askMedia(win);
  return Promise.resolve("unsupported");
}

// Asks for everything not decided yet, one after another. Notifications go
// first: browsers only show that prompt straight after a tap, and the other
// two don't need one. onEach(id, state) reports as each is answered.
export async function requestAllPermissions(current = {}, onEach = () => {}, win = typeof window !== "undefined" ? window : null) {
  const results = { ...current };
  for (const { id } of APP_PERMISSIONS) {
    if (results[id] && results[id] !== "prompt") continue;
    onEach(id, "asking");
    results[id] = await requestPermission(id, win);
    onEach(id, results[id]);
  }
  return results;
}
