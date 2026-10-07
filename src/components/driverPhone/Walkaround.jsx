import React, { useState } from "react";
import { ArrowLeft, Camera, Check, CircleCheck, Loader2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { shrinkPhoto } from "@/lib/driverPhone";

// Same list, same ids as the server (driverPhone WALKAROUND).
export const WALKAROUND_ITEMS = [
  { id: "tyres", label: "Tyres and wheels", hint: "Pressure looks right, no cuts or bulges" },
  { id: "lights", label: "Lights and indicators", hint: "Headlights, brake lights, indicators, hazards" },
  { id: "mirrors", label: "Mirrors", hint: "Clean, not cracked, set for you" },
  { id: "windscreen", label: "Windscreen and wipers", hint: "No new cracks, wipers and washer work" },
  { id: "body", label: "Bodywork", hint: "No new dents, scrapes or loose panels" },
  { id: "leaks", label: "No leaks under the bus", hint: "Oil, coolant or fuel on the ground" },
  { id: "doors", label: "Doors and emergency exits", hint: "Open and close properly, exits clear" },
  { id: "interior", label: "Seats, belts and floor", hint: "Secure, clean, nothing loose" },
  { id: "safety_kit", label: "First aid kit and fire extinguisher", hint: "On board and in date" },
];

export default function Walkaround({ busName, onSubmit, onBack }) {
  const [answers, setAnswers] = useState({});
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const set = (id, patch) => setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  const answered = WALKAROUND_ITEMS.filter((i) => answers[i.id]?.condition).length;
  const photoCount = Object.values(answers).filter((a) => a?.photo).length;

  const addPhoto = async (id, file) => {
    if (!file) return;
    setPreparing(id); setError("");
    try { set(id, { photo: await shrinkPhoto(file) }); }
    catch (e) { setError(e.message || "That photo couldn't be added."); }
    finally { setPreparing(""); }
  };

  const submit = async () => {
    const missing = WALKAROUND_ITEMS.find((i) => !answers[i.id]?.condition);
    if (missing) { setError(`Check "${missing.label}" first.`); return; }
    const vague = WALKAROUND_ITEMS.find((i) => answers[i.id].condition === "FAILED" && !answers[i.id].notes?.trim() && !answers[i.id].photo);
    if (vague) { setError(`Say what's wrong with "${vague.label}", or add a photo.`); return; }
    setSending(true); setError("");
    try {
      const res = await onSubmit(WALKAROUND_ITEMS.map((i) => ({
        id: i.id, condition: answers[i.id].condition, notes: answers[i.id].notes?.trim() || "",
        ...(answers[i.id].photo ? { photo_data: answers[i.id].photo.data_base64 } : {}),
      })));
      setSent(res?.inspection || { problems: 0 });
    } catch (e) {
      setError(e.message || "Not sent. Your answers are still here. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
        {sent.problems ? <TriangleAlert className="h-14 w-14 text-warning" aria-hidden="true" /> : <CircleCheck className="h-14 w-14 text-success" aria-hidden="true" />}
        <h1 className="text-headline">{sent.problems ? "Problems sent" : "All good"}</h1>
        <p className="text-muted-foreground">{sent.problems ? `${sent.problems} problem${sent.problems === 1 ? "" : "s"} sent to dispatch and the mechanic. If the bus isn't safe to drive, call dispatch before you set off.` : "Walk-around saved."}</p>
        <button type="button" onClick={onBack} className="mt-2 min-h-[52px] w-full rounded-xl bg-primary font-bold text-primary-foreground">Continue</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex min-h-[44px] items-center gap-2 self-start font-semibold text-muted-foreground">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Back
      </button>
      <header>
        <h1 className="text-headline">Walk-around check</h1>
        <p className="text-body-sm text-muted-foreground">{busName ? `${busName}. ` : ""}Walk around the bus and mark each one. {answered} of {WALKAROUND_ITEMS.length} done.</p>
      </header>
      <ol className="flex flex-col gap-3">
        {WALKAROUND_ITEMS.map((item) => {
          const a = answers[item.id] || {};
          return (
            <li key={item.id} className={cn("rounded-2xl border bg-card p-3", a.condition === "FAILED" ? "border-warning/60" : "border-border")}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.label}</p>
                  <p className="text-body-sm text-muted-foreground">{item.hint}</p>
                </div>
                <div className="flex shrink-0 gap-2" role="group" aria-label={item.label}>
                  <button type="button" aria-pressed={a.condition === "GOOD"} onClick={() => set(item.id, { condition: "GOOD" })} aria-label={`${item.label}: OK`}
                    className={cn("grid h-12 w-12 place-items-center rounded-xl border", a.condition === "GOOD" ? "border-success bg-success/15 text-success" : "border-border")}>
                    <Check className="h-6 w-6" aria-hidden="true" />
                  </button>
                  <button type="button" aria-pressed={a.condition === "FAILED"} onClick={() => set(item.id, { condition: "FAILED" })} aria-label={`${item.label}: problem`}
                    className={cn("grid h-12 w-12 place-items-center rounded-xl border", a.condition === "FAILED" ? "border-warning bg-warning/15 text-warning" : "border-border")}>
                    <TriangleAlert className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {a.condition === "FAILED" && (
                <div className="mt-3 flex items-start gap-2">
                  <label className="sr-only" htmlFor={`note-${item.id}`}>What's wrong with {item.label}</label>
                  <textarea id={`note-${item.id}`} rows={2} maxLength={1000} value={a.notes || ""} onChange={(e) => set(item.id, { notes: e.target.value })}
                    placeholder="What's wrong?" className="min-h-[52px] min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  {a.photo ? (
                    <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-xl border border-border">
                      <img src={a.photo.preview} alt={`Photo of ${item.label}`} className="h-full w-full object-cover" />
                      <button type="button" onClick={() => set(item.id, { photo: null })} aria-label={`Remove photo of ${item.label}`} className="absolute inset-0 grid place-items-center bg-black/40 text-white"><X className="h-5 w-5" aria-hidden="true" /></button>
                    </div>
                  ) : (
                    <label className={cn("grid h-[52px] w-[52px] shrink-0 cursor-pointer place-items-center rounded-xl border border-dashed border-border", photoCount >= 6 && "pointer-events-none opacity-50")}>
                      {preparing === item.id ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Adding photo" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
                      <span className="sr-only">Add a photo of {item.label}</span>
                      <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!preparing || photoCount >= 6}
                        onChange={(e) => { addPhoto(item.id, e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      <button type="button" onClick={submit} disabled={sending || !!preparing}
        className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-primary text-title-sm font-bold text-primary-foreground disabled:opacity-60">
        {sending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />} {sending ? "Sending…" : "Send check"}
      </button>
    </div>
  );
}
