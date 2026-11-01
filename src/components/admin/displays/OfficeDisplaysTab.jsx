import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EyeOff, Eye, Link2, Maximize2, MonitorPlay, MonitorX, Plus, RefreshCw, ShieldOff, SquarePen, Trash2, Tv, Video, VideoOff, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";
import { EmptyState, PageActions, PageIntro, Panel, StatusChip } from "@/components/admin/kit";
import BusLoader from "@/components/BusLoader";
import { formatAge } from "@/components/system/status";
import { LAYOUT_NAMES, clock } from "@/lib/officeDisplay";
import { desktopDisplays } from "@/lib/officeDisplayDesktop";
import OfficeDisplayEditor from "./OfficeDisplayEditor";

// Admin → Office displays: office monitors and TVs showing a read-only view.
// "Monitor on this computer" displays open in their own window from
// McSween Transport Desktop; "paired screens" are another computer or a TV
// browser paired with a code. Server side: base44/functions/officeDisplay.

const REFRESH_MS = 10_000;
const errorText = (e, fallback) => e?.response?.data?.error || e?.data?.error || e?.message || fallback;
const call = async (action, extra = {}) => (await base44.functions.invoke("officeDisplay", { action, ...extra })).data;
const ENDED = new Set(["ended", "expired", "failed", "denied"]);
const PAIR_URL = "app.mcsweenstransport.com/display/pair";

function screenLabel(s) {
  return `${s.label}${s.primary ? " (main screen)" : ""} · ${s.width}×${s.height}`;
}

function Status({ d, win, now }) {
  if (d.status === "revoked") return <StatusChip tone="neutral">Access revoked</StatusChip>;
  if (d.kind === "window") {
    if (win) return <StatusChip tone="success">{win.minimized ? "Open, minimized" : win.fullscreen ? "Open, full screen" : "Open in a window"}</StatusChip>;
    return <StatusChip tone="neutral">Not open</StatusChip>;
  }
  if (!d.connected) return <StatusChip tone="neutral">{d.paired_at ? "Not connected" : "Not paired yet"}</StatusChip>;
  if (d.online) return <StatusChip tone="success">Online · seen {formatAge(now - Date.parse(d.last_seen_at))}</StatusChip>;
  return <StatusChip tone="warning">Offline{d.last_seen_at ? ` · last seen ${formatAge(now - Date.parse(d.last_seen_at))}` : ""}</StatusChip>;
}

function CameraControls({ d, options, busy, act, now }) {
  const names = (d.camera_device_ids || []).map((id) => options.cameras.find((k) => k.id === id)).filter(Boolean);
  const live = (d.cameras || []).filter((c) => !ENDED.has(c.state) && Date.parse(c.expires_at) > now);
  const canStart = options.streaming && d.connected && d.status !== "revoked" && !d.blanked && names.length > 0;
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-body-sm font-semibold">Cameras</p>
      {!names.length ? (
        <p className="text-caption text-muted-foreground">None chosen. Choose up to four in Change.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-body-sm">
          {names.map((k) => {
            const s = (d.cameras || []).find((c) => c.device_id === k.id);
            const running = s && !ENDED.has(s.state) && Date.parse(s.expires_at) > now;
            return (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{k.vehicle_name} · {k.label}</span>
                {running ? <StatusChip tone="info">Viewing until {clock(s.expires_at)}</StatusChip> : s ? <StatusChip tone="neutral">Ended</StatusChip> : null}
              </li>
            );
          })}
        </ul>
      )}
      {!options.streaming && <p className="mt-2 text-caption text-muted-foreground">Direct camera viewing isn't turned on for this account yet.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={!canStart || busy} onClick={() => act("camera_start", d)}>
          <Video className="mr-1.5 h-4 w-4" aria-hidden="true" />{live.length ? "Start again (10 min)" : "Start viewing (10 min)"}
        </Button>
        {live.length > 0 && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act("camera_stop", d)}>
            <VideoOff className="mr-1.5 h-4 w-4" aria-hidden="true" />Stop viewing
          </Button>
        )}
      </div>
      <p className="mt-2 text-caption text-muted-foreground">Each view stops after 10 minutes and never restarts by itself. Muted, and nothing is recorded. Every start and stop is in the audit log.</p>
    </div>
  );
}

