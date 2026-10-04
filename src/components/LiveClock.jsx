import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// seconds/mono default to the original look; the driver top bar turns both off.
export default function LiveClock({ className, seconds = true, mono = true }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className={cn(mono && "font-mono", "tabular-nums", className)}>
      {now.toLocaleTimeString([], seconds ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}