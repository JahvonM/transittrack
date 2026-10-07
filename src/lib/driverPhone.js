import { base44 } from "@/api/base44Client";
import { withRateLimitRetry } from "@/lib/scopedEntities";
import { blobToBase64 } from "@/lib/chatMedia";
import { errorData, httpStatus } from "@/lib/requestError";

// Everything the driver phone app reads or sends goes through the driverPhone
// backend function, which checks the signed-in Google account against the
// driver records an administrator switched on.
export async function callDriverPhone(action, body = {}) {
  try {
    const res = await withRateLimitRetry(() => base44.functions.invoke("driverPhone", { action, ...body }), { attempts: 3 });
    return res.data;
  } catch (error) {
    const data = errorData(error);
    throw Object.assign(new Error(data.error || "Couldn't reach TransitTrack. Check your signal and try again."), {
      status: httpStatus(error), code: data.code || "",
    });
  }
}

export const notADriver = (error) => error?.status === 403 && error?.code === "NOT_A_DRIVER";

// Phone photos are several megabytes. Shrink each one before sending so a
// report goes through on a weak signal.
export async function shrinkPhoto(file, { maxSide = 1600, quality = 0.8 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That photo couldn't be opened."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("That photo couldn't be prepared.");
    return { data_base64: await blobToBase64(blob), mime_type: "image/jpeg", preview: canvas.toDataURL("image/jpeg", 0.5) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// "Driving" turns on after two readings in a row at 15 km/h or more, and off
// once the phone has been below 5 km/h for 10 seconds. Speeds come from the
// phone's own GPS and never leave the phone.
export const DRIVING_ON_MS = 15 / 3.6;
export const DRIVING_OFF_MS = 5 / 3.6;
export const STOPPED_FOR_MS = 10_000;
export function nextDrivingState(state, reading) {
  const speed = Number.isFinite(reading?.speed) ? reading.speed : null;
  const at = reading?.at ?? Date.now();
  const s = { driving: false, fastCount: 0, slowSince: null, ...state };
  if (speed == null) return s;
  if (speed >= DRIVING_ON_MS) {
    const fastCount = s.fastCount + 1;
    return { driving: s.driving || fastCount >= 2, fastCount, slowSince: null };
  }
  if (speed < DRIVING_OFF_MS) {
    const slowSince = s.slowSince ?? at;
    return { driving: s.driving && at - slowSince < STOPPED_FOR_MS, fastCount: 0, slowSince };
  }
  return { ...s, fastCount: 0, slowSince: null };
}

// How a licence or insurance expiry date reads on the Me tab.
export function expiryState(date, now = new Date()) {
  if (!date) return { tone: "neutral", text: "No expiry date on file" };
  const end = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(end.getTime())) return { tone: "neutral", text: "No expiry date on file" };
  // Whole calendar days from today (valid through the end of the expiry day).
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((end.getTime() - today.getTime()) / 86400_000);
  const when = end.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  if (days < 0) return { tone: "danger", text: `Expired ${when}`, days };
  if (days <= 30) return { tone: "warning", text: days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"} (${when})`, days };
  return { tone: "success", text: `Valid until ${when}`, days };
}

// WhatsApp needs the number as digits only, with the country code.
export const whatsappLink = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 7 ? `https://wa.me/${digits}` : "";
};
export const telLink = (phone) => {
  const clean = String(phone || "").replace(/[^\d+]/g, "");
  return clean.replace(/\D/g, "").length >= 7 ? `tel:${clean}` : "";
};

// Codes from the bus tablet's "Start with the driver app" screen: six
// letters and numbers, typed with or without a space, or the QR's whole link.
export const UNLOCK_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export function unlockCodeFrom(value) {
  const raw = String(value || "").trim();
  const fromLink = /[?&]code=([^&#\s]+)/i.exec(raw);
  let text = fromLink ? fromLink[1] : raw;
  try { text = decodeURIComponent(text); } catch { /* keep as typed */ }
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Hours for the Me tab: this week (Monday to now, phone's local time) from
// the shifts the driver started and ended. Open shifts count up to now.
export function weekHours(shifts = [], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  let minutes = 0, count = 0;
  for (const s of shifts) {
    const from = Date.parse(s.started_at);
    if (!Number.isFinite(from) || from < start.getTime()) continue;
    const to = s.ended_at ? Date.parse(s.ended_at) : now.getTime();
    minutes += s.minutes ?? Math.max(0, Math.round((to - from) / 60000));
    count += 1;
  }
  return { minutes, count };
}
export const hoursText = (mins) => `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
