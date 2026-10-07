import React, { useRef, useState } from "react";
import { Camera, CircleCheck, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { shrinkPhoto } from "@/lib/driverPhone";

const TYPES = [
  { id: "breakdown", label: "Breakdown" },
  { id: "accident", label: "Accident or damage" },
  { id: "delay", label: "Delay" },
  { id: "other", label: "Something else" },
];
const MAX_PHOTOS = 3;

export default function ReportTab({ busName, onSend }) {
  const [type, setType] = useState("");
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const picker = useRef(null);

  const addPhotos = async (files) => {
    const room = MAX_PHOTOS - photos.length;
    const chosen = [...files].slice(0, room);
    if (!chosen.length) return;
    setPreparing(true); setError("");
    try {
      const ready = [];
      for (const file of chosen) ready.push(await shrinkPhoto(file));
      setPhotos((p) => [...p, ...ready].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError(e.message || "That photo couldn't be added.");
    } finally {
      setPreparing(false);
      if (picker.current) picker.current.value = "";
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!type) { setError("Choose what happened."); return; }
    if (!details.trim()) { setError("Say what happened."); return; }
    setSending(true); setError("");
    try {
      await onSend({ type, details: details.trim(), photos: photos.map(({ data_base64, mime_type }) => ({ data_base64, mime_type })) });
      setSent({ type, photos: photos.length });
      setType(""); setDetails(""); setPhotos([]);
    } catch (err) {
      setError(err.message || "Report not sent. Your words and photos are still here. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
        <CircleCheck className="h-12 w-12 text-success" aria-hidden="true" />
        <h1 className="text-title">Report sent to dispatch</h1>
        <p className="text-muted-foreground">{sent.photos ? `With ${sent.photos} photo${sent.photos === 1 ? "" : "s"}. ` : ""}Dispatch can see it now. If anyone is hurt or in danger, call emergency services first.</p>
        <button type="button" onClick={() => setSent(null)} className="min-h-[48px] rounded-xl border border-border px-4 font-semibold hover:bg-accent">Report something else</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <header>
        <h1 className="text-headline">Report a problem</h1>
        <p className="text-body-sm text-muted-foreground">{busName ? `For ${busName}. ` : ""}Goes straight to dispatch. Only report when the bus is stopped.</p>
      </header>

      <fieldset>
        <legend className="mb-2 font-semibold">What happened?</legend>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)}
              className={cn("min-h-[56px] rounded-xl border px-3 text-left font-semibold", type === t.id ? "border-primary bg-primary/12" : "border-border bg-card hover:bg-accent")}>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="report-details" className="mb-2 block font-semibold">Details</label>
        <textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={2000}
          placeholder="Where are you, and what do you need?"
          className="w-full rounded-xl border border-input bg-background px-3 py-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>

      <div>
        <p className="mb-2 font-semibold">Photos <span className="font-normal text-muted-foreground">(up to {MAX_PHOTOS}, only dispatch can see them)</span></p>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative h-24 w-24 overflow-hidden rounded-xl border border-border">
              <img src={p.preview} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button type="button" onClick={() => setPhotos((all) => all.filter((_, n) => n !== i))} aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-background/90">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-xl border border-dashed border-border text-center text-body-sm font-semibold hover:bg-accent">
              {preparing ? <Loader2 className="h-6 w-6 animate-spin" aria-label="Adding photo" /> : (
                <span className="flex flex-col items-center gap-1"><Camera className="h-6 w-6" aria-hidden="true" /> Add photo</span>
              )}
              <input ref={picker} type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={preparing}
                onChange={(e) => e.target.files?.length && addPhotos(e.target.files)} />
            </label>
          )}
        </div>
      </div>

      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      <button type="submit" disabled={sending || preparing}
        className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-primary text-title-sm font-bold text-primary-foreground disabled:opacity-60">
        {sending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />} {sending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
