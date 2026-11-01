import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hourglass, VideoOff, VolumeX, Video } from "lucide-react";
import { createSupportViewer } from "@/lib/directTabletViewer";
import { base44 } from "@/api/base44Client";
import { clock, minutesLeft } from "@/lib/officeDisplay";
import { Chip, ScreenMessage } from "./DisplayParts";
import { WallMap } from "./DisplayLayouts";
import { cn } from "@/lib/utils";

// Cameras + map. Camera views are started by an administrator in Office
// displays (10 minutes each) and watched here with the McSween kiosk app's
// direct viewing, the same one-way, video-only connection Admin → Fleet uses.
// Nothing here starts, renews or restarts a view; at the end each panel says
// "Viewing session ended" and stays that way until someone starts a new one.

const ENDED = new Set(["ended", "expired", "failed", "denied"]);

async function call(token, action, extra = {}) {
  const r = await base44.functions.invoke("officeDisplay", { action, display_token: token, ...extra });
  return r.data;
}

function CameraTile({ view, token, bus, label, onLive, now }) {
  const video = useRef(null);
  const room = useRef(null);
  const tried = useRef(false);
  const [live, setLive] = useState(false);
  const [problem, setProblem] = useState("");
  const expired = view.expires_at && Date.parse(view.expires_at) <= now;
  const over = ENDED.has(view.state) || expired || !view.session_id;

  const close = useCallback(() => { const r = room.current; room.current = null; r?.close(); setLive(false); }, []);
  useEffect(() => () => close(), [close]);

  // At the end time the panel stops by itself, whatever the server says next.
  useEffect(() => {
    if (!over) return;
    close();
    onLive(view.session_id, false);
  }, [over]);  

  useEffect(() => {
    if (over || tried.current || !view.offer_ready || view.answered) return;
    tried.current = true;
    let cancelled = false;
    (async () => {
      try {
        const auth = await call(token, "camera_viewer", { session_id: view.session_id });
        if (cancelled) return;
        const r = createSupportViewer({
          video: video.current,
          isCancelled: () => cancelled,
          onEnded: () => {
            if (cancelled) return;
            setLive(false);
            setProblem("The video connection dropped.");
            void call(token, "camera_end", { session_id: view.session_id }).catch(() => {});
          },
        });
        room.current = r;
        await r.connect(auth, (sdp) => call(token, "camera_answer", { session_id: view.session_id, sdp }));
      } catch (e) {
        if (cancelled) return;
        close();
        setProblem(e?.status === 410 || e?.data?.code === "ended" ? "" : "This camera couldn't connect.");
        void call(token, "camera_end", { session_id: view.session_id }).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [view.offer_ready, view.answered, over]);  

  const waiting = !over && !live && !problem;
  return (
    <figure className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <figcaption className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
        <span className="min-w-0 truncate text-[1.15rem] font-semibold">
          <span className="font-display text-[1.35rem] font-bold">{bus}</span>
          <span className="text-muted-foreground"> · {label} · back camera</span>
        </span>
        {!over && view.expires_at && <Chip tone="info" icon={Hourglass}>Ends {clock(view.expires_at)} · {minutesLeft(view.expires_at, now)} min</Chip>}
      </figcaption>
      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label={`${bus} back camera, live`}
          onPlaying={() => { if (room.current) { setLive(true); onLive(view.session_id, true); } }}
          className={cn("absolute inset-0 h-full w-full object-contain", live && !over ? "" : "invisible")}
        />
        {live && !over && (
          <span className="absolute left-3 top-3 flex items-center gap-2">
            <Chip tone="live" icon={Video}>Live</Chip>
            <Chip tone="neutral" icon={VolumeX}>Muted</Chip>
          </span>
        )}
        {(!live || over) && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            {over ? (
              <p className="text-[1.5rem] font-semibold text-white">Viewing session ended</p>
            ) : problem ? (
              <p className="flex flex-col items-center gap-2 text-[1.2rem] font-semibold text-white">
                <VideoOff className="h-[2em] w-[2em]" aria-hidden="true" />{problem}
                <span className="text-[1rem] font-normal text-white/70">Start it again from Office displays.</span>
              </p>
            ) : waiting ? (
              <p className="text-[1.2rem] text-white/80">{view.state === "requested" ? "Waiting for the tablet to check in…" : "Connecting to the tablet…"}</p>
            ) : null}
          </div>
        )}
      </div>
    </figure>
  );
}

export function CamerasLayout({ feed, token, dark, now }) {
  const [views, setViews] = useState(feed?.cameras || []);
  const live = useRef(new Set());
  const [, bump] = useState(0);
  useEffect(() => { setViews(feed?.cameras || []); }, [feed?.generated_at]);  
  const onLive = useCallback((id, on) => { if (on) live.current.add(id); else live.current.delete(id); bump((n) => n + 1); }, []);

  // While a view is still connecting, check on it more often than the feed.
  const pendingKey = views.filter((v) => v.session_id && !ENDED.has(v.state) && !live.current.has(v.session_id) && Date.parse(v.expires_at) > Date.now()).map((v) => v.session_id).join(",");
  useEffect(() => {
    if (!pendingKey || !token) return undefined;
    let alive = true;
    const t = setInterval(async () => {
      try { const r = await call(token, "camera_status"); if (alive && Array.isArray(r?.cameras)) setViews(r.cameras); } catch { /* the feed tries again */ }
    }, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [pendingKey, token]);

  const tablets = feed?.tablets || [];
  const busName = (deviceId) => {
    const k = tablets.find((t) => t.id === deviceId);
    const v = (feed?.vehicles || []).find((x) => x.id === k?.vehicle_id);
    return { bus: v?.name || "Bus", label: k?.label || "Driver tablet" };
  };
  const shown = views.slice(0, 4);
  const grid = shown.length <= 1 ? "grid-cols-1 grid-rows-1" : shown.length === 2 ? "grid-cols-1 grid-rows-2" : "grid-cols-2 grid-rows-2";
  const anyActive = shown.some((v) => v.session_id && !ENDED.has(v.state) && Date.parse(v.expires_at) > now);
  const noViews = useMemo(() => !shown.length, [shown.length]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
      <WallMap feed={feed} dark={dark} now={now} />
      {noViews ? (
        <div className="rounded-2xl border border-border bg-card">
          <ScreenMessage icon={Video} title={feed?.camera_choices ? "No camera view running" : "No cameras chosen"}>
            {feed?.camera_choices
              ? "An administrator starts viewing from Office displays. Each view lasts 10 minutes and nothing is recorded."
              : "Choose up to four driver tablets for this display in Office displays."}
          </ScreenMessage>
        </div>
      ) : (
        <div className={cn("grid min-h-0 gap-3", grid)} aria-live="polite">
          {shown.map((v) => {
            const { bus, label } = busName(v.device_id);
            return <CameraTile key={v.session_id || v.device_id} view={v} token={token} bus={bus} label={label} onLive={onLive} now={now} />;
          })}
          {!anyActive && <span className="sr-only">Viewing session ended</span>}
        </div>
      )}
    </div>
  );
}
