// Drivers have no login, so their media (photo/voice note) can't go through
// base44.integrations.Core.UploadPublicFile directly from the client — it needs an
// authenticated Base44 user. Instead the driver base64-encodes the blob and
// sends it through driverSession's send_chat_media action, which uploads it
// server-side via the service role. This helper does that encoding.
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result || "";
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}