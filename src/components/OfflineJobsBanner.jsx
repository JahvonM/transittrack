import React, { useEffect, useState } from "react";
import { CloudOff, CloudUpload } from "lucide-react";
import { JOBS_EVENT, flushJobs, pendingJobs } from "@/lib/offlineJobs";

// Small pill shown while inspections are waiting on this device to upload.
export default function OfflineJobsBanner() {
  const [count, setCount] = useState(() => pendingJobs().length);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const refresh = () => setCount(pendingJobs().length);
    const up = () => { setOnline(true); refresh(); };
    const down = () => setOnline(false);
    window.addEventListener(JOBS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener(JOBS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (!count) return null;
  const Icon = online ? CloudUpload : CloudOff;
  return (
    <button
      type="button"
      onClick={() => flushJobs()}
      className="fixed left-1/2 -translate-x-1/2 z-50 bottom-[calc(env(safe-area-inset-bottom)+84px)] md:bottom-6 flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur px-4 py-2 text-sm shadow-lg"
      role="status"
    >
      <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
      {count} inspection{count === 1 ? "" : "s"} {online ? "uploading…" : "waiting for signal"}
    </button>
  );
}
