import QRCode from "qrcode";

// QR codes at the bus boarding kiosk encode a one-time check-in code (the
// same kind generated for the keypad), never a permanent staff identifier —
// a screenshot of a permanent QR would be a forever-valid badge for whoever
// has it. Scanning just feeds the same code through lookup_code, so a QR is
// nothing more than another way to enter one.
export async function codeQrDataUrl(code) {
  return QRCode.toDataURL(`tt-code:${code}`, { width: 320, margin: 2 });
}

export function parseCodeQrPayload(text) {
  const match = /^tt-code:(.+)$/.exec(String(text || "").trim());
  return match ? match[1] : null;
}
