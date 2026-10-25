import React, { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

// The sign on the front of a bus, lit in dots, changing to the next place
// every few seconds. It is decoration: the words beside it say the same
// thing. It stays still for people who ask for less motion, and it can be
// paused.
const STOPS = ["Airport", "Your hotel", "Island tour", "St. George's", "Grand Anse"];
const EVERY_MS = 3200;

const prefersStill = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

export default function DestinationSign() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(prefersStill);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => { setIndex((i) => (i + 1) % STOPS.length); setMoved(true); }, EVERY_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const stop = STOPS[index];
  const cls = moved ? " mcs-new" : "";
  return (
    <div className="mcs-sign">
      <div className="mcs-sign-line" aria-hidden="true">
        <span key={`g${index}`} className={`mcs-sign-glow${cls}`}>{stop}</span>
        <span key={`t${index}`} className={`mcs-sign-text${cls}`}>{stop}</span>
      </div>
      <button type="button" className="mcs-sign-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Start the sign" : "Stop the sign"}>
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      </button>
    </div>
  );
}
