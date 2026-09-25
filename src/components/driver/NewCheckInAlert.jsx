import React, { useEffect } from "react";
import { User as UserIcon, CreditCard, QrCode, Hash, Search } from "lucide-react";

const AUTO_DISMISS_MS = 6000;

const METHOD_META = {
  nfc: { label: "NFC", Icon: CreditCard },
  qr: { label: "QR", Icon: QrCode },
  code: { label: "CODE", Icon: Hash },
  manual: { label: "MANUAL", Icon: Search },
};

// Transient, non-blocking toast styled like a physical ID badge — deliberately
// NOT a full-screen modal like DriverMessageAlert, since a driver shouldn't
// have the screen blocked over a routine boarding event while driving.
export default function NewCheckInAlert({ checkIn, onDismiss }) {
  useEffect(() => {
    if (!checkIn) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [checkIn, onDismiss]);

  if (!checkIn) return null;

  const boarded = checkIn.status !== "off_board";
  const method = METHOD_META[checkIn.check_in_method] || METHOD_META.manual;
  const MethodIcon = method.Icon;
  const time = checkIn.boarded_at
    ? new Date(checkIn.boarded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="fixed top-4 inset-x-4 z-[90] flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl border border-border/60 bg-card animate-in fade-in slide-in-from-top-4 zoom-in-95 duration-300">
        <div className={`h-2 ${boarded ? "bg-emerald-500" : "bg-sky-500"}`} />
        <div className="p-4 flex gap-3 items-start">
          <div className="w-16 h-20 rounded-lg overflow-hidden bg-muted border border-border shrink-0 grid place-items-center">
            {checkIn.staff_picture_url
              ? <img src={checkIn.staff_picture_url} alt="" className="w-full h-full object-cover" />
              : <UserIcon className="w-7 h-7 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${boarded ? "text-emerald-500" : "text-sky-500"}`}>
              {boarded ? "Boarded" : "Exited"}
            </p>
            <p className="font-heading font-bold text-lg leading-tight truncate">{checkIn.staff_name}</p>
            {checkIn.company_name && <p className="text-xs text-muted-foreground truncate">{checkIn.company_name}</p>}
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
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
