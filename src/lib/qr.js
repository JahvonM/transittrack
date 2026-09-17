import QRCode from "qrcode";

// A staff member's personal QR code just encodes their User id — kiosks are
// physically controlled devices scoped to one company/vehicle already, so
// this matches the app's existing low-friction trust model (e.g. six-char
// kiosk pairing codes) rather than needing a signed token.
export async function staffQrDataUrl(staffId) {
  return QRCode.toDataURL(`tt-staff:${staffId}`, { width: 320, margin: 2 });
}

export function parseStaffQrPayload(text) {
  const match = /^tt-staff:(.+)$/.exec(String(text || "").trim());
  return match ? match[1] : null;
}
