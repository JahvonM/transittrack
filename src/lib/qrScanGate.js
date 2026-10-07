// Camera-session gate: require a steady payload and never submit it twice.
export function qrScanGate({ now = Date.now, settleMs = 500 } = {}) {
 let text = "", since = 0, frames = 0, busy = false;
 const submitted = new Set();
 const reset = () => { text = ""; frames = 0; since = 0; };
 return {
  miss: reset,
  read(value) {
   if (busy || !value || submitted.has(value)) return false;
   const time = now();
   if (value !== text) { text = value; since = time; frames = 1; return false; }
   frames++;
   if (frames < 3 || time - since < settleMs) return false;
   submitted.add(value); busy = true; reset(); return true;
  },
  done() { busy = false; reset(); },
 };
}
