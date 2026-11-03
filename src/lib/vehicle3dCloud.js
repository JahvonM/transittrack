// Cloud adapter for Vehicle 3D Studio. Not wired to the UI until the
// reviewed schema, private buckets and authenticated vehicle3d function
// are deployed to staging. No background uploads or paid processing.
import { base44 } from "@/api/base44Client";
import { validateScanPhoto } from "@/lib/vehicle3dCapture";

async function call(action, payload = {}) {
  const result = await base44.functions.invoke("vehicle3d", { action, ...payload });
  const data = result?.data?.result || result?.data;
  if (!data || data.error) throw new Error(data?.error || "3D Studio request failed.");
  return data;
}

export const createCloudScan = (vehicleId) => call("create", { vehicleId });
export const listCloudScans = (vehicleId) => call("list", { vehicleId });
export const getCloudModelLink = (scanId) => call("modelLink", { scanId });
export const getReconstructionStatus = (scanId) => call("jobStatus", { scanId });
// A deliberate user action is required; this remains off until backend setup.
export const requestReconstruction = (scanId, idempotencyKey) => call("startReconstruction", { scanId, idempotencyKey });

export async function uploadCloudPhoto({ scanId, photo, pass }) {
  const problem = validateScanPhoto(photo, 0);
  if (problem) throw new Error(problem);
  if (!["lower", "middle", "upper"].includes(pass)) throw new Error("Invalid capture pass.");
  if (!crypto?.randomUUID) throw new Error("This device requires a secure context for uploads.");
  const fileId = crypto.randomUUID();
  const signed = await call("signPhoto", {
    scanId, fileId, bytes: photo.size, contentType: photo.type,
  });
  // Signed upload URL is bound to exactly one object path. Supabase verifies
  // the one-time scoped token; no service credentials are sent to the device.
  const response = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": photo.type },
    body: photo,
  });
  if (!response.ok) throw new Error("Photo upload failed (HTTP " + response.status + "). Please retry.");
  return call("confirmPhoto", {
    scanId, fileId, bytes: photo.size, contentType: photo.type, pass,
  });
}
