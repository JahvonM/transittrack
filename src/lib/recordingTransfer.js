export const MAX_RECORDING_BYTES = 32 * 1024 * 1024;
export const clipName = value => typeof value === "string" && /^[0-9]{13}-[a-f0-9]{16}(?:-incomplete)?(?:-protected)?\.mp4$/.test(value);
export function recordingDateRange(date) {
 if (!date) return {from: 0, until: 8640000000000000};
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid date.");
 const start = new Date(date + "T00:00:00"), end = new Date(start);
 if (!Number.isFinite(+start)) throw new Error("Choose a valid date.");
 end.setDate(end.getDate() + 1);
 return {from: +start, until: +end};
}
// One bounded transfer at a time. A partial download is never offered for playback.
export function createRecordingReceiver({send, onProgress = () => {}, digest = bytes => crypto.subtle.digest("SHA-256", bytes), timeout = 180000}) {
 let pending = null, closed = false, seq = 0;
 const fail = message => {
  if (!pending) return;
  const p = pending; pending = null; clearTimeout(p.timer); p.parts.length = 0; p.reject(new Error(message));
 };
 const request = (op, extra = {}) => {
  if (closed || pending) return Promise.reject(new Error(closed ? "Connection closed." : "A request is already in progress."));
  return new Promise((resolve, reject) => {
   const id = String(++seq);
   pending = {id, op, resolve, reject, parts: [], received: 0, size: null, timer: setTimeout(() => fail("The tablet did not finish sending. Close and reconnect to retry."), timeout)};
   try { send(JSON.stringify({op, id, ...extra})); } catch { fail("Could not send to the tablet."); }
  });
 };
 const receive = async data => {
  if (closed) return;
  const p = pending;
  if (!p) throw new Error("Unexpected recording data.");
  if (data instanceof ArrayBuffer) {
   if (p.op !== "get" || p.size === null || data.byteLength === 0 || data.byteLength > 16384 || p.received + data.byteLength > p.size) throw new Error("Invalid recording chunk.");
   p.parts.push(data); p.received += data.byteLength; onProgress(p.received, p.size); return;
  }
  if (typeof data !== "string" || data.length > 24000) throw new Error("Invalid recording message.");
  const m = JSON.parse(data);
  if (m.id !== p.id) throw new Error("Recording response did not match the request.");
  if (m.type === "error") { fail("The tablet is busy. Retry after the current request."); return; }
  if (m.type === "list" && p.op === "list") {
   if (!Array.isArray(m.clips) || m.clips.length > 40 || !Number.isInteger(m.next) || m.next < -1 || m.next > 100000) throw new Error("Invalid recordings list.");
   for (const c of m.clips) if (!clipName(c.name) || c.at !== Number(c.name.slice(0, 13)) || !Number.isSafeInteger(c.bytes) || c.bytes < 0 || typeof c.protected !== "boolean" || typeof c.incomplete !== "boolean") throw new Error("Invalid clip details.");
   clearTimeout(p.timer); pending = null; p.resolve({clips: m.clips, next: m.next}); return;
  }
  if (m.type === "start" && p.op === "get" && p.size === null) {
   if (!clipName(m.name) || !Number.isInteger(m.bytes) || m.bytes < 1 || m.bytes > MAX_RECORDING_BYTES) throw new Error("Video is too large or invalid.");
   p.size = m.bytes; p.name = m.name; onProgress(0, p.size); return;
  }
  if (m.type === "end" && p.op === "get" && p.size !== null) {
   if (m.bytes !== p.size || p.received !== p.size || !/^[a-f0-9]{64}$/.test(m.sha256)) throw new Error("Incomplete video. Nothing was saved.");
   const blob = new Blob(p.parts, {type: "video/mp4"});
   const hash = Array.from(new Uint8Array(await digest(await blob.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
   if (closed || pending !== p) return;
   if (hash !== m.sha256) throw new Error("Video integrity check failed. Retry the transfer.");
   clearTimeout(p.timer); pending = null; p.parts.length = 0; p.resolve({blob, name: p.name}); return;
  }
  throw new Error("Unexpected recording response.");
 };
 return {list: fields => request("list", fields), get: name => clipName(name) ? request("get", {name}) : Promise.reject(new Error("Invalid clip.")), receive,
  close() { closed = true; fail("Connection closed. Incomplete video discarded."); }};
}
