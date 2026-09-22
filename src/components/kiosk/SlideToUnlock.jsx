import React, { useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";

const HANDLE_SIZE = 48; // px — matches h-12/w-12 below
const TRACK_PADDING = 4; // px — matches p-1 below
const UNLOCK_THRESHOLD = 0.85; // fraction of travel needed to trigger onUnlock

// A dragged pill-shaped slider, like a phone/tablet lock screen. Pointer
// Events (not separate mouse/touch listeners) so one set of handlers covers
// both a finger on a tablet and a mouse in a browser preview, and pointer
// capture keeps the drag tracking even if the finger moves outside the
// handle's own bounds mid-drag.
export default function SlideToUnlock({ label = "Slide to unlock", onUnlock }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const maxXRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const clamp = (v, max) => Math.min(Math.max(v, 0), max);

  const onPointerDown = (e) => {
    const track = trackRef.current;
    if (!track) return;
    maxXRef.current = track.offsetWidth - HANDLE_SIZE - TRACK_PADDING * 2;
    startXRef.current = e.clientX - dragX;
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    setDragX(clamp(e.clientX - startXRef.current, maxXRef.current));
  };

  const finish = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setDragX((current) => {
      if (current >= maxXRef.current * UNLOCK_THRESHOLD) {
        onUnlock?.();
        return maxXRef.current;
      }
      return 0;
    });
  };

  return (
    <div
      ref={trackRef}
      className="relative w-full max-w-xs mx-auto h-14 rounded-full bg-primary/10 border border-primary/20 overflow-hidden p-1"
    >
      <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-primary/70 pointer-events-none">
        {label}
      </div>
      <div
        className={`relative h-12 w-12 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md touch-none ${dragging ? "" : "transition-transform duration-300 ease-out"}`}
        style={{ transform: `translateX(${dragX}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <ChevronsRight className="w-6 h-6" />
      </div>
    </div>
  );
}
