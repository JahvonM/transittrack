import React, { useState, useRef } from "react";
import { SOS_MESSAGE, waLink } from "@/lib/mapbox";
import { Siren } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function SosButton({ vehicle, invoke }) {
  const [holding, setHolding] = useState(false);
  const [fired, setFired] = useState(false);
  const timer = useRef(null);
  const { toast } = useToast();

  const trigger = async () => {
    setFired(true);
    setHolding(false);
    try {
      await invoke("sos");
      toast({ title: "SOS activated", description: "Vehicle marked emergency. Tap below to alert staff via WhatsApp.", variant: "destructive" });
    } catch (e) {
      toast({ title: "SOS failed", description: e.message, variant: "destructive" });
    }
  };

  const startHold = () => { setHolding(true); timer.current = setTimeout(trigger, 800); };
  const cancelHold = () => { setHolding(false); if (timer.current) clearTimeout(timer.current); };

  const link = waLink(null, SOS_MESSAGE);

  return (
    <div className="space-y-2">
      <button
        onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
        onTouchStart={startHold} onTouchEnd={cancelHold} disabled={fired}
        className={`w-full rounded-2xl border-2 border-destructive/40 py-5 flex flex-col items-center gap-1 transition-all ${
          holding ? "bg-destructive scale-95" : fired ? "bg-destructive/20" : "bg-destructive/10 hover:bg-destructive/20"
        }`}
      >
        <Siren className={`w-8 h-8 text-destructive ${holding ? "animate-ping" : ""}`} />
        <span className="font-bold text-destructive">{fired ? "SOS SENT" : holding ? "HOLD…" : "SOS"}</span>
        <span className="text-xs text-muted-foreground">{fired ? "Tap below to alert staff" : "Press and hold to activate"}</span>
      </button>
      {fired && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium py-3 flex items-center justify-center gap-2">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm5 14.5l-2.1-2.1c-.6.4-1.3.6-2 .6-2 0-3.5-1.6-3.5-3.5 0-.7.2-1.4.6-2L7.9 7.4l1.4-1.4 2.1 2.1c.6-.4 1.3-.6 2-.6 2 0 3.5 1.6 3.5 3.5 0 .7-.2 1.4-.6 2l2.1 2.1-1.4 1.4z"/></svg>
          Send WhatsApp alert to staff
        </a>
      )}
    </div>
  );
}