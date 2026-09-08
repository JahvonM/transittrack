import React, { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 64;

/**
 * Basic pull-to-refresh for mobile scrollable lists.
 * Detects a downward pull when the window is scrolled to the top,
 * shows a spinner, and calls `onRefresh` (may return a promise).
 */
export default function PullToRefresh({ onRefresh, children, className }) {
  const startY = useRef(0);
  const [pull, setPull] = useState(0);
  const [active, setActive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e) => {
    if (refreshing) return;
    if (typeof window !== "undefined" && window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    setActive(true);
  };

  const onTouchMove = (e) => {
    if (!active || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setPull(Math.min(dy * 0.5, THRESHOLD + 24));
    else setPull(0);
  };

  const onTouchEnd = async () => {
    if (!active) return;
    setActive(false);
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await onRefresh?.();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const indicatorHeight = refreshing ? THRESHOLD : pull;

  return (
    <div
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: indicatorHeight,
          transition: active ? "none" : "height 0.2s ease-out",
        }}
      >
        {indicatorHeight > 0 && (
          <Loader2
            className={cn("w-5 h-5 text-muted-foreground", refreshing && "animate-spin")}
          />
        )}
      </div>
      {children}
    </div>
  );
}