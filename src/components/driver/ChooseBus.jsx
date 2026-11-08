import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompanyBanner from "@/components/CompanyBanner";
import DriverGreeting from "@/components/driver/DriverGreeting";
import BusList from "@/components/driver/BusList";
import { busChoiceMessage, ownDeviceNoun } from "@/lib/driverOwnDevice";

// A driver's own phone (the store app) belongs to the driver, not to a bus,
// so before each shift it asks which bus they're driving. The bus PIN comes
// next, on the usual unlock screen.
export default function ChooseBus({ session, invoke, onChosen, onUnpair }) {
  const [buses, setBuses] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  // keepError: after a refused choice, refresh the list but keep saying why.
  const load = useCallback(async ({ keepError = false } = {}) => {
    if (!keepError) setError("");
    try {
      const res = await invoke("list_buses");
      setBuses(Array.isArray(res?.buses) ? res.buses : []);
    } catch (e) {
      setBuses((prev) => prev || []);
      setError(busChoiceMessage(e, "Couldn't load the buses. Check the connection and try again."));
    }
  }, [invoke]);

  useEffect(() => { load(); }, [load]);

  const choose = async (bus) => {
    setBusy(bus.id);
    setError("");
    try {
      await invoke("choose_bus", { vehicle_id: bus.id });
      await onChosen?.(bus);
    } catch (e) {
      setError(busChoiceMessage(e, `Couldn't choose ${bus.name}. Try again.`));
      load({ keepError: true });
    } finally {
      setBusy("");
    }
  };

  // Same frame as the PIN screen: a phone or a tablet held upright stacks the
  // greeting over the list; a tablet on its side puts them side by side.
  return (
    <div className="min-h-[100dvh] grid place-items-center safe-area-top safe-area-x">
      <div className="grid w-full max-w-xl gap-6 p-4 pb-10 [@media(orientation:landscape)]:max-w-4xl [@media(orientation:landscape)]:grid-cols-2 [@media(orientation:landscape)]:items-center [@media(orientation:landscape)]:gap-10 [@media(orientation:landscape)]:p-6">
        <div className="flex flex-col gap-3 [@media(orientation:landscape)]:gap-6">
          <CompanyBanner name={session?.company_name} logoUrl={session?.company_logo_url} compact />
          <DriverGreeting driverName={session?.driver_name} compact />
        </div>

        <div className="flex flex-col gap-6">
        <section aria-labelledby="choose-bus-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="choose-bus-title" className="text-title font-bold">Which bus are you driving?</h2>
              <p className="text-body-sm text-muted-foreground mt-1">Then enter that bus's PIN to start.</p>
            </div>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Refresh the list" onClick={() => load()} disabled={buses === null}>
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>

          {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-body-sm text-destructive">{error}</p>}

          <BusList buses={buses} pickingId={busy} onPick={choose}
            emptyText={`No buses are in service for ${session?.company_name || "your company"}. Ask the office to add one.`} />
        </section>

        <Button variant="ghost" className="self-center text-muted-foreground" onClick={onUnpair}>
          <LogOut className="mr-2 h-4 w-4" /> Unpair this {ownDeviceNoun()}
        </Button>
        </div>
      </div>
    </div>
  );
}
