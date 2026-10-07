import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import React, { useEffect, useRef } from "react";
import { User as UserIcon, CreditCard, QrCode, Hash, Search } from "lucide-react";

const AUTO_DISMISS_MS = 6000;

const METHOD_META = {
  nfc: { label: "NFC", Icon: CreditCard },
  qr: { label: "QR", Icon: QrCode },
  code: { label: "CODE", Icon: Hash },
  manual: { label: "MANUAL", Icon: Search },
};

// Full-screen boarding ID with automatic dismissal and an immediate close button.
export default function NewCheckInAlert({ checkIn, onDismiss }) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const eventId = checkIn?.id;
  useEffect(() => {
    if (!eventId) return;
    const t = setTimeout(() => dismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [eventId]);

  if (!checkIn) return null;

  const boarded = checkIn.status !== "off_board";
  const method = METHOD_META[checkIn.check_in_method] || METHOD_META.manual;
  const MethodIcon = method.Icon;
  const time = checkIn.boarded_at
    ? new Date(checkIn.boarded_at).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div role="dialog" aria-label="Passenger boarding ID" aria-modal="true" className="relative pointer-events-auto w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl border border-border/60 bg-card animate-in fade-in slide-in-from-top-4 zoom-in-95 duration-300">
        <div className={`h-2 ${boarded ? "bg-success" : "bg-info"}`} />
        <button type="button" onClick={onDismiss} className="absolute top-4 right-4 rounded-full border bg-card px-4 py-2 text-sm">Close</button>
        <div className="p-6 sm:p-10 flex flex-col sm:flex-row gap-6 items-center">
          <div className="w-36 h-44 sm:w-52 sm:h-64 rounded-lg overflow-hidden bg-muted border border-border shrink-0 grid place-items-center">
            {checkIn.staff_picture_url
              ? <img src={checkIn.staff_picture_url} alt="" className="w-full h-full object-cover" />
              : <UserIcon className="w-20 h-20 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className={`text-sm font-bold uppercase tracking-wider ${boarded ? "text-success" : "text-info"}`}>
              {boarded ? "Boarded" : "Exited"}
            </p>
            <p className="font-heading font-bold text-3xl sm:text-5xl leading-tight break-words">{checkIn.staff_name}</p>
            {checkIn.company_name && <p className="text-lg text-muted-foreground">{checkIn.company_name}</p>}
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MethodIcon className="w-3 h-3" /> {method.label}</span>
              {time && <span>· {time}</span>}
            </div>
          </div>
        </div>
        {/* decorative barcode strip — pure "ID badge" texture, not scannable */}
        <div className="px-4 pb-3 flex items-end gap-[2px] h-4 opacity-30 overflow-hidden">
          {Array.from({ length: 32 }).map((_, i) => (
            <div key={i} style={{ height: `${((i * 37) % 12) + 4}px` }} className="w-[2px] bg-foreground shrink-0" />
          ))}
        </div>
      </div>
    </div>
  );
}
