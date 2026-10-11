import React, { useState } from "react";
import { Bluetooth, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bluetoothBoardingSupported, sendBoardingCodeByBluetooth, bluetoothProblem } from "@/lib/bluetoothBoarding";

// Backup to the card and the QR: at the bus door, the passenger taps this,
// picks their bus, and confirms Boarding or Exiting on the bus tablet.
export default function BluetoothBoardButton({ qrToken }) {
  const [state, setState] = useState({ kind: "idle" });
  if (!qrToken) return null;
  const supported = bluetoothBoardingSupported();
  const send = async () => {
    setState({ kind: "sending" });
    try {
      const { bus } = await sendBoardingCodeByBluetooth(qrToken);
      setState({ kind: "sent", bus });
    } catch (e) {
      setState({ kind: "error", message: bluetoothProblem(e) });
    }
  };
  return (
    <div className="space-y-2 rounded-lg border p-3 text-left">
      <p className="flex items-center gap-2 text-sm font-medium"><Bluetooth className="h-4 w-4 text-primary" aria-hidden="true" /> Backup: board by Bluetooth</p>
      {supported ? (
        <>
          <p className="text-xs text-muted-foreground">If the card reader or camera isn't working: stand at the bus door, tap the button and pick your bus. Then tap Boarding or Exiting on the bus tablet.</p>
          <Button variant="outline" className="h-12 w-full text-base" disabled={state.kind === "sending"} onClick={send}>
            {state.kind === "sending" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bluetooth className="mr-2 h-4 w-4" />}
            {state.kind === "sending" ? "Sending…" : "Board by Bluetooth"}
          </Button>
          {state.kind === "sent" && (
            <p role="status" className="flex items-start gap-2 rounded-lg bg-success/10 p-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>Sent to {state.bus}. Your name shows on the bus tablet: tap Boarding or Exiting there.</span>
            </p>
          )}
          {state.kind === "error" && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{state.message}</p>}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Works in Chrome on Android phones. On this phone, show your QR or type your code instead.</p>
      )}
    </div>
  );
}