function DisplayCard({ d, options, bridge, win, screens, now, busy, act, onEdit, onPair }) {
  const [screenId, setScreenId] = useState("");
  useEffect(() => {
    if (screenId && screens.some((s) => s.id === screenId)) return;
    setScreenId(win?.screen_id || (screens.find((s) => !s.primary) || screens[0])?.id || "");
  }, [screens, win?.screen_id]);  
  const companies = options.companies.filter((c) => d.company_ids.includes(c.id)).map((c) => c.name).join(", ") || "No company";
  const scope = d.vehicle_ids.length ? `${d.vehicle_ids.length} bus${d.vehicle_ids.length === 1 ? "" : "es"}` : "All buses";
  const layouts = d.rotate ? d.rotate_layouts.map((l) => LAYOUT_NAMES[l]).join(", then ") : LAYOUT_NAMES[d.layout];
  return (
    <Panel
      title={d.name}
      icon={d.kind === "window" ? MonitorPlay : Tv}
      description={d.kind === "window" ? "Monitor or TV on a computer running McSween Transport Desktop" : "Paired screen: another computer or a TV browser"}
      actions={<><Status d={d} win={win} now={now} />{d.blanked && <StatusChip tone="warning">Blanked</StatusChip>}</>}
    >
      <p className="text-body-sm">{layouts}</p>
      <p className="text-body-sm text-muted-foreground">{companies} · {scope} · {d.theme === "light" ? "Light" : "Dark"} · {d.text_size === "xlarge" ? "Extra large" : d.text_size === "normal" ? "Normal" : "Large"} text{d.show_guest_names ? " · Shows guest names" : ""}</p>

      {d.kind === "window" && (
        bridge ? (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[14rem] flex-col gap-1 text-caption font-semibold">
              Monitor
              <select className="h-10 rounded-xl border border-input bg-background px-3 text-body-sm" value={screenId} onChange={(e) => setScreenId(e.target.value)} disabled={busy}>
                {screens.map((s) => <option key={s.id} value={s.id}>{screenLabel(s)}</option>)}
              </select>
            </label>
            <Button disabled={busy || !screenId} onClick={() => act("open_window", d, { screenId })}>
              <MonitorPlay className="mr-1.5 h-4 w-4" aria-hidden="true" />{win ? "Move to this monitor" : "Open"}
            </Button>
            {win && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => act("fullscreen", d)}><Maximize2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{win.fullscreen ? "Leave full screen" : "Full screen"}</Button>
                <Button variant="outline" disabled={busy} onClick={() => act("refresh", d)}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Refresh</Button>
                <Button variant="outline" disabled={busy} onClick={() => act("close_window", d)}><X className="mr-1.5 h-4 w-4" aria-hidden="true" />Close</Button>
              </>
            )}
            {screens.length < 2 && <p className="w-full text-caption text-muted-foreground">Only one screen is connected. Connect the TV and set Windows to Extend (see Setting up a TV below), or the display opens over this window.</p>}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-body-sm">Open this page in McSween Transport Desktop on the computer the TV is connected to, then choose Open.</p>
        )
      )}
      {d.kind === "paired" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => onPair(d)}><Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{d.connected ? "Pair a different screen" : "Pair a screen"}</Button>
          {d.connected && <Button variant="outline" disabled={busy} onClick={() => act("revoke", d)}><ShieldOff className="mr-1.5 h-4 w-4" aria-hidden="true" />Revoke access</Button>}
        </div>
      )}

      {d.layout === "cameras" && <div className="mt-4"><CameraControls d={d} options={options} busy={busy} act={act} now={now} /></div>}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(d)}><SquarePen className="mr-1.5 h-4 w-4" aria-hidden="true" />Change</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => act("blank", d)}>
          {d.blanked ? <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <EyeOff className="mr-1.5 h-4 w-4" aria-hidden="true" />}{d.blanked ? "Show screen" : "Blank screen"}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => act("delete", d)} className="text-destructive"><Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Delete</Button>
      </div>
    </Panel>
  );
}

