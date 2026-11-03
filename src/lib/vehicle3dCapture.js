export const MAX_3D_PHOTOS = 200;
export const MAX_3D_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_3D_MODEL_BYTES = 150 * 1024 * 1024;
export const SCAN_PASSES = ["lower", "middle", "upper"];

export function validateScanPhoto(file, currentCount) {
  if (currentCount >= MAX_3D_PHOTOS) return "Photo limit reached (200 per scan draft).";
  if (!file || !String(file.type || "").startsWith("image/")) return "Only image files can be added.";
  if (file.size > MAX_3D_PHOTO_BYTES) return "Each photo must be 20 MB or smaller.";
  if (file.size === 0) return "Empty photos cannot be added.";
  return null;
}

export function validateScanModel(file) {
  if (!file || !String(file.name || "").toLowerCase().endsWith(".glb")) return "Choose a GLB model.";
  if (file.size > MAX_3D_MODEL_BYTES) return "Choose a GLB model no larger than 150 MB.";
  if (file.size === 0) return "Empty models cannot be imported.";
  return null;
}
