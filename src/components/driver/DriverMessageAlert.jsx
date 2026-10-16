import React, { useEffect, useRef } from "react";
import { MessageSquare, X } from "lucide-react";

export default function DriverMessageAlert({ alert, onAcknowledge }) {
  const closeRef = useRef(onAcknowledge);
  closeRef.current = onAcknowledge;
  useEffect(() => {
    if (!alert?.id) return undefined;
    const timer = setTimeout(() => closeRef.current?.(), 2000);
    return () => clearTimeout(timer);
  }, [alert?.id]);
  if (!alert) return null;

  return (
    <div role="status" aria-live="polite" className="fixed inset-x-3 top-4 z-[100] flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg max-h-[45vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl p-4 space-y-3 animate-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {alert.is_reply ? "" : alert.driver_email ? "Message from dispatch" : "Broadcast"}
              </p>
              <h2 className="text-lg font-heading font-semibold">{alert.title || "New message"}</h2>
            </div>
          </div>
          <button aria-label="Dismiss message" onClick={onAcknowledge} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-base text-foreground whitespace-pre-wrap">{alert.message}</p>

        {alert.vehicle_name && (
          <p className="text-xs text-muted-foreground">Re: {alert.vehicle_name}</p>
        )}

        <p className="text-xs text-muted-foreground">Saved in Messages. Open Messages to reply.</p>
      </div>
    </div>
  );
}