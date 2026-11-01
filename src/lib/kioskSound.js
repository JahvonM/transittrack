// Short sounds for the boarding screen, alongside the words and icons:
// accepted (two rising notes), already recorded (one soft note), refused
// (two low notes). Web Audio only: no files to load, works offline. Quiet if
// the browser blocks sound until a first touch.

const TONES = {
  accepted: [[660, 0, 0.12], [880, 0.14, 0.16]],
  exit: [[880, 0, 0.12], [660, 0.14, 0.16]],
  duplicate: [[520, 0, 0.18]],
  refused: [[300, 0, 0.18], [240, 0.22, 0.24]],
  test: [[660, 0, 0.12], [880, 0.14, 0.12], [520, 0.3, 0.18]],
};
let ctx = null;
export function playTone(kind) {
  try {
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC || !TONES[kind]) return false;
    ctx ||= new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const start = ctx.currentTime + 0.01;
    for (const [freq, at, len] of TONES[kind]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.25, start + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + at); osc.stop(start + at + len + 0.02);
    }
    return true;
  } catch { return false; }
}
