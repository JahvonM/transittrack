import React, { useCallback, useEffect, useState } from "react";
import { Bus, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompanyBanner from "@/components/CompanyBanner";
import DriverGreeting from "@/components/driver/DriverGreeting";
import { busChoiceMessage } from "@/lib/driverOwnDevice";

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

  const free = (buses || []).filter((b) => !b.busy);
  const taken = (buses || []).filter((b) => b.busy);

  return (
    <div className="min-h-[100dvh] safe-area-top safe-area-x">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 pb-10">
        <div className="flex flex-col gap-3">
          <CompanyBanner name={session?.company_name} logoUrl={session?.company_logo_url} compact />
          <DriverGreeting driverName={session?.driver_name} compact />
        </div>

        <section aria-labelledby="choose-bus-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="choose-bus-title" className="text-title font-bold">Which bus are you driving?</h2>
              <p className="text-body-sm text-muted-foreground mt-1">Then enter that bus's PIN to start.</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Refresh the list" onClick={() => load()} disabled={buses === null}>
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>

          {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-body-sm text-destructive">{error}</p>}

          {buses === null ? (
            <p className="py-8 text-center text-muted-foreground" role="status">Loading buses…</p>
          ) : buses.length === 0 ? (
            <p className="rounded-xl border px-4 py-6 text-center text-muted-foreground">
              No buses are in service for {session?.company_name || "your company"}. Ask the office to add one.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {free.map((bus) => (
                <li key={bus.id}>
                  <button
                    type="button"
                    onClick={() => choose(bus)}
                    disabled={!!busy}
                    className="flex min-h-[72px] w-full items-center gap-4 rounded-2xl border bg-card px-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Bus className="h-6 w-6" /></span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-semibold">{bus.name}</span>
                      {bus.plate_number && <span className="text-body-sm text-muted-foreground">{bus.plate_number}</span>}
                    </span>
                    <span className="text-body-sm font-medium text-primary">{busy === bus.id ? "Choosing…" : "Drive this bus"}</span>
                  </button>
                </li>
              ))}
              {taken.map((bus) => (
                <li key={bus.id} className="flex min-h-[64px] items-center gap-4 rounded-2xl border border-dashed px-4 text-muted-foreground">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden="true"><Bus className="h-6 w-6" /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body">{bus.name}</span>
                    <span className="text-body-sm">Another driver is on shift</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Button variant="ghost" className="self-center text-muted-foreground" onClick={onUnpair}>
          <LogOut className="mr-2 h-4 w-4" /> Unpair this phone
        </Button>
      </div>
    </div>
  );
}
