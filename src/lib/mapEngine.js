// Which map engine this device can run. The full map (Mapbox GL v3) needs
// WebGL 2; many budget and older Android tablets only have WebGL 1 or none,
// and there Mapbox GL fails quietly and leaves a blank box. Those devices get
// the basic map (Leaflet with Mapbox street images) instead.
const FORCE_KEY = "tt-map-engine"; // "basic" | "full" — manual override for testing

let cached = null;

export function hasWebGL2() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function mapEngine() {
  try {
    const forced = localStorage.getItem(FORCE_KEY);
    if (forced === "basic" || forced === "full") return forced;
  } catch { /* storage unavailable */ }
  if (cached === null) cached = hasWebGL2() ? "full" : "basic";
  return cached;
}

// Called when the full engine reports it couldn't start, so every map on
// the page (and later pages) switches to the basic one.
export function markFullMapFailed() {
  cached = "basic";
}

// Short device summary for the driver-tablet heartbeat, so admins can see why
// a tablet shows the basic map.
export function deviceMapInfo() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return `map=${mapEngine()}; webgl2=${hasWebGL2() ? "yes" : "no"}; ${ua}`.slice(0, 400);
}