function PairDialog({ display, onClose, onDone }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setCode(""); setError(""); }, [display?.id]);
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setError("");
    try { await call("pair_approve", { display_id: display.id, code }); onDone(); }
    catch (err) { setError(errorText(err, "Couldn't pair that screen.")); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={!!display} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Pair a screen as {display?.name}</DialogTitle>
            <DialogDescription>
              On the TV or computer, open <span className="font-semibold text-foreground">{PAIR_URL}</span>. It shows a 6-character code that works once, for 10 minutes. Cameras never start from pairing.
            </DialogDescription>
          </DialogHeader>
          <Input className="my-4 h-14 text-center font-display text-headline uppercase tracking-[0.3em]" value={code} maxLength={8} autoFocus autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} aria-label="Code shown on the screen" placeholder="K7Q4MZ" />
          {display?.connected && <p className="mb-3 text-caption text-muted-foreground">The screen paired now stops showing this display.</p>}
          {error && <p role="alert" className="mb-3 text-body-sm font-semibold text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || code.length !== 6}>{busy ? "Pairing…" : "Pair screen"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SetupHelp() {
  return (
    <Panel title="Setting up a TV or second monitor" icon={Tv} className="mt-6">
      <ol className="list-decimal space-y-1.5 pl-5 text-body-sm">
        <li>Connect the TV or monitor to the office computer (HDMI or DisplayPort).</li>
        <li>On that computer press <kbd className="rounded border border-border px-1.5">Windows</kbd> + <kbd className="rounded border border-border px-1.5">P</kbd> and choose <span className="font-semibold">Extend</span>. Duplicate would show your own work on the TV. This app never changes Windows display settings for you.</li>
        <li>Optional: in Windows Settings → System → Display, choose Identify to see which number the TV is, and set its scale (100% or 150% both work).</li>
        <li>Here, add a display as a monitor on this computer, choose the TV under Monitor, and select Open. It opens full screen; F11 switches full screen, Esc leaves it.</li>
      </ol>
      <p className="mt-3 text-body-sm text-muted-foreground">
        TV browsers: pairing works in up-to-date Chrome, Edge and Firefox. Many smart-TV browsers are slow or lack the 3D map or live video; if a TV struggles, connect it to a small computer instead. Display windows close when you sign out or close the main window, and a paired screen hides what it shows after 15 minutes without a connection.
      </p>
    </Panel>
  );
}

