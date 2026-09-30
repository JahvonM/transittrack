import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCheck, ChevronRight, Check, ScanLine, Send } from "lucide-react";
import XrayInspection from "@/components/inspection/XrayInspection";
import { enqueueJob, isOfflineError } from "@/lib/offlineJobs";
import { TRIGGER_LABEL, statusFor, triggerOf } from "@/lib/driverInspections";
import { flattenTemplate } from "@/lib/busZones";

const LOCAL_DONE_KEY = "tt_driver_insp_done";

// Inspections finished on this tablet, so they count as done straight away
// (before the next heartbeat, or while they wait offline to upload).
export function readLocalDone() {
  try { return JSON.parse(localStorage.getItem(LOCAL_DONE_KEY) || "{}"); } catch { return {}; }
}
export function markLocalDone(templateId) {
  const map = readLocalDone();
  map[templateId] = new Date().toISOString();
  try { localStorage.setItem(LOCAL_DONE_KEY, JSON.stringify(map)); } catch { /* storage full */ }
  return map;
}

// Runs one template on the X-ray screen and saves it through the driver
// session (or queues it on the tablet when there's no signal).
export function DriverInspectionRunner({ template, vehicle, invoke, trigger, onFinished, onSkip }) {
  const submit = async ({ results, odometer, fuel }) => {
    const payload = { template_id: template.id, trigger, results, odometer, fuel };
    try {
      await invoke("submit_template_inspection", payload);
    } catch (e) {
      const deviceId = localStorage.getItem("tt_driver_device_id");
      if (!isOfflineError(e) || !deviceId) throw new Error(e?.response?.data?.error || e?.message || "Couldn't save the inspection");
      const label = `${template.name} · ${vehicle?.name || "vehicle"}`;
      if (enqueueJob("driver_template_inspection", { ...payload, device_id: deviceId }, label)) return;
      // Tablet storage is full: keep the answers, drop the photos.
      const slim = { ...payload, device_id: deviceId, results: results.map(({ photo_data: _pd, photo_mime: _pm, ...r }) => r) };
      if (!enqueueJob("driver_template_inspection", slim, label)) throw new Error("No signal and the tablet is out of space. Try again when you have signal.");
    }
  };
  return (
    <XrayInspection
      key={template.id}
      template={template}
      vehicle={vehicle}
      onSubmit={submit}
      onSkip={onSkip}
      onFinished={onFinished}
    />
  );
}

const STATUS_CHIP = {
  sent: { label: "Sent to you", cls: "bg-primary text-primary-foreground" },
  due: { label: "Due today", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40" },
  done: { label: "Done today", cls: "bg-green-600/15 text-green-700 dark:text-green-300 border border-green-600/40" },
  available: { label: "", cls: "" },
};

// Home-screen nudge for inspections that are due now.
export function DueInspectionsBanner({ due = [], onStart, compact = false }) {
  if (!due.length) return null;
  return (
    <div className={`rounded-2xl border border-primary/40 bg-primary/10 flex items-center gap-3 ${compact ? "p-3" : "p-4 flex-wrap"}`}>
      <div className={`${compact ? "w-9 h-9" : "w-10 h-10"} rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0`}>
        <ScanLine className="w-5 h-5" />
      </div>
      <div className={compact ? "flex-1 min-w-0" : "flex-1 min-w-[180px]"}>
        <p className="font-semibold truncate">{due.length === 1 ? (compact ? "Inspection due" : `${due[0].name} is due`) : `${due.length} inspections are due`}</p>
        <p className="text-sm text-muted-foreground truncate">
          {due.some((t) => t.driver_required) ? "Please finish before you drive." : "Tap to start the walk-around."}
        </p>
      </div>
      <Button className="min-h-[44px]" onClick={() => onStart(due[0])}>Start <ChevronRight className="w-4 h-4" /></Button>
    </div>
  );
}

// Safety tab: every inspection this tablet can run, with when it shows up.
export function DriverInspectionList({ templates = [], recent = [], localDone = {}, onStart }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Inspections</h3>
      </div>
      {!templates.length ? (
        <p className="text-sm text-muted-foreground">No inspections have been sent to this tablet yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {templates.map((t) => {
            const st = statusFor(t, recent, localDone);
            const chip = STATUS_CHIP[st];
            const count = flattenTemplate(t).length;
            return (
              <li key={t.id}>
                <button className="w-full flex items-center gap-3 py-3 text-left min-h-[56px]" onClick={() => onStart(t)}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{TRIGGER_LABEL[triggerOf(t)]} · {count} item{count === 1 ? "" : "s"}</p>
                  </div>
                  {chip.label && (
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${chip.cls}`}>
                      {st === "done" && <Check className="w-3 h-3" />}{st === "sent" && <Send className="w-3 h-3" />}{chip.label}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Pops up when the office sends an inspection to the tablet while it's in use.
export function SentInspectionPrompt({ pending = [], onStart }) {
  const seen = useRef(null);
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    const key = (t) => `${t.id}@${t.driver_sent_at}`;
    if (seen.current === null) {
      // First load: anything already pending is shown by the banner instead.
      seen.current = new Set(pending.map(key));
      return;
    }
    const fresh = pending.find((t) => !seen.current.has(key(t)));
    if (fresh) {
      seen.current.add(key(fresh));
      setCurrent(fresh);
    }
  }, [pending]);
  if (!current) return null;
  const required = current.driver_required;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !required) setCurrent(null); }}>
      <DialogContent onInteractOutside={(e) => required && e.preventDefault()} onEscapeKeyDown={(e) => required && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5 text-primary" /> New inspection</DialogTitle>
          <DialogDescription>
            Your office sent you “{current.name}”. {required ? "Please do it before you carry on driving." : "You can do it now or later from the Safety tab."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          {!required && <Button variant="outline" onClick={() => setCurrent(null)}>Later</Button>}
          <Button onClick={() => { const t = current; setCurrent(null); onStart(t); }}>Start now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
