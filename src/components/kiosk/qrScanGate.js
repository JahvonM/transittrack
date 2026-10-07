// Require consecutive, time-spaced reads, not two isolated glimpses.
export default function createQrScanGate({ stableMs = 0, warmupMs = 0 } = {}) {
  let readyAt = Infinity;
  let lastFire = -Infinity;
  let candidate = null;
  const submitted = new Set();
  return {
    start(now) {
      readyAt = now + warmupMs;
      lastFire = -Infinity;
      candidate = null;
    },
    miss(now) {
      if (candidate && now - candidate.last > 350) candidate = null;
    },
    read(text, now) {
      if (!text || (stableMs > 0 && submitted.has(text)) || now < readyAt || now - lastFire < 2500) return false;
      if (!candidate || candidate.text !== text || now - candidate.last > 350) {
        candidate = { text, first: now, last: now, count: 0 };
      }
      candidate.last = now;
      candidate.count += 1;
      if (candidate.count < 2 || now - candidate.first < stableMs) return false;
      if (stableMs > 0) submitted.add(text);
      lastFire = now;
      candidate = null;
      return true;
    },
  };
}