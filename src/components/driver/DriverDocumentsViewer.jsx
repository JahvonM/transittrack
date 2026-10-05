import React, { useEffect, useRef, useState } from "react";
import { Delete, FileText, IdCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const LABEL = { license: "Driver's licence", insurance: "Insurance" };
const SHOW_FOR_MS = 60_000;

const expiryNote = (iso) => {
  if (!iso) return null;
  const end = new Date(`${iso}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const text = end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return end.getTime() < Date.now() ? { text: `Expired ${text}`, expired: true } : { text: `Expires ${text}`, expired: false };
};

// "My licence & insurance" on the driver tablet. Asks for the bus PIN every
// time (even when the tablet is unlocked), shows the assigned driver's papers
// full screen, and forgets them when closed or after a minute. Nothing is saved.
export default function DriverDocumentsViewer({ invoke, busName }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const timer = useRef(null);

  const close = () => { setOpen(false); setPin(""); setError(""); setResult(null); clearTimeout(timer.current); };
  useEffect(() => () => clearTimeout(timer.current), []);

  const check = async (value) => {
    setBusy(true); setError("");
    try {
      const data = await invoke("my_documents", { pin: value });
      if (data?.ok !== true) throw new Error("not confirmed");
      setResult(data);
      clearTimeout(timer.current);
      timer.current = setTimeout(close, SHOW_FOR_MS);
    } catch (e) {
      setError(e?.response?.status === 429 ? "Too many PIN attempts. Try again in 15 minutes." : e?.response?.status === 403 ? "That PIN isn't right." : "Couldn't load your documents. Check the connection.");
      setPin("");
    } finally { setBusy(false); }
  };
  const press = (d) => {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next); setError("");
    if (next.length === 4) check(next);
  };

  const key = "h-16 rounded-2xl border border-border bg-background font-display text-[1.75rem] font-semibold tabular-nums hover:bg-accent active:bg-accent disabled:opacity-50";

  return (
    <>
      <Button variant="outline" size="lg" className="w-full justify-start" onClick={() => setOpen(true)}>
        <IdCard className="h-5 w-5" aria-hidden="true" /> My licence &amp; insurance
      </Button>
      {open && (
        <div className="fixed inset-0 z-[95] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="My licence and insurance">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-title-sm font-bold">{result ? result.driver_name || "Driver documents" : "My licence & insurance"}</h2>
            <Button variant="outline" onClick={close}><X className="h-4 w-4" aria-hidden="true" /> Close</Button>
          </div>
          {!result ? (
            <div className="mx-auto w-full max-w-sm flex-1 overflow-y-auto p-5">
              <p className="text-body-sm text-muted-foreground">Enter the PIN for {busName || "this bus"} to see the licence and insurance of the driver assigned to it.</p>
              <div className="mt-4 flex justify-center gap-3" aria-label={`${pin.length} of 4 digits entered`}>
                {[0, 1, 2, 3].map((i) => <span key={i} className={`h-4 w-4 rounded-full border-2 border-foreground ${i < pin.length ? "bg-foreground" : ""}`} />)}
              </div>
              {error && <p role="alert" className="mt-3 text-center text-body-sm text-danger">{error}</p>}
              <div className="mt-4 grid grid-cols-3 gap-3" role="group" aria-label="Keypad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" className={key} onClick={() => press(d)} disabled={busy}>{d}</button>)}
                <span />
                <button type="button" className={key} onClick={() => press("0")} disabled={busy}>0</button>
                <button type="button" className={`${key} grid place-items-center`} onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy || !pin} aria-label="Delete last digit"><Delete className="h-7 w-7" aria-hidden="true" /></button>
              </div>
              {busy && <p role="status" className="mt-3 text-center text-body-sm">Checking…</p>}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5">
              {!result.documents?.length ? (
                <p className="mx-auto max-w-md text-center text-body text-muted-foreground">
                  {result.driver_name ? `No licence or insurance has been added for ${result.driver_name} yet. Ask your administrator to add them in Drivers.` : "No driver is assigned to this bus. Ask your administrator."}
                </p>
              ) : (
                <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
                  {result.documents.map((d) => {
                    const exp = expiryNote(d.expiry_date);
                    const pdf = /\.pdf$/i.test(d.file_name || "");
                    return (
                      <section key={d.kind} className="overflow-hidden rounded-2xl border border-border bg-card" aria-label={LABEL[d.kind]}>
                        <div className="flex items-start justify-between gap-3 px-4 pt-4">
                          <div>
                            <h3 className="text-title-sm font-bold">{LABEL[d.kind]}</h3>
                            {d.document_number && <p className="text-body-sm">No. <span className="font-semibold tabular-nums">{d.document_number}</span></p>}
                          </div>
                          {exp && <span className={`rounded-full px-2.5 py-1 text-caption font-semibold ${exp.expired ? "bg-danger/15 text-danger" : "bg-secondary"}`}>{exp.text}</span>}
                        </div>
                        <div className="p-4">
                          {!d.url ? <p className="text-body-sm text-muted-foreground">No photo added yet.</p>
                            : pdf ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-semibold underline underline-offset-4"><FileText className="h-5 w-5" aria-hidden="true" /> Open {LABEL[d.kind].toLowerCase()} (PDF)</a>
                              : <img src={d.url} alt={`${LABEL[d.kind]} photo`} className="max-h-[60vh] w-full rounded-xl bg-muted object-contain" />}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
              <p className="mt-5 text-center text-caption text-muted-foreground">Closes by itself after a minute.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
