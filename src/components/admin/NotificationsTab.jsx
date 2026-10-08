import React, { useEffect, useMemo, useState } from "react";
import { Bell, Lock, Mail, RefreshCw, Search, Send, Smartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { withRateLimitRetry } from "@/lib/scopedEntities";
import { errorData } from "@/lib/requestError";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState, Kpi, KpiRow, PageActions, PageIntro, Panel, Segmented, StatusChip } from "@/components/admin/kit";
import BusLoader from "@/components/BusLoader";

const call = async (body) => (await withRateLimitRetry(() => base44.functions.invoke("notificationSettings", body), { attempts: 3 })).data;

const AUDIENCE = { admin: "Admins", company: "Company managers", mechanic: "Mechanics", passenger: "Passengers", driver: "Drivers (phone app)" };
const STATUS = {
  sent: { tone: "success", label: "Sent" },
  partial: { tone: "warning", label: "Partly sent" },
  failed: { tone: "danger", label: "Failed" },
  held: { tone: "neutral", label: "Held back" },
  off: { tone: "neutral", label: "Switched off" },
};
const PAGE = 100;
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const channelIcon = (channel) => (channel === "email" ? Mail : Smartphone);
const channelWord = (channel) => (channel === "email" ? "Email" : "Phone alert");

// Who a kind of notification can reach, with the admin's choices applied.
function audienceOf(type, people) {
  const seen = new Set();
  const out = [];
  for (const a of type.audiences) {
    for (const p of people?.[a] || []) {
      if (seen.has(p.email)) continue;
      seen.add(p.email);
      out.push({ ...p, audience: a });
    }
  }
  return out;
}

function KindRow({ type, setting, reach, active, onSelect }) {
  const Icon = channelIcon(type.channel);
  const on = type.locked || setting.enabled;
  const left = setting.blocked_emails.filter((e) => reach.some((p) => p.email === e)).length;
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={active ? "true" : undefined}
        className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-accent/60", active && "bg-accent")}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary" aria-hidden="true"><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{type.label}</span>
          <span className="block text-body-sm text-muted-foreground">
            {channelWord(type.channel)} · {on ? `${reach.length - left} of ${reach.length} ${reach.length === 1 ? "person" : "people"}` : "nobody"}
          </span>
        </span>
        {type.locked ? <StatusChip tone="info"><Lock className="h-3 w-3" aria-hidden="true" /> Always on</StatusChip>
          : on ? <StatusChip tone="success">On</StatusChip> : <StatusChip tone="neutral">Off</StatusChip>}
      </button>
    </li>
  );
}

