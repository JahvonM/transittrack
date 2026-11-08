import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompanyBanner from "@/components/CompanyBanner";
import BusList from "@/components/driver/BusList";
import PinGate from "@/components/driver/PinGate";
import { busChoiceMessage, forgetBusAccess, rememberBus } from "@/lib/driverOwnDevice";

// A bus's own driver tablet moved to another bus, or whose bus was removed:
// pick the bus it's in now, then enter THAT bus's PIN. The old bus's PIN isn't
// needed. The tablet stays paired and opens on the new bus, unlocked.
export default function SwitchBus({ session, deviceId, invoke, gone = false, onCancel, onSwitched, onUnpair }) {
  const [buses, setBuses] = useState(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(null);
  // The driver is on shift on this tablet's bus: that shift ends first.
  const [shiftOpen, setShiftOpen] = useState("");
  const moved = useRef(null);
  const current = gone ? null : session?.vehicle || null;

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await invoke("list_buses");
      setBuses(Array.isArray(res?.buses) ? res.buses : []);
      setShiftOpen(typeof res?.shift_open === "string" ? res.shift_open : "");
    } catch (e) {
      setBuses((prev) => prev || []);
      setError(busChoiceMessage(e, "Couldn't load the buses. Check the connection and try again."));
    }
  }, [invoke]);
  useEffect(() => { load(); }, [load]);

  // The server checks the new bus's PIN and moves the tablet. What the tablet
  // kept for the old bus (its pass and saved PIN) goes; the PIN pad then
  // saves the new bus's pass and PIN, so the next unlock works offline too.
  const verify = async (pin) => {
    const result = await invoke("switch_bus", { vehicle_id: picked.id, pin });
    if (result?.ok === true && result.driver_grant) {
      forgetBusAccess(deviceId);
      rememberBus(deviceId, result.vehicle?.id || picked.id);
      moved.current = result;
    }
    return result;
  };

  const company = session?.company_name || current?.company_name;
  return (
    <div className="min-h-[100dvh] grid place-items-center safe-area-top safe-area-x">
      <div className="grid w-full max-w-xl gap-6 p-4 pb-10 [@media(orientation:landscape)]:max-w-4xl [@media(orientation:landscape)]:grid-cols-2 [@media(orientation:landscape)]:items-center [@media(orientation:landscape)]:gap-10 [@media(orientation:landscape)]:p-6">
        <div className="flex flex-col gap-3 [@media(orientation:landscape)]:gap-6">
          <CompanyBanner name={company} logoUrl={session?.company_logo_url} compact />
          <div>
            <h1 className="text-title font-bold">{gone ? "This tablet's bus was removed" : "Switch bus"}</h1>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {gone
                ? "Choose the bus this tablet is in now, then enter that bus's PIN."
                : `This tablet is on ${current?.name || "a bus"}. Choose the bus it's in now, then enter that bus's PIN. The old bus's PIN isn't needed.`}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {picked ? (
            <>
              <PinGate key={picked.id} vehicle={picked} deviceId={deviceId} invoke={invoke} verify={verify} onlineOnly
                onUnlock={({ pinSaved } = {}) => onSwitched?.(moved.current, { pinSaved })} />
              <Button variant="ghost" className="self-center text-muted-foreground" onClick={() => setPicked(null)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Choose another bus
              </Button>
            </>
          ) : (
            <section aria-labelledby="switch-bus-title" className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-3">
                <h2 id="switch-bus-title" className="text-body font-semibold">Which bus is this tablet in?</h2>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Refresh the list" onClick={load} disabled={buses === null}>
                  <RefreshCw className="h-5 w-5" />
                </Button>
              </div>
              {(error || shiftOpen) && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-body-sm text-destructive">{error || `${shiftOpen}.`}</p>}
              <BusList buses={buses} currentId={current?.id || null} disabled={!!shiftOpen} onPick={(bus) => { setError(""); setPicked(bus); }} pickLabel="Switch to this bus"
                emptyText={`No buses are in service for ${company || "this company"}. Ask the office to add one.`} />
              {onCancel
                ? <Button variant="ghost" className="self-center text-muted-foreground" onClick={onCancel}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                : <Button variant="ghost" className="self-center text-muted-foreground" onClick={onUnpair}><LogOut className="mr-2 h-4 w-4" /> Unpair this tablet</Button>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
