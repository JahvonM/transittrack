import { useEffect, useRef, useState } from "react";
import { createTrack, movedTo, prefersReducedMotion, retarget, step } from "@/lib/vehicleMotion";

const FRAME_MS = 33; // about 30 updates a second while moving

/**
 * A map marker's drawn position between GPS updates.
 *
 * Default: a bus being watched moves steadily from where it is drawn to each
 * new real position, over about the time updates take to arrive, so it keeps
 * moving instead of hopping and then waiting (see src/lib/vehicleMotion.js).
 * It is only ever drawn between real positions, never ahead of the newest.
 *
 * With { duration }: a fixed, quick glide that settles (the driver's own
 * position, route replay).
 *
 * @param {number|null|undefined} lat
 * @param {number|null|undefined} lng
 * @param {{duration?: number}} options
 */
export default function useSmoothPosition(lat, lng, { duration } = {}) {
  const hasTarget = lat != null && lng != null;
  const [pos, setPos] = useState(hasTarget ? { lat, lng } : null);
  const trackRef = useRef(null);
  const rafRef = useRef(null);
  const lastPaint = useRef(0);

  useEffect(() => {
    if (!hasTarget) return undefined;
    const now = performance.now();
    const to = [lng, lat];
    const reduce = prefersReducedMotion();
    let track = trackRef.current;
    if (!track) {
      // First position ever seen: nothing to move from.
      trackRef.current = createTrack(to, now);
      setPos({ lat, lng });
      return undefined;
    }
    if (!movedTo(track, to)) return undefined;
    retarget(track, to, now, { snap: reduce });
    if (Number.isFinite(duration) && !reduce) { track.dur = Math.max(0, duration); track.ht0 = now; }

    const tick = (t) => {
      const moving = step(track, performance.now());
      if (!moving || t - lastPaint.current >= FRAME_MS) {
        lastPaint.current = t;
        setPos({ lng: track.current[0], lat: track.current[1] });
      }
      rafRef.current = moving ? requestAnimationFrame(tick) : null;
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [lat, lng, hasTarget, duration]);

  return pos;
}
