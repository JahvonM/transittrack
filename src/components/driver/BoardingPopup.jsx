import React, { useEffect } from "react";
import { Image } from "@/components/ui/image";
import { LogIn, X } from "lucide-react";

export default function BoardingPopup({ data, onClose }) {
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [data, onClose]);

  if (!data) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-4 bg-card border border-emerald-500/40 shadow-xl rounded-2xl p-4 pr-3 animate-in fade-in slide-in-from-top-4 duration-300 max-w-md w-full">
        <div className="shrink-0">
          {data.picture ? (
            <Image src={data.picture} className="w-14 h-14 rounded-full" fittingType="fill" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center">
              <LogIn className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-emerald-400 font-medium uppercase tracking-wide">Boarded the bus</div>
          <div className="font-heading font-semibold text-lg truncate">{data.name}</div>
          {data.time && <div className="text-xs text-muted-foreground">{data.time}</div>}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}