import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Printer, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { companyJoinUrl } from "@/lib/companyJoin";
import { parseStaffList } from "@/lib/signupDay";

// The hotel's join QR as an image. Scanning it opens the app's /join page
// with the hotel's code filled in (the same QR as Companies → Show QR).
export function useJoinQr(code, width = 560) {
  const [png, setPng] = useState("");
  useEffect(() => {
    if (!code) { setPng(""); return undefined; }
    let live = true;
    QRCode.toDataURL(companyJoinUrl(code), { width, margin: 2 }).then((v) => { if (live) setPng(v); }).catch(() => { if (live) setPng(""); });
    return () => { live = false; };
  }, [code, width]);
  return png;
}

export function JoinQrImage({ code, hotel, className = "h-64 w-64" }) {
  const png = useJoinQr(code);
  return (
    <div className="grid place-items-center rounded-2xl bg-white p-3">
      {png ? <img src={png} alt={`QR code to join ${hotel || "the hotel"}`} className={className} /> : <div className={`${className} animate-pulse rounded-lg bg-black/5`} />}
    </div>
  );
}

// A full-screen QR to stand on the table, so staff can start on their own
// phones while they wait for a helper.
export function TableQr({ code, hotel, onClose }) {
  const png = useJoinQr(code, 720);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const print = () => {
    const w = window.open("", "_blank", "width=640,height=860");
    if (!w || !png) return;
    const name = String(hotel || "Your hotel").replace(/[<>&"]/g, "");
    w.document.write(`<!doctype html><title>${name} sign-up QR</title><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">
      <h1 style="margin:0 0 8px;font-size:34px">${name} staff</h1><p style="margin:0 0 28px;font-size:20px">Scan with your phone camera to get your bus app.</p>
      <img src="${png}" width="460" height="460" alt="" /><p style="margin-top:18px;font-size:18px">Create your account, then a helper sets your pickup spot and gives you your card.</p>
      <p style="margin-top:28px;color:#555">McSween Transport</p><script>window.onload=()=>{window.print();}</script></body>`);
    w.document.close();
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Table QR code" className="fixed inset-0 z-[70] flex flex-col bg-white text-black">
      <div className="flex items-center justify-between gap-2 p-3">
        <Button variant="outline" className="border-black/15 bg-white text-black hover:bg-black/5" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /> Close</Button>
        <Button variant="outline" className="border-black/15 bg-white text-black hover:bg-black/5" onClick={print} disabled={!png}><Printer className="h-4 w-4" aria-hidden="true" /> Print</Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 pb-10 text-center">
        <p className="font-heading text-[clamp(1.75rem,5vw,3rem)] font-extrabold leading-tight tracking-tight">{hotel || "Hotel"} staff</p>
        <p className="max-w-xl text-[clamp(1.05rem,2.6vw,1.5rem)] text-black/70">Scan with your phone camera to get your bus app.</p>
        {png ? <img src={png} alt={`QR code to join ${hotel || "the hotel"}`} className="aspect-square w-[min(78vw,52dvh)]" /> : <div className="aspect-square w-[min(78vw,52dvh)] animate-pulse rounded-2xl bg-black/5" />}
        <p className="max-w-xl text-base text-black/60">Create your account, then a helper sets your pickup spot and gives you your card.</p>
      </div>
    </div>
  );
}

export function AddPersonDialog({ hotel, onAdd, onClose }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", employee_id: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true); setError("");
    try { await onAdd(form); } catch (err) { setError(err?.response?.data?.error || err.message || "Couldn't add them. Try again."); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add a person</DialogTitle>
            <DialogDescription>Add someone from {hotel || "the hotel"} who isn't on the list. Use the email they'll sign in with, so their account links up by itself.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="su-name">Name</Label><Input id="su-name" value={form.name} onChange={set("name")} autoComplete="off" maxLength={120} autoFocus required /></div>
          <div className="space-y-1.5"><Label htmlFor="su-email">Email</Label><Input id="su-email" type="email" inputMode="email" value={form.email} onChange={set("email")} autoComplete="off" maxLength={160} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="su-phone">Phone</Label><Input id="su-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="off" maxLength={40} /></div>
            <div className="space-y-1.5"><Label htmlFor="su-emp">Employee ID</Label><Input id="su-emp" value={form.employee_id} onChange={set("employee_id")} autoComplete="off" maxLength={40} /></div>
          </div>
          {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={!form.name.trim()} loading={busy}>Add person</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The hotel's staff list: paste it from a spreadsheet or choose a .csv file.
export function ImportListDialog({ hotel, onImport, onClose }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const rows = parseStaffList(text);
  const choose = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2_000_000) { setError("That file is too big. Save just the staff list as a .csv file."); return; }
    setText(await f.text()); setError(""); setResult(null);
  };
  const submit = async () => {
    if (!rows.length || busy) return;
    setBusy(true); setError("");
    try { setResult(await onImport(rows)); } catch (err) { setError(err?.response?.data?.error || err.message || "Couldn't add the list. Try again."); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import {hotel ? `${hotel}'s` : "the hotel's"} staff list</DialogTitle>
          <DialogDescription>Copy the rows from a spreadsheet and paste them here, or choose a .csv file. Columns for name, email, phone and employee ID are picked up by their headings.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3" role="status">
            <p className="text-title-sm font-semibold">Added {result.added} {result.added === 1 ? "person" : "people"}.</p>
            {result.skipped?.length > 0 && (
              <div>
                <p className="text-body-sm text-muted-foreground">Skipped {result.skipped.length}:</p>
                <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-body-sm">
                  {result.skipped.map((s) => <li key={s.row}>Row {s.row}{s.name ? ` (${s.name})` : ""}: {s.reason.toLowerCase()}</li>)}
                </ul>
              </div>
            )}
            <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={8} aria-label="Staff list"
              placeholder={"Name, Email, Phone, Employee ID\nAna Joseph, ana@example.com, 473 555 0101, H-104"} className="font-mono text-body-sm" />
            <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={choose} aria-label="Choose a .csv file" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => file.current?.click()}><Upload className="h-4 w-4" aria-hidden="true" /> Choose a .csv file</Button>
              <span className="text-body-sm text-muted-foreground" role="status">{text.trim() ? `${rows.length} ${rows.length === 1 ? "person" : "people"} found` : ""}</span>
            </div>
            {rows.length > 0 && <p className="text-body-sm text-muted-foreground">First: {rows.slice(0, 3).map((r) => r.name || r.email).join(", ")}{rows.length > 3 ? "…" : ""}</p>}
            {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={!rows.length} loading={busy}>Add {rows.length || ""} to the list</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
