// Photos from some phones arrive as HEIC. The server removes the GPS position
// and other details from JPEG, PNG and WebP photos as they are saved
// (base44/shared/photoMetadata.ts), but it can't read HEIC, and most browsers
// can't show it either. So before uploading, the app redraws a HEIC photo as
// a JPEG (the right way up), which carries none of that. A phone or browser
// that can't read the photo says so, and nothing is uploaded.

const HEIC_TYPE = /^image\/(heic|heif)(-sequence)?$/i;
const HEIC_NAME = /\.(heic|heif)$/i;
// Big enough for any phone photo; iPhones refuse to draw much larger.
const MAX_PIXELS = 16_000_000;

export const HEIC_PROBLEM =
  "This photo is in HEIC format, which can't be used here. Choose a JPEG photo, or set the camera to save JPEG (on iPhone: Settings › Camera › Formats › Most Compatible).";

export const isHeic = (file) => HEIC_TYPE.test(file?.type || "") || HEIC_NAME.test(file?.name || "");

const problem = () => Object.assign(new Error(HEIC_PROBLEM), { status: 415 });

export async function photoForUpload(file) {
  if (!isHeic(file)) return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw problem();
  }
  try {
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
    canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw problem();
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw problem();
    const name = `${String(file.name || "photo").replace(HEIC_NAME, "") || "photo"}.jpg`;
    return new File([blob], name, { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}
