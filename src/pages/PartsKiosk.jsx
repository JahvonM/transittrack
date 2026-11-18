import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { accountName } from "@/lib/userName";
import Logo from "@/components/Logo";
import BusLoader from "@/components/BusLoader";
import { Button } from "@/components/ui/button";
import { QuickAddPartForm } from "@/components/admin/QuickAddPart";
import { CheckCircle2, ListChecks, LogOut, RefreshCw } from "lucide-react";

// The parts kiosk: app.mcsweenstransport.com/parts, for a phone or a tablet in
// the workshop. One screen with no menus: add a part or restock one, and see
// what was added here. It needs an administrator's or mechanic's sign-in like
// the rest of the app (the server checks every save); on a shared tablet,
// sign in once and it stays signed in until someone taps Sign out.

const timeOf = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function PartsKiosk() {
  const { user, logout } = useAuth();
  const [parts, setParts] = useState([]);
  const [guides, setGuides] = useState([]);
  const [state, setState] = useState("loading");
  const [log, setLog] = useState([]);

  const load = async () => {
    try {
      const [p, g] = await Promise.all([
        base44.entities.Part.list(),
        // The models are a convenience: the kiosk still adds parts without them.
        base44.entities.VehicleGuide.list("make", 200).catch(() => []),
      ]);
      setParts(p || []);
      setGuides(g || []);
      setState("ready");
    } catch {
      setState((s) => (s === "ready" ? s : "failed"));
    }
  };
  useEffect(() => { load(); }, []);

  const added = (entry) => setLog((l) => [{ ...entry, at: new Date() }, ...l].slice(0, 50));
  const allParts = user?.role === "mechanic" ? "/mechanic" : "/admin/parts";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Logo className="h-10 w-10" />
          <div className="min-w-0">
            <p className="text-caption text-muted-foreground">McSween Transport</p>
            <h1 className="text-title font-semibold leading-tight">Parts</h1>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden max-w-[200px] truncate text-body-sm text-muted-foreground sm:inline">{accountName(user)}</span>
            <Button variant="ghost" size="sm" onClick={() => logout()}><LogOut className="mr-1.5 h-4 w-4" />Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="kiosk-add" className="space-y-3">
          <div>
            <h2 id="kiosk-add" className="text-title font-semibold">Add a part</h2>
            <p className="text-body-sm text-muted-foreground">Take a photo, paste or type its number, and say how many. A part you already have is added to its stock.</p>
          </div>
          {state === "loading" && <BusLoader className="py-10" />}
          {state === "failed" && (
            <div role="alert" className="space-y-3 rounded-2xl border border-border p-4">
              <p className="text-body-sm">Couldn't load your parts. Check the connection and try again.</p>
              <Button variant="outline" onClick={() => { setState("loading"); load(); }}><RefreshCw className="mr-1.5 h-4 w-4" />Try again</Button>
            </div>
          )}
          {state === "ready" && (
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <QuickAddPartForm parts={parts} guides={guides} onSaved={load} onAdded={added} large />
            </div>
          )}
        </section>

        <aside aria-labelledby="kiosk-log" className="space-y-3">
          <h2 id="kiosk-log" className="flex items-center gap-2 text-body font-semibold"><ListChecks className="h-4 w-4" aria-hidden="true" />Added on this screen</h2>
          {log.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {log.map((e, i) => (
                <li key={`${e.at.getTime()}-${i}`} className="flex items-start gap-2 px-3 py-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-semibold">{e.name}</p>
                    <p className="text-caption text-muted-foreground">
                      {e.restocked ? `+${e.quantity} to stock, now ${e.total}` : `New part, ${e.quantity} in stock`} · {timeOf(e.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to={allParts} className="inline-block text-body-sm underline underline-offset-2">See all parts</Link>
        </aside>
      </main>
    </div>
  );
}
