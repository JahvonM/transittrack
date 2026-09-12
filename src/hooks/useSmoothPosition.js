import { useEffect, useRef, useState } from "react";

/**
 * Smoothly animates between successive (lat, lng) updates instead of snapping
 * to each new GPS ping — so a moving marker glides continuously across the
 * map (like Life360's vehicle markers) even though the underlying location
 * update only arrives every several seconds.
 *
 * @param {number|null|undefined} lat
 * @param {number|null|undefined} lng
 * @param {{duration?: number}} options - animation length in ms (default 2500,
 *   comfortably shorter than the ~8s GPS polling interval so it always
 *   finishes settling before the next update arrives)
 */
export default function useSmoothPosition(lat, lng, { duration = 2500 } = {}) {
  const hasTarget = lat != null && lng != null;
  const [pos, setPos] = useState(hasTarget ? { lat, lng } : null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const rafRef = useRef(null);

  useEffect(() => {
    if (!hasTarget) return;
    const target = { lat, lng };

    // First position ever seen — snap instantly, nothing to animate from.
    if (!posRef.current) {
      setPos(target);
      return;
    }

    const from = posRef.current;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out: fast start, gentle settle
      setPos({
        lat: from.lat + (target.lat - from.lat) * eased,
        lng: from.lng + (target.lng - from.lng) * eased,
      });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, hasTarget, duration]);

  return pos;
}
