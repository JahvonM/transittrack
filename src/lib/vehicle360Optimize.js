// Browser-only photo downscaling. Keeps visual quality adequate for bus
// exterior inspection while reducing device storage and Supabase transfer.
// Falls back to the original file when canvas/image decoding is unsupported.
export async function optimizeBus360Photo(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type || "")) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let image;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(image.width, image.height);
    if (!longest || !image.width || !image.height) return file;
    const scale = Math.min(1, maxEdge / longest);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const base = (file.name || "bus-photo").replace(/\.[^.]+$/, "");
    return new File([blob], base + ".jpg", { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
  } catch {
    return file;
  } finally {
    image?.close?.();
  }
}
