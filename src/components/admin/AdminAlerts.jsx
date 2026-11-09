import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, AlertTriangle, Bell, BusFront, CalendarPlus, CheckCircle2, Globe, Package, Siren, Wrench, X, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { serverNow } from "@/lib/serverClock";
import {
  ALERT_KINDS, MAX_POPUPS, WATCHED, addAlert, alertFromChange, lateJobs, loadAlertState, saveAlertState, unreadCount,
} from "@/lib/adminAlerts";

// Admin -> the bell in the header and the notices that drop in under it:
// new jobs and ride requests, jobs started, completed, cancelled or not
// started on time, incidents, faults and lost items. Notices that need
// action stay until closed; the rest go after 8 seconds. Pop-ups can be
// turned off from the bell; the list keeps everything either way.
const ICONS = {
  request_new: Globe, job_created: CalendarPlus, job_started: BusFront, job_completed: CheckCircle2, job_cancelled: XCircle,
  job_late: AlarmClock, sos: Siren, incident: AlertTriangle, fault: Wrench, lost_item: Package,
};
const TONES = {
  info: "border-l-primary text-primary",
  success: "border-l-success text-success",
  warning: "border-l-warning text-warning",
  danger: "border-l-danger text-danger",
};
const POPUP_MS = 8000;

function ago(iso, now = Date.now()) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

function Popup({ alert, onOpen, onClose }) {
  const meta = ALERT_KINDS[alert.kind];
  const Icon = ICONS[alert.kind] || Bell;
  const [held, setHeld] = useState(false);
  // Goes after 8 seconds (paused while pointed at or focused), unless it needs action.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (meta.sticky || held) return undefined;
    const t = setTimeout(() => closeRef.current(), POPUP_MS);
    return () => clearTimeout(t);
  }, [meta.sticky, held]);
  return (
    <div
      role={meta.tone === "danger" ? "alert" : "status"}
      className={`tt-admin-popup pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-xl border border-l-4 border-border bg-card p-3 shadow-lg ${TONES[meta.tone]}`}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-foreground">
        <p className="font-semibold">{alert.title}</p>
        {alert.detail && <p className="truncate text-body-sm text-muted-foreground">{alert.detail}</p>}
      </div>
      <button type="button" onClick={onOpen} className="min-h-9 shrink-0 rounded-lg px-2.5 text-body-sm font-semibold text-foreground hover:bg-accent">Open</button>
      <button type="button" onClick={onClose} aria-label={`Close: ${alert.title}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function AdminAlerts({ user, onNavigate }) {
  const me = user?.email || "";
  const [state, setState] = useState(() => loadAlertState(me));
  const [popups, setPopups] = useState([]);
  const [open, setOpen] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => { saveAlertState(me, state); }, [me, state]);

  const add = useCallback((alert) => {
    if (!alert || stateRef.current.seen.includes(alert.key)) return;
    const next = addAlert(stateRef.current, alert);
    stateRef.current = next;
    setState(next);
    if (!ALERT_KINDS[alert.kind].quiet && !next.muted) setPopups((p) => [alert, ...p.filter((x) => x.key !== alert.key)].slice(0, MAX_POPUPS));
  }, []);

  // Jobs waiting to start, kept up to date from the job list's changes.
  const scheduled = useRef(new Map());
  useEffect(() => {
    let live = true;
    const check = () => { if (live) lateJobs([...scheduled.current.values()], serverNow()).forEach(add); };
    const unsubs = WATCHED.map((entity) => base44.entities[entity].subscribe((event) => {
      if (entity === "Trip") {
        const r = event?.data;
        if (event?.type === "delete" || !r || r.status !== "scheduled" || !r.job_type) scheduled.current.delete(event?.id || r?.id);
        else scheduled.current.set(r.id, r);
      }
      add(alertFromChange(entity, event, { now: serverNow(), me }));
    }));
    base44.entities.Trip.filter({ status: "scheduled" }, "scheduled_time", 200)
      .then((rows) => { for (const r of rows || []) if (r?.job_type) scheduled.current.set(r.id, r); check(); })
      .catch(() => {});
    const timer = setInterval(check, 30000);
    return () => { live = false; clearInterval(timer); unsubs.forEach((u) => u && u()); };
  }, [me, add]);

  const markRead = (keys) => setState((s) => ({ ...s, read: [...new Set([...keys, ...s.read])].slice(0, 400) }));
  const close = useCallback((key) => setPopups((p) => p.filter((x) => x.key !== key)), []);
  const go = (alert) => {
    markRead([alert.key]);
    close(alert.key);
    setOpen(false);
    onNavigate?.(ALERT_KINDS[alert.kind].section);
  };
  const unread = unreadCount(state);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="relative grid h-10 w-10 place-items-center rounded-lg hover:bg-accent" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unread > 0 && <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-caption font-bold tabular-nums text-danger-foreground" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="font-bold">Notifications</h2>
            <button type="button" className="text-body-sm font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={!unread} onClick={() => markRead(state.items.map((i) => i.key))}>Mark all read</button>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto py-1" aria-label="Notifications">
            {state.items.length === 0 && <li className="px-4 py-6 text-center text-body-sm text-muted-foreground">Nothing yet. New jobs, ride requests and problems show here as they happen.</li>}
            {state.items.map((a) => {
              const Icon = ICONS[a.kind] || Bell;
              const isNew = !state.read.includes(a.key);
              return (
                <li key={a.key}>
                  <button type="button" onClick={() => go(a)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONES[ALERT_KINDS[a.kind].tone].split(" ").pop()}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={`block ${isNew ? "font-semibold" : ""}`}>{a.title}{isNew && <span className="sr-only"> (new)</span>}</span>
                      {a.detail && <span className="block truncate text-body-sm text-muted-foreground">{a.detail}</span>}
                    </span>
                    <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{ago(a.at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <label className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-body-sm" htmlFor="tt-admin-popups">
            Pop-ups at the top of the page
            <Switch id="tt-admin-popups" checked={!state.muted} onCheckedChange={(on) => { setState((s) => ({ ...s, muted: !on })); if (!on) setPopups([]); }} />
          </label>
        </PopoverContent>
      </Popover>

      {popups.length > 0 && (
        <div role="region" aria-label="New notifications" className="tt-admin-popups pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 flex flex-col items-center gap-2 px-4">
          {popups.map((a) => <Popup key={a.key} alert={a} onOpen={() => go(a)} onClose={() => close(a.key)} />)}
        </div>
      )}
    </>
  );
}
