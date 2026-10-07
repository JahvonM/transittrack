import QRCode from "qrcode";

// Boarding QR codes contain a permanent, random personal credential, never
// a guessable staff identifier or the passenger's chosen keypad code.
// The same format still accepts previously issued temporary codes.
export async function codeQrDataUrl(code) {
  return QRCode.toDataURL(`tt-code:${code}`, { width: 320, margin: 2 });
}

export function parseCodeQrPayload(text) {
  const match = /^tt-code:(.+)$/.exec(String(text || "").trim());
  return match ? match[1] : null;
}