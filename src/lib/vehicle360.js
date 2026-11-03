// Pure helpers for lightweight photo-based turntable views.
export const BUS_360_MAX_FRAMES = 36;
export const BUS_360_RECOMMENDED_FRAMES = 18;

export function sortedBus360Frames(photos = []) {
  return [...photos].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
}

export function wrapBus360Frame(index, count) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  return ((Math.trunc(index) % count) + count) % count;
}

export function stepBus360FromSwipe(deltaX, count, threshold = 18) {
  if (count < 2 || Math.abs(deltaX) < threshold) return 0;
  const frames = Math.max(1, Math.floor(Math.abs(deltaX) / 45));
  return Math.sign(-deltaX) * Math.min(frames, Math.max(1, count - 1));
}

export function validateBus360Photo(file, count) {
  if (count >= BUS_360_MAX_FRAMES) return "Maximum of 36 exterior views per gallery.";
  if (!file || !["image/jpeg","image/png","image/webp"].includes(String(file.type || "").toLowerCase()))
    return "Use JPG, PNG or WebP photos.";
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 20 * 1024 * 1024)
    return "Each photo must be between 1 byte and 20 MB.";
  return null;
}
