// Which "Continue with Google / Apple" buttons the sign-in screens show: only
// the ones the sign-in service has turned on, so nobody taps a button that
// can't work. (On Supabase, Google and Apple are switched on in its
// dashboard.) The last answer is kept on the device, so the buttons don't
// jump about on the next visit.
import { useEffect, useState } from "react";
import { BACKEND, signInOptions } from "tt-backend";

const KEY = "tt_sign_in_options_v1";

export function savedSignInOptions(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || "null");
    return v && typeof v.google === "boolean" && typeof v.apple === "boolean" ? { google: v.google, apple: v.apple } : null;
  } catch {
    return null;
  }
}

// Before the first answer: Base44 has both; on Supabase show none rather
// than one that might not work (the real answer follows in a moment).
export const firstGuess = (backend = BACKEND) => (backend === "supabase" ? { google: false, apple: false } : { google: true, apple: true });

export function useSignInOptions() {
  const [options, setOptions] = useState(() => savedSignInOptions() || firstGuess());
  useEffect(() => {
    let live = true;
    signInOptions().then((answer) => {
      if (!live || !answer) return;
      const next = { google: answer.google === true, apple: answer.apple === true };
      setOptions(next);
      try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return options;
}
