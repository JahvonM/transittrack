// Thin wrapper around the Web Speech Synthesis API for spoken turn-by-turn
// nav cues. No-ops safely wherever it's unsupported or blocked (older
// WebViews, permissions) instead of throwing.
export function speak(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel(); // don't stack overlapping instructions
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  } catch {
    /* speech synthesis unsupported or blocked */
  }
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}
