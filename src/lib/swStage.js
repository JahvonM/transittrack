// Asks the service worker (public/sw.js) to save the newest published
// version for offline use, so the next page load opens it rather than the
// saved copy of an older one. True when it's saved, or when there's no
// service worker to ask (e.g. a dev build); false if it couldn't finish
// within timeoutMs.
export async function stageNewVersion(timeoutMs = 90_000) {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
  if (!sw) return true;
  let reg = null;
  try { reg = await sw.getRegistration(); } catch { /* ignore */ }
  if (!reg) return true;
  try { await reg.update(); } catch { /* keep the current worker */ }
  const worker = sw.controller || reg.active;
  if (!worker) return true;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data?.ok === true); };
    try { worker.postMessage({ type: "tt-stage-update" }, [channel.port2]); }
    catch { clearTimeout(timer); resolve(false); }
  });
}
