import "./jobSigning.css";
import Logo from "@/components/Logo";
import NameSign from "@/components/driver/NameSign";
import SigningJobControls from "./SigningJobControls";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CloudOff, Plane, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SignaturePad from "@/components/SignaturePad";
import KioskConnectionBadge from "@/components/kiosk/KioskConnectionBadge";
import JobTypeIcon from "@/components/jobs/JobTypeIcon";
import { deviceRequest } from "@/lib/deviceAuth";
import { blobToBase64 } from "@/lib/chatMedia";
import { currentPosition } from "@/lib/driverJobs";
import { jobTypeLabel, waitingSignature } from "@/lib/jobs";
import { JOBS_EVENT, completeJob, enqueueJob, isOfflineError, pendingJobs } from "@/lib/offlineJobs";
import { isPermanentRejection } from "@/lib/savedWork";
import { createPollBudget } from "@/lib/tabletPolling";
import { errorData } from "@/lib/requestError";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";

const KIND = "kiosk_job_sign";
// Quick while a job is under way (the guest is waiting to sign), slower when
// the bus has nothing on.
const ACTIVE_MS = 10000, IDLE_MS = 30000, THANKS_MS = 8000;
const key = (id, mode) => `${id}:${mode}`; // as in waitingSignature
const time = (d = new Date()) => d.toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const savedHere = () => {
  try { return new Set(pendingJobs().filter((j) => j.kind === KIND && !j.state).map((j) => key(j.payload.trip_id, j.payload.mode))); }
  catch { return new Set(); }
};

