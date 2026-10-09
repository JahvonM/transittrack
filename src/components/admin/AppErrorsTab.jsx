import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bug, Check, ChevronDown, Copy, Globe, Lightbulb, MousePointerClick, RefreshCw, RotateCcw, Server, Users, WifiOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState, Kpi, KpiRow, PageIntro, Panel, Segmented, StatusChip } from "@/components/admin/kit";
import BusLoader from "@/components/BusLoader";
import { describeDevice, errorHint } from "@/lib/appErrorText";

const AREAS = ["Admin", "Passenger app", "Driver tablet", "Boarding tablet", "Driver phone app", "Company manager", "Mechanic"];
const RANGES = { day: 24 * 3600e3, week: 7 * 24 * 3600e3, month: 30 * 24 * 3600e3, all: Infinity };
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");
function ago(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

const STEP = { page: Globe, tap: MousePointerClick, server: Server, network: WifiOff, error: AlertTriangle };
const STEP_LABEL = { page: "Opened", tap: "Tapped", server: "Server", network: "Connection", error: "Problem" };

function groupErrors(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = (r.message || "Unknown error").trim();
    if (!groups.has(key)) groups.set(key, { key, message: key, rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.values()].map((g) => {
    const sorted = g.rows.sort((a, b) => Date.parse(b.created_date) - Date.parse(a.created_date));
    const open = sorted.filter((r) => r.status !== "resolved");
    const fixed = sorted.filter((r) => r.status === "resolved");
    return {
      ...g, rows: sorted, latest: sorted[0], first: sorted[sorted.length - 1],
      people: new Set(sorted.map((r) => r.user_email || r.device_id || "anonymous")).size,
      areas: [...new Set(sorted.map((r) => r.area).filter(Boolean))],
      state: !open.length ? "fixed" : fixed.length ? "back" : "open",
      openCount: open.length,
    };
  }).sort((a, b) => Date.parse(b.latest.created_date) - Date.parse(a.latest.created_date));
}

function whoOf(r, tablets) {
  if (r.device_id && tablets[r.device_id]) return `${tablets[r.device_id]} (tablet)`;
  if (r.user_email) return `${r.user_email}${r.user_role ? ` · ${r.user_role}` : ""}`;
  if (r.device_id) return "A tablet that isn't paired any more";
  return "Someone not signed in";
}

export function reportText(group, r, tablets) {
  const steps = (r.breadcrumbs || []).map((b) => `  ${clock(b.t)}  ${STEP_LABEL[b.type] || b.type}: ${b.text}`).join("\n") || "  (not recorded)";
  return [
    `TransitTrack app error`,
    `Message: ${r.message}`,
    `Happened: ${group.rows.length} time(s), ${group.people} ${group.people === 1 ? "person/device" : "people/devices"}, first ${when(group.first.created_date)}, last ${when(group.latest.created_date)}`,
    `This one: ${when(r.created_date)}`,
    `Where: ${r.area || "unknown part"} · page ${r.url || "unknown"}`,
    `Who: ${whoOf(r, tablets)}`,
    `Device: ${describeDevice(r.user_agent)} · screen ${r.context?.screen || "?"} · ${r.context?.online === false ? "offline" : "online"}${r.context?.installed ? " · installed app" : ""}`,
    `App release: ${r.context?.version || "unknown"}`,
    `Kind: ${r.source || "unknown"}`,
    ``,
    `What happened before:`,
    steps,
    ``,
    `Technical details:`,
    r.stack || "(none)",
    ``,
    `Browser: ${r.user_agent || "unknown"}`,
  ].join("\n");
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-body-sm">{children}</dd>
    </div>
  );
}

function ErrorDetail({ group, tablets, onChanged }) {
  const { toast } = useToast();
  const [pick, setPick] = useState(group.latest.id);
  const [showStack, setShowStack] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = group.rows.find((x) => x.id === pick) || group.latest;
  const steps = r.breadcrumbs || [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText(group, r, tablets));
      toast({ title: "Copied", description: "Paste it into a message to Claude." });
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser blocked copying. Select the technical details and copy them by hand.", variant: "destructive" });
    }
  };
  const setStatus = async (status) => {
    setBusy(true);
    try {
      const targets = group.rows.filter((x) => (status === "resolved" ? x.status !== "resolved" : x.status === "resolved"));
      for (const x of targets) await base44.entities.ClientError.update(x.id, { status });
      toast({ title: status === "resolved" ? "Marked fixed" : "Reopened", description: status === "resolved" ? "If it happens again it will show as “Came back”." : undefined });
      await onChanged();
    } catch (e) {
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title={<><Bug className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" /><span className="break-words">{group.message}</span></>}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={copy}><Copy className="h-4 w-4" /> Copy details</Button>
            {group.state === "fixed"
              ? <Button size="sm" variant="ghost" onClick={() => setStatus("new")} disabled={busy}><RotateCcw className="h-4 w-4" /> Reopen</Button>
              : <Button size="sm" onClick={() => setStatus("resolved")} disabled={busy}><Check className="h-4 w-4" /> Mark fixed</Button>}
          </>
        }
      >
        <p className="flex gap-2 rounded-xl bg-secondary px-3 py-2 text-body-sm">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{errorHint(group.message)}</span>
        </p>
        {group.state === "back" && (
          <p className="mt-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-body-sm">This was marked fixed, then happened again {group.openCount} {group.openCount === 1 ? "time" : "times"}.</p>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="How often">{group.rows.length} {group.rows.length === 1 ? "time" : "times"} · {group.people} {group.people === 1 ? "person or tablet" : "people or tablets"}</Fact>
          <Fact label="First and last">{when(group.first.created_date)} – {when(group.latest.created_date)}</Fact>
          <Fact label="Where">{r.area || "Unknown part"} · <span className="font-mono text-caption">{r.url || "?"}</span></Fact>
          <Fact label="Who">{whoOf(r, tablets)}</Fact>
          <Fact label="Device">{describeDevice(r.user_agent)}{r.context?.screen ? ` · ${r.context.screen}` : ""}{r.context?.installed ? " · installed app" : ""}</Fact>
          <Fact label="Connection and release">{r.context?.online === false ? "Offline" : r.context ? "Online" : "Not recorded"}{r.context?.version ? ` · ${r.context.version}` : ""}</Fact>
        </dl>

        {group.rows.length > 1 && (
          <label className="mt-4 flex flex-col gap-1 text-body-sm">
            <span className="text-caption font-semibold text-muted-foreground">Showing</span>
            <select value={r.id} onChange={(e) => setPick(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3" aria-label="Which time it happened">
              {group.rows.slice(0, 50).map((x, i) => (
                <option key={x.id} value={x.id}>{i === 0 ? "Latest: " : ""}{when(x.created_date)} · {x.user_email || (x.device_id ? "tablet" : "not signed in")}{x.status === "resolved" ? " · fixed" : ""}</option>
              ))}
            </select>
          </label>
        )}
      </Panel>

      <Panel title="What happened before" description="The last steps on that device, oldest first, ending with the error.">
        {steps.length ? (
          <ol className="relative space-y-0" aria-label="Steps before the error">
            {[...steps, { t: r.created_date, type: "error", text: r.message, final: true }].map((b, i, all) => {
              const Icon = STEP[b.type] || AlertTriangle;
              return (
                <li key={i} className="flex gap-3 pb-3 last:pb-0">
                  <span className="flex flex-col items-center">
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border", b.final ? "border-danger/40 bg-danger/12 text-danger" : b.type === "server" || b.type === "network" ? "border-warning/40 bg-warning/12 text-warning" : "border-border bg-secondary")}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    {i < all.length - 1 && <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="block text-caption text-muted-foreground">{clock(b.t)} · {b.final ? "Error" : STEP_LABEL[b.type] || b.type}</span>
                    <span className={cn("block break-words text-body-sm", b.final && "font-semibold")}>{b.text}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-body-sm text-muted-foreground">Not recorded for this one. Errors reported from now on include the steps before them.</p>
        )}
      </Panel>

      <Panel title="Technical details" description="For whoever fixes it.">
        <Button variant="ghost" size="sm" onClick={() => setShowStack((v) => !v)} aria-expanded={showStack}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", !showStack && "-rotate-90")} /> {showStack ? "Hide" : "Show"} error trace
        </Button>
        {showStack && (
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-secondary p-3 font-mono text-caption">{r.stack || "No trace was sent."}{"\n\n"}{r.user_agent || ""}</pre>
        )}
      </Panel>
    </div>
  );
}

/** Admin → App errors: every crash or error people hit in the app, and what led to it. */
export default function AppErrorsTab() {
  const [rows, setRows] = useState(null);
  const [tablets, setTablets] = useState({});
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState("open");
  const [range, setRange] = useState("week");
  const [area, setArea] = useState("");
  const [selected, setSelected] = useState("");

  const load = async () => {
    setFailed(false);
    try {
      const [errors, devices] = await Promise.all([
        base44.entities.ClientError.list("-created_date", 1000),
        base44.entities.KioskDevice.list("-created_date", 500).catch(() => []),
      ]);
      setRows(errors || []);
      setTablets(Object.fromEntries((devices || []).map((d) => [d.id, d.label || d.vehicle_name || "Tablet"])));
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => {
    load();
    // The admin page's own Refresh button reloads this list too.
    window.addEventListener("tt-admin-refresh", load);
    return () => window.removeEventListener("tt-admin-refresh", load);
  }, []);

  const inRange = useMemo(() => (rows || []).filter((r) => Date.now() - Date.parse(r.created_date) <= RANGES[range] && (!area || r.area === area)), [rows, range, area]);
  const groups = useMemo(() => groupErrors(inRange), [inRange]);
  const shown = groups.filter((g) => state === "all" || (state === "open" ? g.state !== "fixed" : g.state === "fixed"));
  const current = shown.find((g) => g.key === selected) || shown[0];

  if (failed) return <EmptyState icon={Bug} title="Couldn't load app errors" action={<Button onClick={load}><RefreshCw className="h-4 w-4" /> Try again</Button>}>Check the connection and try again.</EmptyState>;
  if (!rows) return <BusLoader className="py-12" />;

  const today = (rows || []).filter((r) => Date.now() - Date.parse(r.created_date) <= RANGES.day);
  const openGroups = groups.filter((g) => g.state !== "fixed");
  const people = new Set(inRange.map((r) => r.user_email || r.device_id || "anonymous")).size;

  return (
    <div>
      <PageIntro>Every crash or error people hit in the app: where, who, on what device, and the steps that led to it. Copy the details to send them on, and mark problems fixed.</PageIntro>

      <KpiRow>
        <Kpi icon={Bug} label="Errors today" value={today.length} tone={today.length ? "warning" : undefined} detail="Last 24 hours" />
        <Kpi icon={AlertTriangle} label="Open problems" value={openGroups.length} tone={openGroups.length ? "danger" : undefined} detail={range === "all" ? "All time" : "In the chosen period"} />
        <Kpi icon={Users} label="People or tablets affected" value={people} detail="In the chosen period" />
        <Kpi icon={Check} label="Marked fixed" value={groups.filter((g) => g.state === "fixed").length} detail="In the chosen period" />
      </KpiRow>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented size="sm" label="Show" value={state} onChange={setState} options={[{ value: "open", label: "Open" }, { value: "fixed", label: "Fixed" }, { value: "all", label: "All" }]} />
        <Segmented size="sm" label="Period" value={range} onChange={setRange} options={[{ value: "day", label: "24 h" }, { value: "week", label: "7 days" }, { value: "month", label: "30 days" }, { value: "all", label: "All" }]} />
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Part of the app" className="h-9 rounded-lg border border-input bg-background px-3 text-body-sm">
          <option value="">Every part of the app</option>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Check} title={state === "fixed" ? "Nothing marked fixed yet" : "No errors"}>
          {state === "open" ? "Nobody has hit an error in this period. New ones appear here as they happen." : "Try a longer period."}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <Panel title="Problems" description="The same error from several people is one problem." bodyClassName="px-2 pb-2">
            <ul aria-label="Problems">
              {shown.map((g) => (
                <li key={g.key}>
                  <button type="button" onClick={() => setSelected(g.key)} aria-current={current?.key === g.key ? "true" : undefined}
                    className={cn("flex w-full flex-col gap-1 rounded-xl px-3 py-3 text-left hover:bg-accent/60", current?.key === g.key && "bg-accent")}>
                    <span className="line-clamp-2 break-words font-semibold">{g.message}</span>
                    <span className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                      {g.state === "fixed" ? <StatusChip tone="success">Fixed</StatusChip> : g.state === "back" ? <StatusChip tone="warning">Came back</StatusChip> : <StatusChip tone="danger">Open</StatusChip>}
                      <span>{g.rows.length}× · {g.people} {g.people === 1 ? "person" : "people"}</span>
                      <span>· {ago(g.latest.created_date)}</span>
                      {g.areas.length > 0 && <span>· {g.areas.join(", ")}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {current && <ErrorDetail key={current.key} group={current} tablets={tablets} onChanged={load} />}
        </div>
      )}
    </div>
  );
}
