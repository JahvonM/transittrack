import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { WifiOff } from "lucide-react";

// Driver tablets and kiosks show their own connection state.
const OWN_INDICATOR = ["/driver", "/kiosk"];

// One app-wide notice while the device has no connection. Presentation only:
// it reads navigator.onLine and changes nothing about how data loads or saves.
export default function OfflineNotice() {
  const { pathname } = useLocation();
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (online || OWN_INDICATOR.some((p) => pathname.startsWith(p))) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-50 flex justify-center px-4">
      <p role="status" className="flex max-w-md items-center gap-2 rounded-full border border-warning/40 bg-card px-4 py-2 text-body-sm shadow-lg">
        <WifiOff className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span><span className="font-semibold">You're offline.</span> Showing the last information received.</span>
      </p>
    </div>
  );
}
