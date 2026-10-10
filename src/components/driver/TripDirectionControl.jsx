import React, { useRef, useState } from "react";
import { Building2, Home } from "lucide-react";
import { tripDirection } from "@/lib/driverDirection";

export default function TripDirectionControl({ bus, workplace, onChange, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const direction = tripDirection(bus);
  const change = async (next) => {
    if (pending.current || next === direction) return;
    pending.current = true; setBusy(true); setError("");
    try { await onChange(next); }
    catch (e) { setError(e?.response?.data?.error || e?.message || "Couldn't save direction. Try again."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className="rounded-xl border border-border bg-card p-3" aria-label="Trip direction">
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choose trip direction">
      {[["to_work", "To work", Building2], ["to_home", "To home", Home]].map(([id,label,Icon]) =>
        <button key={id} type="button" aria-pressed={direction === id} disabled={disabled || busy}
          onClick={()=>change(id)} className={"flex min-h-[48px] items-center justify-center gap-2 rounded-xl border font-semibold disabled:opacity-50 " +
          (direction === id ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent")}>
          <Icon className="h-5 w-5" aria-hidden="true" />{label}
        </button>)}
    </div>
    <p className="mt-2 text-body-sm text-muted-foreground" role="status">{busy ? "Saving direction…" :
      direction === "to_home" ? (workplace?.name || "Company") + " → home pickup spots" :
      "Home pickup spots → " + (workplace?.name || "company")}</p>
    {error && <p role="alert" className="mt-2 text-body-sm text-danger">{error}</p>}
  </section>;
}