export default function OfficeDisplaysTab() {
  const { toast } = useToast();
  const bridge = desktopDisplays();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState(null); // display, or {} for a new one
  const [pairing, setPairing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [screens, setScreens] = useState([]);
  const [windows, setWindows] = useState([]);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try { setData(await call("list")); setLoadError(""); setNow(Date.now()); }
    catch (e) { setLoadError(errorText(e, "Couldn't load office displays.")); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!bridge) return undefined;
    const sync = () => {
      Promise.resolve(bridge.screens()).then((s) => setScreens(s || [])).catch(() => {});
      Promise.resolve(bridge.list()).then((l) => setWindows(l || [])).catch(() => {});
    };
    sync();
    const off = bridge.onChange?.((list) => { setWindows(list || []); Promise.resolve(bridge.screens()).then((s) => setScreens(s || [])).catch(() => {}); });
    return () => off?.();
  }, [bridge]);

  const options = useMemo(() => ({
    companies: data?.companies || [], vehicles: data?.vehicles || [], cameras: data?.cameras || [], streaming: !!data?.streaming, limits: data?.limits || {},
  }), [data]);
  const replace = (display) => setData((p) => (p ? { ...p, displays: p.displays.map((x) => (x.id === display.id ? display : x)) } : p));

  const act = async (what, d, extra = {}) => {
    if (what === "delete" && !(await confirmAction({ title: `Delete ${d.name}?`, description: "The screen stops showing anything straight away. This can't be undone.", confirmLabel: "Delete display" }))) return;
    if (what === "revoke" && !(await confirmAction({ title: `Revoke ${d.name}'s access?`, description: "The paired screen goes blank straight away. Pair it again with a new code to use it.", confirmLabel: "Revoke access" }))) return;
    setBusyId(d.id);
    try {
      if (what === "open_window") {
        const r = await call("window_open", { display_id: d.id });
        await bridge.open({ id: d.id, token: r.display_token, name: d.name, screen_id: extra.screenId });
      } else if (what === "close_window") {
        await Promise.resolve(bridge.close(d.id));
        await call("window_close", { display_id: d.id });
      } else if (what === "fullscreen") await bridge.fullscreen(d.id);
      else if (what === "refresh") await bridge.refresh(d.id);
      else if (what === "blank") replace((await call("blank", { display_id: d.id, blanked: !d.blanked })).display);
      else if (what === "revoke") replace((await call("revoke", { display_id: d.id })).display);
      else if (what === "delete") {
        if (windows.some((w) => w.id === d.id)) await Promise.resolve(bridge.close(d.id)).catch(() => {});
        await call("delete", { display_id: d.id });
        setData((p) => ({ ...p, displays: p.displays.filter((x) => x.id !== d.id) }));
      } else if (what === "camera_start") {
        const r = await call("camera_start", { display_id: d.id });
        replace(r.display);
        const failed = (r.results || []).filter((x) => !x.ok);
        if (failed.length) toast({ title: `${failed.length} camera${failed.length === 1 ? "" : "s"} didn't start`, description: failed.map((x) => x.error).join(" "), variant: "destructive" });
      } else if (what === "camera_stop") replace((await call("camera_stop", { display_id: d.id })).display);
      await load();
    } catch (e) {
      toast({ title: "That didn't work", description: errorText(e, "Try again."), variant: "destructive" });
    } finally { setBusyId(""); }
  };

  const save = async (settings) => {
    setSaving(true);
    try {
      const r = await call("save", { display_id: editing?.id, settings });
      setEditing(null);
      await load();
      if (!editing?.id && r.display?.kind === "paired") setPairing(r.display);
      return null;
    } catch (e) { return { error: errorText(e, "Couldn't save the display.") }; }
    finally { setSaving(false); }
  };

  if (!data && !loadError) return <BusLoader label="Loading office displays" />;
  return (
    <div>
      <PageIntro>Show a read-only view of the fleet on office monitors and TVs. A display never uses your sign-in, and it only receives what you allow for it.</PageIntro>
      <PageActions>
        <Button onClick={() => setEditing({})} disabled={!data || data.displays.length >= (data.limits?.max_displays || 20)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Add display</Button>
      </PageActions>
      {loadError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-body-sm">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={load}>Try again</Button>
        </div>
      )}
      {data && !data.displays.length ? (
        <EmptyState icon={MonitorX} title="No office displays yet" action={<Button onClick={() => setEditing({})}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Add display</Button>}>
          Add one for a TV on this computer or for a screen elsewhere in the office.
        </EmptyState>
      ) : data && (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.displays.map((d) => (
            <DisplayCard key={d.id} d={d} options={options} bridge={bridge} win={windows.find((w) => w.id === d.id)} screens={screens} now={now}
              busy={busyId === d.id} act={act} onEdit={setEditing} onPair={setPairing} />
          ))}
        </div>
      )}
      <SetupHelp />
      <OfficeDisplayEditor open={!!editing} display={editing?.id ? editing : null} options={options} busy={saving} onClose={() => setEditing(null)} onSave={save} />
      <PairDialog display={pairing} onClose={() => setPairing(null)} onDone={async () => { setPairing(null); await load(); toast({ title: "Screen paired", description: "It starts showing the display within a few seconds." }); }} />
    </div>
  );
}