function SignScreen({ job, mode, onSign }) {
  const [name, setName] = useState(job.passenger_name || "");
  const [guests, setGuests] = useState(job.guests != null ? String(job.guests) : "");
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pad = useRef(null);
  const pickup = mode === "pickup";

  const confirm = async () => {
    setSaving(true);
    setError("");
    try {
      const file = await pad.current.toFile();
      await onSign({ name: name.trim(), guests: guests === "" ? null : Number(guests), file });
    } catch (e) {
      setError(errorData(e).error || "That didn't save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="tt-guest-sign mx-auto w-full max-w-3xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">{pickup ? "Pickup" : "Drop-off"}</p>
        <h1 className="mt-1 font-heading text-3xl font-bold sm:text-5xl">{pickup ? "Welcome aboard" : "Thank you for travelling with us"}</h1>
        <p className="mt-2 text-lg text-muted-foreground">Please sign to confirm your {pickup ? "pickup" : "drop-off"}.</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><JobTypeIcon trip={job} className="h-4 w-4" /> {jobTypeLabel(job)}</p>
        <p className="mt-1 text-xl font-bold sm:text-2xl">{job.pickup_name} <span className="text-muted-foreground">→</span> {job.dropoff_name}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-base text-muted-foreground">
          {job.flight_number && <span className="inline-flex items-center gap-1.5"><Plane className="h-4 w-4" aria-hidden="true" /> Flight {job.flight_number}</span>}
          {job.guests ? <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" /> {job.guests} guest{job.guests === 1 ? "" : "s"}</span> : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1.5">
          <Label htmlFor="sign-name" className="text-base">Your name</Label>
          <Input id="sign-name" value={name} onChange={(e) => setName(e.target.value)} className="h-14 text-lg" autoComplete="off" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sign-guests" className="text-base">Number of guests</Label>
          <Input id="sign-guests" type="number" inputMode="numeric" min={0} max={500} value={guests} onChange={(e) => setGuests(e.target.value)} className="h-14 text-lg" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-base">Signature</Label>
        <SignaturePad ref={pad} onChange={setHasInk} canvasClassName="tt-guest-sign-canvas h-56 sm:h-64" />
      </div>
      {error && <p role="alert" className="text-center text-base font-semibold text-danger">{error}</p>}
      <Button className="h-14 w-full text-lg" onClick={confirm} disabled={saving || !hasInk || !name.trim()}>
        {saving ? "Saving…" : "Confirm"}
      </Button>
    </div>
  );
}

// A guest-facing tablet on a bus, only for signing for jobs. It shows the
// signature screen by itself when the driver starts a job (pickup) or
// arrives (drop-off), and a welcome screen the rest of the time. A signature
// given with no signal is kept on the tablet and sent later.
export default function JobSigningKiosk({ device, deviceId, online, onBusChanged }) {
  const [jobs, setJobs] = useState([]);
  const [nameSign, setNameSign] = useState(null);
  const [requestedJob,setRequestedJob]=useState(null);
  const [signed, setSigned] = useState(() => savedHere());
  const [thanks, setThanks] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const budget = useRef(createPollBudget({ baseMs: 15000 }));
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!deviceId || !budget.current.allowed()) return;
    try {
      const res = await base44.functions.invoke("jobSigning", deviceRequest(deviceId, { action: "state" }));
      budget.current.succeeded();
      if (Array.isArray(res.data?.jobs)) setJobs(res.data.jobs);
      // Moved to another bus (in Admin, or on another screen): follow it.
      const bus = res.data?.bus;
      if (bus?.id && device?.vehicle_id && bus.id !== device.vehicle_id) onBusChanged?.(bus);
    } catch (e) {
      budget.current.failed(e);
    }
  }, [deviceId, device?.vehicle_id, onBusChanged]);

  const busy = jobs.some((j) => j.status === "on_the_way" || j.status === "arrived");
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      await load();
      if (!stopped) timer.current = setTimeout(tick, busy ? ACTIVE_MS : IDLE_MS);
    };
    timer.current = setTimeout(tick, 0);
    return () => { stopped = true; clearTimeout(timer.current); };
  }, [load, busy]);
  useEffect(() => {
    const update = () => setSigned(savedHere());
    window.addEventListener(JOBS_EVENT, update);
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => { window.removeEventListener(JOBS_EVENT, update); clearInterval(clock); };
  }, []);
  useEffect(() => {
    if (!thanks) return undefined;
    const t = setTimeout(() => setThanks(null), THANKS_MS);
    return () => clearTimeout(t);
  }, [thanks]);

  const waiting = useMemo(() => {const chosen=jobs.find(j=>j.id===requestedJob);return (chosen?waitingSignature([chosen],signed):null)||waitingSignature(jobs,signed);}, [jobs, signed, requestedJob]);

  const sign = async ({ name, guests, file }) => {
    const { job, mode } = waiting;
    const where = await currentPosition(null);
    const payload = {
      action: "sign", trip_id: job.id, mode, signed_by: name, guests, data_base64: await blobToBase64(file), mime_type: "image/png", ...(where || {}),
      device_id: deviceId, occurred_at: new Date().toISOString(), client_request_id: crypto.randomUUID(),
      expected_device_id: deviceId, expected_company_id: device?.company_id, expected_vehicle_id: device?.vehicle_id,
    };
    let saved = false;
    try { saved = enqueueJob(KIND, payload, `${mode === "pickup" ? "Pickup" : "Drop-off"} signature`); } catch { saved = false; }
    const done = (queued) => {
      setSigned((prev) => new Set([...prev, key(job.id, mode)]));
      setThanks({ name, mode, queued });
      setRequestedJob(null);
    };
    try {
      const { expected_device_id: _a, expected_company_id: _b, expected_vehicle_id: _c, ...live } = payload;
      const res = await base44.functions.invoke("jobSigning", deviceRequest(deviceId, live));
      if (saved) try { completeJob(payload.client_request_id); } catch { /* the sync drops it when the server answers */ }
      if (res.data?.trip) setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...res.data.trip } : j)));
      done(false);
    } catch (e) {
      if (saved && isOfflineError(e) && !isPermanentRejection(e)) { done(true); return; }
      if (saved) try { completeJob(payload.client_request_id); } catch { /* as above */ }
      // Signed already (on the driver's tablet), or dispatch took the job off
      // this bus: nothing more to sign here.
      if (["ALREADY_SIGNED", "JOB_GONE"].includes(errorData(e).code)) {
        setSigned((prev) => new Set([...prev, key(job.id, mode)]));
        load();
        return;
      }
      throw e;
    }
  };

  return (
    <div className="tt-job-signing flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center gap-3 px-5 py-3 sm:px-8">
        <Logo className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{device?.company_name || "McSween Transport"}</p>
          {device?.vehicle_name && <p className="truncate text-sm text-muted-foreground">{device.vehicle_name}</p>}
        </div>
        <span className="font-display text-lg font-semibold tabular-nums">{time(now)}</span>
        <SigningJobControls deviceId={deviceId} busName={device?.vehicle_name} savedCount={savedHere().size}
          onBusChanged={(bus) => { setJobs([]); setRequestedJob(null); onBusChanged?.(bus); }} onShowNameSign={job=>setNameSign({name:job.passenger_name||job.client_name||"Welcome",subtitle:job.flight_number?"Flight "+job.flight_number:"Welcome to Grenada"})} onShowSignature={trip=>{setThanks(null);setRequestedJob(trip.id);setJobs(prev=>[trip,...prev.filter(j=>j.id!==trip.id)]);}}/>
        <KioskConnectionBadge online={online} />
      </header>
      {nameSign && <NameSign sign={nameSign} company={{name:device?.company_name||"McSween Transport",logo_url:device?.company_logo_url}} onClose={()=>setNameSign(null)} />}
      <main className="flex flex-1 items-center justify-center p-5 sm:p-8">
        {thanks ? (
          <div role="status" className="max-w-xl space-y-4 text-center animate-in fade-in zoom-in-95 duration-300">
            <CheckCircle2 className="mx-auto h-20 w-20 text-success" aria-hidden="true" />
            <p className="font-heading text-3xl font-bold sm:text-5xl">Thank you{thanks.name ? `, ${thanks.name}` : ""}!</p>
            <p className="text-xl text-muted-foreground">Your {thanks.mode === "pickup" ? "pickup" : "drop-off"} is confirmed. {thanks.mode === "pickup" ? "Enjoy the ride." : "Have a wonderful day."}</p>
            {thanks.queued && <p className="inline-flex items-center gap-2 text-base font-semibold text-warning"><CloudOff className="h-5 w-5" aria-hidden="true" /> Saved on this tablet; it sends when the signal is back.</p>}
          </div>
        ) : waiting ? (
          <SignScreen key={key(waiting.job.id, waiting.mode)} job={waiting.job} mode={waiting.mode} onSign={sign} />
        ) : (
          <div className="max-w-xl space-y-3 text-center">
            <p className="font-heading text-4xl font-bold sm:text-6xl">Welcome aboard</p>
            {device?.vehicle_name && <p className="text-2xl text-muted-foreground">{device.vehicle_name}</p>}
            <p className="text-lg text-muted-foreground">You'll be asked to sign here at pickup and at drop-off.</p>
          </div>
        )}
      </main>
    </div>
  );
}
