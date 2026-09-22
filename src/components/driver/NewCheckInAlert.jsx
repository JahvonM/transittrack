import React, { useEffect } from "react";
import { User as UserIcon } from "lucide-react";

const AUTO_DISMISS_MS = 5000;

// Transient, non-blocking toast — deliberately NOT a full-screen modal like
// DriverMessageAlert, since a driver shouldn't have the screen blocked over
// a routine boarding event while driving.
export default function NewCheckInAlert({ checkIn, onDismiss }) {
  useEffect(() => {
    if (!checkIn) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [checkIn, onDismiss]);

  if (!checkIn) return null;

  return (
    <div className="fixed top-4 inset-x-4 z-[90] flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border bg-card shadow-lg px-4 py-3 max-w-sm w-full animate-in fade-in slide-in-from-top-2">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-muted border shrink-0 grid place-items-center">
          {checkIn.staff_picture_url
            ? <img src={checkIn.staff_picture_url} alt="" className="w-full h-full object-cover" />
            : <UserIcon className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{checkIn.staff_name}</p>
          <p className="text-xs text-muted-foreground">Checked in</p>
        </div>
      </div>
    </div>
  );
}
