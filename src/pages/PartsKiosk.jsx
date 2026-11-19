import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import useFutureAppearance from "@/hooks/useFutureAppearance";
import useHomeScreenApp from "@/hooks/useHomeScreenApp";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import KioskPartForm from "@/components/admin/KioskPartForm";
import { CheckCircle2, ListChecks, LogOut, RefreshCw } from "lucide-react";

// The parts kiosk: app.mcsweenstransport.com/parts, for a phone or a tablet in
// the workshop. One screen with no menus, in the app's dark kiosk look: add a
// part or restock one, and see what was added here. It needs an
// administrator's or mechanic's sign-in like the rest of the app (the server
// checks every save); on a shared tablet, sign in once and it stays signed in
// until someone taps Sign out. "Add to Home Screen" here makes a "Parts" icon
// that opens this page.

const timeOf = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function AddedLog({ log, allParts }) {
  return (
    <div className="space-y-3">
      {log.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
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
    </div>
  );
}

export default function PartsKiosk() {
  useFutureAppearance();
  useHomeScreenApp({ manifest: "/parts.webmanifest?v=parts1", title: "Parts" });
  const { user, logout } = useAuth();
  const [parts, setParts] = useState([]);
  const [guides, setGuides] = useState([]);
  const [state, setState] = useState("loading");
  const [log, setLog] = useState([]);
  const [logOpen, setLogOpen] = useState(false);

  // Loaded once. Saves don't reload it: the form keeps what it saved.
  const load = useCallback(async () => {
    setState("loading");
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
      setState("failed");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const added = useCallback((entry) => setLog((l) => [{ ...entry, at: new Date() }, ...l].slice(0, 50)), []);
  const allParts = user?.role === "mechanic" ? "/mechanic" : "/admin/parts";

  return (
    <div className="tt-phone-future min-h-[100dvh] touch-manipulation bg-background text-foreground">
      <header className="safe-area-top border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-4">
          <Logo className="h-8 w-8" />
          <h1 className="text-title-sm font-semibold">Parts</h1>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="secondary" size="sm" className="h-10 rounded-xl md:hidden" onClick={() => setLogOpen(true)} aria-label={`Added on this screen: ${log.length}`}>
              <ListChecks className="mr-1.5 h-4 w-4" aria-hidden="true" />Added{log.length > 0 && <span className="ml-1 tabular-nums">{log.length}</span>}
            </Button>
            <Button variant="ghost" size="sm" className="h-10" onClick={() => logout()}><LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))] pt-3 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-6 md:pb-8 md:pt-6">
        <section aria-label="Add a part" className="space-y-3 md:rounded-2xl md:border md:border-border md:bg-card md:p-5">
          {state === "failed" && (
            <div role="alert" className="flex items-center gap-3 rounded-xl border border-border p-3">
              <p className="flex-1 text-body-sm">Couldn't load your parts. Check the connection.</p>
              <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={load}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>
            </div>
          )}
          <KioskPartForm
            parts={parts} guides={guides} ready={state === "ready"}
            notReadyLabel={state === "failed" ? "Load your parts first" : "Loading your parts…"}
            onAdded={added}
          />
        </section>

        <aside aria-labelledby="kiosk-log" className="hidden space-y-3 md:block">
          <h2 id="kiosk-log" className="flex items-center gap-2 text-body font-semibold"><ListChecks className="h-4 w-4" aria-hidden="true" />Added on this screen</h2>
          <AddedLog log={log} allParts={allParts} />
        </aside>
      </main>

      <Sheet open={logOpen} onOpenChange={setLogOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-3xl p-5 safe-area-bottom">
          <SheetHeader className="text-left">
            <SheetTitle>Added on this screen</SheetTitle>
            <SheetDescription>Parts added or restocked since this page was opened.</SheetDescription>
          </SheetHeader>
          <div className="mt-4"><AddedLog log={log} allParts={allParts} /></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
