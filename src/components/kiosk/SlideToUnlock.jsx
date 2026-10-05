import React, { useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";

const HANDLE_SIZE = 64; // px — matches h-16/w-16 below
const TRACK_PADDING = 4; // px — matches p-1 below
const UNLOCK_THRESHOLD = 0.85; // fraction of travel needed to trigger onUnlock

// A dragged pill-shaped slider, like a phone/tablet lock screen. Pointer
// Events cover a finger on a tablet and a mouse in a browser alike, and
// pointer capture keeps the drag tracking if the finger leaves the handle.
// Only the finger that started the drag moves it; a cancelled gesture (the
// system taking over the touch) never unlocks. Enter or Space unlocks too,
// for keyboards and screen readers.
export default function SlideToUnlock({ label = "Slide to unlock", onUnlock }) {
  const trackRef = useRef(null);
  const pointerRef = useRef(null); // id of the pointer dragging, or null
  const startXRef = useRef(0);
  const maxXRef = useRef(0);
  const xRef = useRef(0);
  const doneRef = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState(false);

  const clamp = (v, max) => Math.min(Math.max(v, 0), max);
  const move = (x) => { xRef.current = x; setDragX(x); };

  const unlock = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    move(maxXRef.current || xRef.current);
    onUnlock?.();
  };

  const onPointerDown = (e) => {
    const track = trackRef.current;
    if (!track || pointerRef.current !== null || doneRef.current) return;
    maxXRef.current = Math.max(0, track.offsetWidth - HANDLE_SIZE - TRACK_PADDING * 2);
    startXRef.current = e.clientX - xRef.current;
    pointerRef.current = e.pointerId;
    setDragging(true);
    setHint(false);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
  };

  const onPointerMove = (e) => {
    if (pointerRef.current !== e.pointerId) return;
    move(clamp(e.clientX - startXRef.current, maxXRef.current));
  };

  // released: true when the finger lifted; false when the gesture was
  // cancelled or tracking was lost, which always springs back.
  const end = (e, released) => {
    if (pointerRef.current === null || (e && pointerRef.current !== e.pointerId)) return;
    pointerRef.current = null;
    setDragging(false);
    if (released && maxXRef.current > 0 && xRef.current >= maxXRef.current * UNLOCK_THRESHOLD) { unlock(); return; }
    if (released && xRef.current < 8) setHint(true); // a tap, not a slide
    move(0);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      const track = trackRef.current;
      if (track) maxXRef.current = Math.max(0, track.offsetWidth - HANDLE_SIZE - TRACK_PADDING * 2);
      unlock();
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <div
        ref={trackRef}
        className="relative h-20 w-full overflow-hidden rounded-full border border-primary/20 bg-gradient-to-r from-primary/15 to-primary/5 p-1 shadow-inner"
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-semibold tracking-wide text-primary/70" aria-hidden="true">
          {label}
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label={label}
          className={`relative grid h-[64px] w-[64px] touch-none select-none place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-ring ${dragging ? "" : "transition-transform duration-300 ease-out"}`}
          style={{ transform: `translateX(${dragX}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => end(e, true)}
          onPointerCancel={(e) => end(e, false)}
          onLostPointerCapture={(e) => end(e, false)}
          onKeyDown={onKeyDown}
        >
          <ChevronsRight className="h-8 w-8" aria-hidden="true" />
        </div>
      </div>
      {hint && <p role="status" className="mt-2 text-center text-body-sm text-muted-foreground">Drag the arrow all the way to the right.</p>}
    </div>
  );
}
