import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, CircleCheck, List, Loader2,
  ScanLine, Volume2, VolumeX, X,
} from "lucide-react";
import XrayBus from "@/components/inspection/XrayBus";
import { ZONE_BY_ID, flattenTemplate, walkOrder, zoneStatus } from "@/lib/busZones";

const SPEAK_KEY = "tt-xr-speak";

// Shrink a camera photo to a small JPEG data URL so it can travel inside the
// inspection submission (and wait in the offline queue if there's no signal).
function compressToDataUrl(file, maxDim = 1000, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo")); };
    img.src = url;
  });
}

const CRIT_STYLE = {
  Critical: "border-destructive/60 text-destructive",
  High: "border-amber-500/60 text-amber-600 dark:text-amber-400",
  Medium: "border-border text-muted-foreground",
  Low: "border-border text-muted-foreground",
};

// Guided X-ray inspection. Walks every item of a template around the bus
// (outside first, then the cabin), highlighting the part being checked.
// onSubmit({ results, odometer, fuel, passed }) must resolve when saved.
export default function XrayInspection({ template, vehicle, onSubmit, onSkip, onFinished, askReadings = true }) {
  const items = useMemo(() => walkOrder(flattenTemplate(template)), [template]);
  const [results, setResults] = useState({});
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("scan"); // scan → check → readings → done
  const [view, setView] = useState(() => ZONE_BY_ID[items[0]?.zone]?.view || "outside");
  const [listOpen, setListOpen] = useState(false);
  const [odometer, setOdometer] = useState(vehicle?.current_odometer ? String(vehicle.current_odometer) : "");
  const [fuel, setFuel] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [speak, setSpeak] = useState(() => { try { return localStorage.getItem(SPEAK_KEY) !== "off"; } catch { return true; } });
  const fileRef = useRef(null);

  const item = items[idx];
  const res = (item && results[item.key]) || {};
  const statuses = useMemo(() => zoneStatus(items, results), [items, results]);
  const doneCount = items.filter((it) => results[it.key]?.condition).length;
  const failedItems = items.filter((it) => results[it.key]?.condition === "FAILED");
  const allDone = items.length > 0 && doneCount === items.length;

  // Short "scanning" moment before the first item.
  useEffect(() => {
    if (phase !== "scan") return undefined;
    const t = setTimeout(() => setPhase("check"), 1400);
    return () => clearTimeout(t);
  }, [phase]);

  // Follow the item onto the right X-ray view.
  useEffect(() => {
    const v = ZONE_BY_ID[item?.zone]?.view;
    if (v) setView(v);
  }, [item?.zone]);

  // Read the current item aloud (the old pre-trip check did this too).
  useEffect(() => {
    if (phase !== "check" || !speak || !item || !window.speechSynthesis) return undefined;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`${ZONE_BY_ID[item.zone]?.label || ""}. ${item.item_name}.`);
    u.rate = 0.98;
    window.speechSynthesis.speak(u);
    return () => window.speechSynthesis.cancel();
  }, [phase, idx, speak, item]);

  const toggleSpeak = () => {
    setSpeak((s) => {
      const next = !s;
      try { localStorage.setItem(SPEAK_KEY, next ? "on" : "off"); } catch { /* ignore */ }
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  };

  const patch = (key, p) => setResults((prev) => ({ ...prev, [key]: { ...prev[key], ...p } }));

  const nextUnchecked = (from, res2 = results) => {
    for (let k = 1; k <= items.length; k++) {
      const j = (from + k) % items.length;
      if (!res2[items[j].key]?.condition) return j;
    }
    return -1;
  };

  const goNext = (res2 = results) => {
    const j = nextUnchecked(idx, res2);
    if (j === -1) setPhase("readings");
    else setIdx(j);
  };

  const needsPhoto = item?.requires_photo && !res.photo;

  const markOk = () => {
    if (!item) return;
    const next = { ...results, [item.key]: { ...res, condition: "GOOD" } };
    setResults(next);
    if (item.requires_photo && !res.photo) return; // wait for the photo
    setTimeout(() => goNext(next), 220);
  };

  const markProblem = () => item && patch(item.key, { condition: "FAILED" });

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !item) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressToDataUrl(file);
      const next = { ...results, [item.key]: { ...res, photo: dataUrl } };
      setResults(next);
      if (res.condition === "GOOD") setTimeout(() => goNext(next), 300);
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const jumpToZone = (zoneId) => {
    const inZone = items.map((it, i) => ({ it, i })).filter((x) => x.it.zone === zoneId);
    if (!inZone.length) return;
    const pending = inZone.find((x) => !results[x.it.key]?.condition);
    setIdx((pending || inZone[0]).i);
    if (phase !== "check") setPhase("check");
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    const out = items.map((it) => {
      const r = results[it.key] || {};
      const photo = r.photo || "";
      return {
        section_name: it.section_name, item_name: it.item_name, zone: it.zone, critical: it.critical,
        condition: r.condition || "GOOD", notes: (r.notes || "").slice(0, 1000),
        photo_data: photo ? photo.split(",")[1] : undefined,
        photo_mime: photo ? "image/jpeg" : undefined,
      };
    });
    try {
      await onSubmit({
        results: out,
        odometer: odometer ? Number(odometer) : undefined,
        fuel: Number(fuel),
        passed: failedItems.length === 0,
      });
      setPhase("done");
    } catch (e) {
      setError(e?.message || "Couldn't save the inspection. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        This inspection has no items yet. Ask your administrator to add some.
        {onSkip && <div className="mt-4"><Button variant="outline" onClick={onSkip}>Close</Button></div>}
      </div>
    );
  }

  const zone = ZONE_BY_ID[item?.zone];
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
          <ScanLine className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold leading-tight truncate">{template.name}</h2>
          <p className="text-sm text-muted-foreground">
            {phase === "done" ? "Finished" : `${doneCount} of ${items.length} checked`}
            {vehicle?.name ? ` · ${vehicle.name}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" onClick={toggleSpeak} aria-label={speak ? "Stop reading items aloud" : "Read items aloud"} aria-pressed={speak}>
          {speak ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </Button>
        <Button variant="outline" className="min-h-[44px]" onClick={() => setListOpen(true)}>
          <List className="w-4 h-4" /> <span className="hidden sm:inline">All items</span>
        </Button>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Inspection progress">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
        {/* X-ray */}
        <div className="space-y-2">
          <div className="relative">
            <XrayBus
              view={view}
              statuses={statuses}
              activeZone={phase === "check" ? item?.zone : null}
              onZoneClick={phase === "done" ? undefined : jumpToZone}
              scanning={phase === "scan" || phase === "check"}
            />
            <div className="absolute top-2 left-2 flex rounded-lg bg-black/45 p-0.5 backdrop-blur" role="tablist" aria-label="X-ray view">
              {[["outside", "Outside"], ["inside", "Inside"]].map(([v, l]) => (
                <button
                  key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                  className={`px-3 min-h-[36px] rounded-md text-xs font-semibold transition-colors ${view === v ? "bg-cyan-300 text-slate-900" : "text-cyan-100 hover:text-white"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {phase === "scan" && (
              <div className="absolute inset-0 grid place-items-center">
                <span className="px-3 py-1.5 rounded-full bg-black/55 text-cyan-100 text-sm font-semibold tracking-wide backdrop-blur">Scanning {vehicle?.name || "bus"}…</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-cyan-400" /> To check (number = items)</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-500" /> OK</span>
            <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Problem</span>
            <span>Tap a part to jump to it.</span>
          </div>
        </div>

        {/* current step */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          {phase === "scan" && (
            <div className="py-10 text-center text-muted-foreground flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              Getting your checklist ready…
            </div>
          )}

          {phase === "check" && item && (
            <>
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">{zone?.label || "Whole bus"}</p>
                <h3 className="text-xl font-bold leading-snug">{item.item_name}</h3>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${CRIT_STYLE[item.critical] || CRIT_STYLE.Medium}`}>{item.critical}</span>
                  {item.section_name && <span className="text-xs text-muted-foreground">{item.section_name}</span>}
                  {item.requires_photo && <span className="text-xs flex items-center gap-1 text-muted-foreground"><Camera className="w-3.5 h-3.5" /> Photo needed</span>}
                </div>
                {item.instructions && <p className="text-sm text-muted-foreground pt-1">{item.instructions}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={markOk}
                  aria-pressed={res.condition === "GOOD"}
                  className={`min-h-[64px] text-base font-semibold ${res.condition === "GOOD" ? "bg-green-600 hover:bg-green-600 text-white" : "bg-green-600/15 text-green-700 dark:text-green-300 hover:bg-green-600/25 border border-green-600/40"}`}
                >
                  <Check className="w-5 h-5" /> OK
                </Button>
                <Button
                  onClick={markProblem}
                  aria-pressed={res.condition === "FAILED"}
                  className={`min-h-[64px] text-base font-semibold ${res.condition === "FAILED" ? "bg-rose-600 hover:bg-rose-600 text-white" : "bg-rose-600/15 text-rose-700 dark:text-rose-300 hover:bg-rose-600/25 border border-rose-600/40"}`}
                >
                  <AlertTriangle className="w-5 h-5" /> Problem
                </Button>
              </div>

              {(res.condition === "FAILED" || item.requires_photo) && (
                <div className="space-y-3">
                  {res.condition === "FAILED" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="xr-note">What's wrong?</Label>
                      <Textarea id="xr-note" rows={3} value={res.notes || ""} onChange={(e) => patch(item.key, { notes: e.target.value })} placeholder="e.g. Front left tyre looks low" />
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />
                  {res.photo ? (
                    <div className="flex items-center gap-3">
                      <img src={res.photo} alt="Photo for this item" className="w-20 h-20 rounded-lg object-cover border border-border" />
                      <div className="flex flex-col gap-2">
                        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={photoBusy}>Retake</Button>
                        <Button variant="ghost" size="sm" onClick={() => patch(item.key, { photo: "" })}><X className="w-4 h-4" /> Remove</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant={needsPhoto ? "default" : "outline"} className="w-full min-h-[48px]" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                      {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      {item.requires_photo ? "Take the required photo" : "Add a photo (optional)"}
                    </Button>
                  )}
                  {res.condition === "FAILED" && (
                    <Button className="w-full min-h-[48px]" onClick={() => goNext()} disabled={needsPhoto}>
                      Save and next <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="min-h-[44px]">
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
                <span className="text-xs text-muted-foreground">Step {idx + 1} of {items.length}</span>
                {allDone ? (
                  <Button onClick={() => setPhase("readings")} className="min-h-[44px]">Finish <ChevronRight className="w-4 h-4" /></Button>
                ) : (
                  <Button variant="ghost" onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))} disabled={idx === items.length - 1} className="min-h-[44px]">
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {onSkip && (
                <Button variant="link" className="w-full text-muted-foreground" onClick={onSkip}>Skip for now</Button>
              )}
            </>
          )}

          {phase === "readings" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold">Almost done</h3>
                <p className="text-sm text-muted-foreground">
                  {failedItems.length === 0 ? "Everything was OK." : `${failedItems.length} problem${failedItems.length > 1 ? "s" : ""} will be sent to the mechanics.`}
                </p>
              </div>
              {failedItems.length > 0 && (
                <ul className="space-y-1.5">
                  {failedItems.map((it) => (
                    <li key={it.key} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <button className="text-left hover:underline" onClick={() => { setIdx(items.indexOf(it)); setPhase("check"); }}>
                        {it.item_name}{results[it.key]?.notes ? ` — ${results[it.key].notes}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {askReadings && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="xr-odo">Odometer (km)</Label>
                    <Input id="xr-odo" type="number" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="xr-fuel">Fuel: {fuel}%</Label>
                    <input id="xr-fuel" type="range" min="0" max="100" value={fuel} onChange={(e) => setFuel(e.target.value)} className="w-full mt-2 accent-[hsl(var(--primary))]" />
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" className="min-h-[48px]" onClick={() => setPhase("check")}><ChevronLeft className="w-4 h-4" /> Back</Button>
                <Button className="flex-1 min-h-[48px] text-base" onClick={submit} disabled={submitting}>
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Submit inspection"}
                </Button>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="py-6 text-center space-y-3">
              {failedItems.length === 0 ? (
                <CircleCheck className="w-14 h-14 mx-auto text-green-500" />
              ) : (
                <AlertTriangle className="w-14 h-14 mx-auto text-rose-500" />
              )}
              <div>
                <h3 className="text-xl font-bold">{failedItems.length === 0 ? "All clear" : "Problems reported"}</h3>
                <p className="text-sm text-muted-foreground">
                  {failedItems.length === 0 ? "You're good to go. Have a safe drive." : "The mechanics have been told. Drive with care, and follow your supervisor's advice."}
                </p>
              </div>
              <Button className="min-h-[48px] px-8" onClick={onFinished}>Continue</Button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto max-w-3xl mx-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>All items · {doneCount}/{items.length}</SheetTitle></SheetHeader>
          <div className="py-3 space-y-4">
            {Object.entries(items.reduce((acc, it, i) => { (acc[it.zone] ||= []).push({ it, i }); return acc; }, {})).map(([z, list]) => (
              <div key={z}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{ZONE_BY_ID[z]?.label || "Whole bus"}</p>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {list.map(({ it, i }) => {
                    const c = results[it.key]?.condition;
                    return (
                      <li key={it.key}>
                        <button
                          className="w-full flex items-center gap-3 px-3 min-h-[48px] text-left text-sm hover:bg-muted/50"
                          onClick={() => { setIdx(i); setPhase("check"); setListOpen(false); }}
                        >
                          {c === "GOOD" ? <Check className="w-4 h-4 text-green-500 shrink-0" aria-label="OK" />
                            : c === "FAILED" ? <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" aria-label="Problem" />
                            : <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/50 shrink-0" aria-label="Not checked" />}
                          <span className="flex-1">{it.item_name}</span>
                          {i === idx && phase === "check" && <span className="text-xs text-primary font-semibold">Now</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
