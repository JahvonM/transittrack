import TabletCellularPanel from "@/components/driver/TabletCellularPanel";
import NativeNetworkPanel from "@/components/driver/NativeNetworkPanel";
import TabletRecoveryPanel from "@/components/driver/TabletRecoveryPanel";
import BoardingBluetoothPanel from "@/components/driver/BoardingBluetoothPanel";
import { Link } from "react-router-dom";
import TabletDiagnosticsPanel from "@/components/driver/TabletDiagnosticsPanel";
import UsbNfcPanel from "@/components/driver/UsbNfcPanel";
import React, { useEffect, useRef, useState } from "react";
import { Delete, Loader2, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TabletNetworkPanel from "@/components/driver/TabletNetworkPanel";
import TabletSettings from "@/components/tablet/TabletSettings";
import { rememberPin, checkPinOffline } from "@/lib/offlinePin";
import { isNetworkFailure } from "@/lib/offlineQueue";
import { httpStatus, errorData } from "@/lib/requestError";

// Boarding tablet: hold the top bar for 3 seconds, then the bus PIN (the one
// the driver tablet uses) opens this tablet's Internet settings. Passengers
// never see a button for it. The PIN is checked by the server; after one
// online check this tablet keeps a salted check of it, so it also opens with
// no internet later (5 tries a day, like the driver tablet).
export const HOLD_MS = 3000;
const IDLE_CLOSE_MS = 2 * 60 * 1000;
const pinStore = (deviceId) => `boarding-settings-${deviceId}`;

// Handlers for the element to hold; calls onHold after HOLD_MS.
export function useHold(onHold, ms = HOLD_MS) {
  const timer = useRef(null);
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => cancel, []);
  return {
    onPointerDown: () => { cancel(); timer.current = setTimeout(() => { timer.current = null; onHold(); }, ms); },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
  };
}

function PinPad({ deviceId, invoke, onUnlock, onCancel }) {
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const store = pinStore(deviceId);

  const offline = async (value) => {
    if (await checkPinOffline(store, value)) { onUnlock(); return; }
    setError("No internet, and this PIN hasn't been checked on this tablet before (or it's wrong). Connect once, or choose this tablet's Wi-Fi in Admin → Kiosk tablets.");
  };
  const submit = async (value) => {
    setChecking(true);
    setError("");
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) { await offline(value); return; }
      const res = await invoke("verify_settings_pin", { pin: value });
      if (res?.ok !== true) throw new Error("PIN not confirmed");
      rememberPin(store, value);
      onUnlock();
    } catch (e) {
      const status = httpStatus(e);
      if (status === 403) setError("Wrong PIN. Use the bus PIN from the driver tablet.");
      else if (status === 429) setError(errorData(e).error || "Too many tries. Wait 15 minutes.");
      else if (isNetworkFailure(e)) await offline(value);
      else setError("Couldn't check the PIN. Try again.");
    } finally {
      setChecking(false);
      setPin("");
    }
  };
  const press = (d) => {
    if (checking || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) submit(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3" aria-label={`${pin.length} of 4 digits entered`} role="status">
        {[0, 1, 2, 3].map((i) => <span key={i} className={`h-4 w-4 rounded-full border-2 border-primary ${i < pin.length ? "bg-primary" : ""}`} />)}
      </div>
      {checking && <p className="text-center text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Checking…</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button key={d} type="button" variant="outline" className="h-16 text-2xl font-semibold" disabled={checking} onClick={() => press(d)}>{d}</Button>
        ))}
        <Button type="button" variant="ghost" className="h-16" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="outline" className="h-16 text-2xl font-semibold" disabled={checking} onClick={() => press("0")}>0</Button>
        <Button type="button" variant="ghost" className="h-16" aria-label="Delete last digit" disabled={checking || !pin} onClick={() => setPin((p) => p.slice(0, -1))}><Delete className="h-6 w-6" /></Button>
      </div>
    </div>
  );
}

export default function BoardingSettingsGate({ open, onClose, deviceId, invoke }) {
  const [unlocked, setUnlocked] = useState(false);
  const idle = useRef(null);
  useEffect(() => { if (!open) setUnlocked(false); }, [open]);
  // Close by itself if left open, so a passenger never finds it unlocked.
  const poke = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => onClose(), IDLE_CLOSE_MS);
  };
  useEffect(() => {
    if (!open) return undefined;
    poke();
    return () => { if (idle.current) clearTimeout(idle.current); };
    // Restart the idle timer when the gate opens or unlocks.
  }, [open, unlocked]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={unlocked ? "max-w-5xl w-[96vw] h-[92dvh] p-0 border-0 bg-transparent shadow-none overflow-hidden [&>button.absolute]:hidden" : "max-w-lg max-h-[95dvh] overflow-y-auto"} onPointerDownCapture={poke} onKeyDownCapture={poke}>
        <DialogHeader className={unlocked ? "sr-only" : undefined}>
          <DialogTitle className="flex items-center gap-2">{unlocked ? "Tablet settings" : <><Lock className="h-5 w-5" /> Bus PIN</>}</DialogTitle>
          <DialogDescription>{unlocked ? "Closes by itself after 2 minutes without a tap." : "Enter the bus PIN to change this tablet's Internet settings."}</DialogDescription>
        </DialogHeader>
        {unlocked ? (
          <TabletSettings
            className="h-full"
            headingLevel={2}
            decorativeTitle
            title="Tablet settings"
            subtitle="Closes by itself after 2 minutes without a tap."
            onDone={onClose}
            sections={[
              { id: "reader", label: "Card reader", content: <UsbNfcPanel /> },
              { id: "bluetooth", label: "Bluetooth boarding", content: <BoardingBluetoothPanel /> },
              { id: "connection", label: "Connection", content: <><TabletNetworkPanel boarding /><NativeNetworkPanel boarding /><TabletCellularPanel /></> },
              { id: "startup", label: "Startup", content: <><TabletRecoveryPanel /><Button asChild variant="outline" className="w-full"><Link to="/tablet?choose=1">Choose tablet screen</Link></Button></> },
              { id: "health", label: "Tablet health", content: <TabletDiagnosticsPanel /> },
            ]}
          />
        ) : (
          <PinPad deviceId={deviceId} invoke={invoke} onUnlock={() => setUnlocked(true)} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
