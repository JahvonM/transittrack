import React, { useState, useRef, useEffect } from "react";
import { SOS_MESSAGE, waLink } from "@/lib/mapbox";
import { Siren, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// compact: a single-row button for the Drive screen side panel.
export default function SosButton({ vehicle, invoke, emergencyContacts, compact = false }) {
  const [holding, setHolding] = useState(false);
  const [fired, setFired] = useState(!!vehicle && vehicle.status === "emergency");
  const [contacts, setContacts] = useState(null); // { boss_phone, secretary_phone } once loaded
  const [cancelling, setCancelling] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const timer = useRef(null);
  const cooldownTimer = useRef(null);
  const { toast } = useToast();

  const trigger = async () => {
    setFired(true);
    setHolding(false);
    try {
      await invoke("sos");
      toast({ title: "SOS activated", description: "Admin and management have been alerted.", variant: "destructive" });
      // SOS goes to admin (in-app) plus the company's boss/secretary — never
      // to staff/passengers. Look up those numbers now so we can hand the
      // driver pre-addressed WhatsApp links instead of an open share sheet.
      setContacts(emergencyContacts || { boss_phone: "", secretary_phone: "" });
    } catch (e) {
      toast({ title: "SOS failed", description: e.message, variant: "destructive" });
      setFired(false);
    }
  };

  const startHold = () => { setHolding(true); timer.current = setTimeout(trigger, 800); };
  const cancelHold = () => { setHolding(false); if (timer.current) clearTimeout(timer.current); };

  // Keep the UI in sync with the vehicle's actual status — covers a crash
  // auto-detected as 'emergency' without the button being pressed (still
  // cancellable here), and admin marking it resolved from the dashboard
  // (resets this panel back to the idle SOS button).
  useEffect(() => {
    if (vehicle?.status === "emergency" && !fired) setFired(true);
    if (vehicle?.status !== "emergency" && fired && !cancelling) { setFired(false); setContacts(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.status]);

  const cancelSos = async () => {
    setCancelling(true);
    try {
      await invoke("cancel_sos");
      toast({ title: "SOS cancelled", description: "Admin and management have been told it was a false alarm." });
      setFired(false);
      setContacts(null);
      // Brief cooldown so an accidental double-tap can't immediately refire it.
      setCooldown(true);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      cooldownTimer.current = setTimeout(() => setCooldown(false), 10000);
    } catch (e) {
      toast({ title: "Failed to cancel", description: e.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const hasBoss = !!contacts?.boss_phone;
  const hasSecretary = !!contacts?.secretary_phone;
  const hasAnyContact = hasBoss || hasSecretary;

  return (
    <div className="space-y-2">
      <button
        onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
        onTouchStart={startHold} onTouchEnd={cancelHold} disabled={fired || cooldown}
        className={`w-full rounded-2xl border-2 border-destructive/40 ${compact ? "py-3 px-4 flex flex-row items-center justify-center gap-3 text-left" : "py-5 flex flex-col items-center gap-1"} transition-all ${
          holding ? "bg-destructive scale-95" : fired ? "bg-destructive/20" : "bg-destructive/10 hover:bg-destructive/20"
        }`}
      >
        <Siren className={`${compact ? "w-7 h-7" : "w-8 h-8"} text-destructive shrink-0 ${holding ? "animate-ping" : ""}`} />
        {compact ? (
          <span className="flex flex-col">
            <span className="font-bold text-destructive leading-tight">{fired ? "SOS SENT" : holding ? "HOLD…" : "SOS"}</span>
            <span className="text-xs text-muted-foreground">
              {fired ? "Admin notified" : cooldown ? "Available again shortly…" : "Press and hold to activate"}
            </span>
          </span>
        ) : (<>
        <span className="font-bold text-destructive">{fired ? "SOS SENT" : holding ? "HOLD…" : "SOS"}</span>
        <span className="text-xs text-muted-foreground">
          {fired ? "Admin notified · alert management below" : cooldown ? "Just cancelled — available again shortly…" : "Press and hold to activate"}
        </span>
        </>)}
      </button>
      {fired && (
        <div className="space-y-2">
          <Button variant="outline" className="w-full" disabled={cancelling} onClick={cancelSos}>
            <X className="w-4 h-4 mr-1.5" /> {cancelling ? "Cancelling…" : "Cancel SOS (false alarm)"}
          </Button>
          {contacts === null && (
            <p className="text-xs text-muted-foreground text-center">Looking up management contacts…</p>
          )}
          {contacts !== null && !hasAnyContact && (
            <p className="text-xs text-muted-foreground text-center">
              No boss/secretary phone on file for this company — ask admin to add one under Companies.
            </p>
          )}
          {hasBoss && (
            <a
              href={waLink(contacts.boss_phone, SOS_MESSAGE)}
              target="_blank" rel="noopener noreferrer"
              className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium py-3 flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm5 14.5l-2.1-2.1c-.6.4-1.3.6-2 .6-2 0-3.5-1.6-3.5-3.5 0-.7.2-1.4.6-2L7.9 7.4l1.4-1.4 2.1 2.1c.6-.4 1.3-.6 2-.6 2 0 3.5 1.6 3.5 3.5 0 .7-.2 1.4-.6 2l2.1 2.1-1.4 1.4z"/></svg>
              Alert boss via WhatsApp
            </a>
          )}
          {hasSecretary && (
            <a
              href={waLink(contacts.secretary_phone, SOS_MESSAGE)}
              target="_blank" rel="noopener noreferrer"
              className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium py-3 flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm5 14.5l-2.1-2.1c-.6.4-1.3.6-2 .6-2 0-3.5-1.6-3.5-3.5 0-.7.2-1.4.6-2L7.9 7.4l1.4-1.4 2.1 2.1c.6-.4 1.3-.6 2-.6 2 0 3.5 1.6 3.5 3.5 0 .7-.2 1.4-.6 2l2.1 2.1-1.4 1.4z"/></svg>
              Alert secretary via WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