function RecentList({ rows, types, empty }) {
  const label = (key) => (key === "test" ? "Test" : types.find((t) => t.key === key)?.label || key);
  if (!rows.length) return <p className="py-4 text-body-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const Icon = channelIcon(r.channel);
        const s = STATUS[r.status] || STATUS.sent;
        const names = r.recipients.slice(0, 3).join(", ");
        const more = r.recipient_count - Math.min(3, r.recipients.length);
        return (
          <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex min-w-0 flex-1 items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label={channelWord(r.channel)} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{label(r.key)}{r.title ? ` · ${r.title}` : ""}</span>
                <span className="block break-words text-body-sm text-muted-foreground">
                  {r.recipient_count ? `To ${names}${more > 0 ? ` and ${more} more` : ""}` : "Nobody"}
                  {r.skipped ? ` · ${r.skipped} held back` : ""}
                  {r.failed ? ` · ${r.failed} failed` : ""}
                  {r.error ? ` · ${r.error}` : ""}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
              <span className="text-caption text-muted-foreground">{when(r.sent_at)}</span>
              <StatusChip tone={s.tone}>{s.label}</StatusChip>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function KindDetail({ type, setting, reach, recent, types, onSaved }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(setting.enabled);
  const [blocked, setBlocked] = useState(() => new Set(setting.blocked_emails));
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => [...new Set(reach.map((p) => p.audience))], [reach]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reach.filter((p) => (group === "all" || p.audience === group)
      && (!needle || [p.name, p.email, p.company].some((v) => String(v || "").toLowerCase().includes(needle))));
  }, [reach, q, group]);
  const dirty = enabled !== setting.enabled
    || blocked.size !== setting.blocked_emails.length || setting.blocked_emails.some((e) => !blocked.has(e));
  const getting = reach.filter((p) => !blocked.has(p.email)).length;
  const on = type.locked || enabled;

  const toggle = (email, gets) => setBlocked((b) => { const n = new Set(b); if (gets) n.delete(email); else n.add(email); return n; });
  const setAll = (gets) => setBlocked((b) => { const n = new Set(b); shown.forEach((p) => (gets ? n.delete(p.email) : n.add(p.email))); return n; });

  const save = async () => {
    setSaving(true);
    try {
      const res = await call({ action: "save", key: type.key, enabled: type.locked ? true : enabled, blocked_emails: [...blocked] });
      onSaved(type.key, res.setting);
      toast({ title: "Saved", description: `${type.label}: ${on ? `${getting} of ${reach.length} will get it` : "switched off"}.` });
    } catch (e) {
      toast({ title: "Couldn't save", description: errorData(e).error || e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const Icon = channelIcon(type.channel);
  return (
    <div className="space-y-4">
      <Panel
        title={<><Icon className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />{type.label}</>}
        description={type.when}
        actions={type.locked ? (
          <StatusChip tone="info"><Lock className="h-3 w-3" aria-hidden="true" /> Always on</StatusChip>
        ) : (
          <label className="flex items-center gap-2 text-body-sm font-semibold">
            <Switch className="!min-h-0" checked={enabled} onCheckedChange={setEnabled} aria-label={`Send ${type.label}`} />
            {enabled ? "On" : "Off"}
          </label>
        )}
      >
        {type.locked && (
          <p className="mb-3 rounded-xl bg-secondary px-3 py-2 text-body-sm text-muted-foreground">
            For safety this can't be switched off, and it always reaches at least one person. You can still choose who.
          </p>
        )}
        {!on && (
          <p className="mb-3 rounded-xl bg-secondary px-3 py-2 text-body-sm text-muted-foreground">
            Switched off: nobody gets this {type.channel === "email" ? "email" : "alert"}. Your choices below are kept for when you switch it back on.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Who gets it <span className="font-normal text-muted-foreground">· {getting} of {reach.length}</span></h3>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAll(true)} disabled={!shown.length}>Tick all</Button>
            <Button size="sm" variant="ghost" onClick={() => setAll(false)} disabled={!shown.length}>Untick all</Button>
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search name, email or company"
              aria-label="Search people" className="h-full min-w-0 flex-1 bg-transparent text-body-sm outline-none placeholder:text-muted-foreground" />
          </label>
          {groups.length > 1 && (
            <Segmented size="sm" label="Show" value={group} onChange={(v) => { setGroup(v); setLimit(PAGE); }}
              options={[{ value: "all", label: "Everyone" }, ...groups.map((g) => ({ value: g, label: AUDIENCE[g] }))]} />
          )}
        </div>

        {reach.length === 0 ? (
          <p className="mt-4 text-body-sm text-muted-foreground">Nobody can get this yet. People appear here once they have an account in the right role.</p>
        ) : shown.length === 0 ? (
          <p className="mt-4 text-body-sm text-muted-foreground">No one matches.</p>
        ) : (
          <ul className={cn("mt-3 divide-y divide-border rounded-xl border border-border", !on && "opacity-60")} aria-label="People">
            {shown.slice(0, limit).map((p) => {
              const gets = !blocked.has(p.email);
              const id = `ntf-${type.key}-${p.email}`;
              return (
                <li key={p.email} className="flex min-h-[52px] items-center gap-3 px-3 py-2">
                  <Checkbox id={id} className="!min-h-0" checked={gets} onCheckedChange={(v) => toggle(p.email, v === true)} />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-body-sm text-muted-foreground">{[p.email, p.company].filter(Boolean).join(" · ")}</span>
                  </label>
                  <span className="hidden shrink-0 text-caption text-muted-foreground sm:block">{AUDIENCE[p.audience]}</span>
                </li>
              );
            })}
          </ul>
        )}
        {shown.length > limit && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</Button>
        )}
        {type.key === "stop_ahead" && (
          <p className="mt-3 text-body-sm text-muted-foreground">Passengers who switched stop alerts off in their app don't get this, even if ticked here.</p>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 flex items-center justify-end gap-2 rounded-b-2xl border-t border-border bg-card px-5 py-3">
          {dirty && <span className="mr-auto text-body-sm text-muted-foreground">Unsaved changes</span>}
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => { setEnabled(setting.enabled); setBlocked(new Set(setting.blocked_emails)); }}>Undo</Button>
          <Button disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </Panel>

      <Panel title="Recent" description={`The last ${type.channel === "email" ? "emails" : "alerts"} of this kind.`}>
        <RecentList rows={recent.filter((r) => r.key === type.key).slice(0, 10)} types={types} empty="Nothing sent yet." />
      </Panel>
    </div>
  );
}

/** Admin → Notifications: every email and phone alert, and who gets each. */
export default function NotificationsTab() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState("");
  const [channel, setChannel] = useState("all");
  const [testing, setTesting] = useState("");

  const load = async () => {
    setFailed(false);
    try {
      const d = await call({ action: "overview" });
      setData(d);
      setSelected((s) => s || d.types?.[0]?.key || "");
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => { load(); }, []);

  const types = data?.types || [];
  const settingOf = (key) => data?.settings?.[key] || { enabled: true, blocked_emails: [] };
  const reachOf = useMemo(() => {
    const map = {};
    for (const t of types) map[t.key] = audienceOf(t, data?.people);
    return map;
  }, [data, types]);

  const onSaved = (key, setting) => setData((d) => ({ ...d, settings: { ...d.settings, [key]: setting } }));

  const test = async (kind) => {
    setTesting(kind);
    try {
      const res = await call({ action: "test", channel: kind });
      toast({ title: kind === "email" ? "Test email sent" : "Test alert sent", description: kind === "email" ? `Check ${res.to}.` : `Sent to ${res.devices} device${res.devices === 1 ? "" : "s"}.` });
      const r = await call({ action: "recent" });
      setData((d) => ({ ...d, recent: r.recent || d.recent }));
    } catch (e) {
      toast({ title: "Test didn't go through", description: errorData(e).error || e.message, variant: "destructive" });
    } finally {
      setTesting("");
    }
  };

  if (failed) {
    return <EmptyState icon={Bell} title="Couldn't load notifications" action={<Button onClick={load}><RefreshCw className="h-4 w-4" /> Try again</Button>}>Check the connection and try again.</EmptyState>;
  }
  if (!data) return <BusLoader className="py-12" />;

  const visible = types.filter((t) => channel === "all" || t.channel === channel);
  const current = types.find((t) => t.key === selected) || visible[0];
  const offCount = types.filter((t) => !t.locked && !settingOf(t.key).enabled).length;
  const leftOut = types.reduce((n, t) => n + settingOf(t.key).blocked_emails.filter((e) => reachOf[t.key]?.some((p) => p.email === e)).length, 0);
  const day = Date.now() - 24 * 3600_000;
  const lastDay = data.recent.filter((r) => Date.parse(r.sent_at) > day);
  const problems = lastDay.filter((r) => r.status === "failed" || r.status === "partial").length;

  return (
    <div>
      <PageIntro>Every email and phone alert TransitTrack sends. Switch one off, or untick the people who shouldn't get it.</PageIntro>
      <PageActions>
        <Button variant="outline" size="sm" onClick={() => test("email")} disabled={!!testing}><Send className="h-4 w-4" /> {testing === "email" ? "Sending…" : "Test email to me"}</Button>
        <Button variant="outline" size="sm" onClick={() => test("push")} disabled={!!testing}><Smartphone className="h-4 w-4" /> {testing === "push" ? "Sending…" : "Test alert to me"}</Button>
      </PageActions>

      <KpiRow>
        <Kpi icon={Bell} label="Switched on" value={`${types.length - offCount} of ${types.length}`} detail={offCount ? `${offCount} switched off` : "All kinds are on"} />
        <Kpi icon={Mail} label="People left out" value={leftOut} detail="Across all kinds" />
        <Kpi icon={Send} label="Sent today" value={lastDay.reduce((n, r) => n + r.sent, 0)} detail="Last 24 hours" />
        <Kpi icon={Smartphone} label="Problems today" value={problems} tone={problems ? "danger" : undefined} detail={problems ? "Some didn't arrive" : "Nothing failed"} />
      </KpiRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Panel title="Notifications" bodyClassName="px-2 pb-2">
          <Segmented className="mx-3 mb-2" size="sm" label="Show" value={channel} onChange={setChannel}
            options={[{ value: "all", label: "All" }, { value: "email", label: "Email", icon: Mail }, { value: "push", label: "Phone", icon: Smartphone }]} />
          <ul aria-label="Notifications">
            {visible.map((t) => (
              <KindRow key={t.key} type={t} setting={settingOf(t.key)} reach={reachOf[t.key] || []} active={current?.key === t.key} onSelect={() => setSelected(t.key)} />
            ))}
          </ul>
        </Panel>
        {current && (
          <KindDetail key={current.key + JSON.stringify(settingOf(current.key))} type={current} setting={settingOf(current.key)}
            reach={reachOf[current.key] || []} recent={data.recent} types={types} onSaved={onSaved} />
        )}
      </div>

      <Panel className="mt-4" title="All recent notifications" description="What went out, to whom, and whether it arrived."
        actions={<Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>}>
        <RecentList rows={data.recent.slice(0, 50)} types={types} empty="Nothing has been sent since this page was added." />
      </Panel>
    </div>
  );
}
