import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BellOff, ChevronRight, Clock, CircleAlert, KeyRound, LifeBuoy, MapPinned, MessageCircle, OctagonAlert,
  Phone, Sparkles, TriangleAlert, Users, X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { crowdLevel } from "@/hooks/useCrowding";
import { STATUS_LABEL } from "@/lib/trip";
import { useStaffFlags } from "@/components/staff/QuickActions";
import { busNumber, clock, lastSeen } from "./passengerState";

export function SectionHead({ id, title, aside }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-title-sm font-bold">{title}</h2>
      {aside}
    </div>
  );
}

// A full-width notice under the arrival time: red for a problem with your
// bus, amber for company announcements.
export function AlertBand({ tone = "warning", title, body, meta, onDismiss, action }) {
  const danger = tone === "danger";
  const Icon = danger ? OctagonAlert : TriangleAlert;
  return (
    <section
      role={danger ? "alert" : "status"}
      className={cn("flex items-start gap-3.5 py-4 pl-6 pr-3 lg:rounded-xl lg:pl-5", danger ? "bg-danger/12" : "bg-warning/12")}
    >
      <Icon className={cn("mt-0.5 h-[22px] w-[22px] shrink-0", danger ? "text-danger" : "text-warning")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        {body && <p className="mt-1 text-body-sm leading-relaxed">{body}</p>}
        {meta && <p className="mt-1.5 text-caption text-muted-foreground">{meta}</p>}
        {action}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-foreground/5" aria-label="Dismiss notice">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

// The "one stop away" alert, with a way to turn notifications on when this
// phone hasn't allowed them yet.
export function StopAlertRow({ busName, stopAlerts, onToggle, pushPermission, onEnablePush }) {
  const needsPush = stopAlerts && pushPermission !== "granted" && pushPermission !== "unsupported";
  return (
    <section className="px-6 pt-6 lg:px-0">
      <label className="flex min-h-[64px] cursor-pointer items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
        <span className="flex-1 text-body font-semibold">
          Notify me when {busName || "a bus"} is one stop away
          {stopAlerts && pushPermission === "unsupported" && (
            <span className="mt-0.5 block text-body-sm font-normal text-muted-foreground">This device can't show notifications. Add the app to your home screen to get them.</span>
          )}
        </span>
        <Switch checked={stopAlerts} onCheckedChange={onToggle} aria-label={`Notify me when ${busName || "a bus"} is one stop away`} />
      </label>
      {needsPush && (
        <p className="mt-2 flex items-center gap-2 text-body-sm text-muted-foreground">
          <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="flex-1">Notifications are off on this phone.</span>
          <Button size="sm" variant="ghost" className="text-foreground underline underline-offset-4" onClick={onEnablePush}>Turn on</Button>
        </p>
      )}
    </section>
  );
}

const fmtUntil = (iso) => (iso ? clock(iso) : "");

// Running late, skip today and message the driver, as one segmented row.
export function TripActions({ onChat, chatUnread = 0 }) {
  const { late, skip, lateUntil, toggleLate, toggleSkip } = useStaffFlags();
  const btn = "relative flex min-h-[72px] flex-1 flex-col items-center justify-center gap-1.5 px-2 py-3 text-center text-body-sm font-semibold transition-colors focus-visible:z-10";
  return (
    <section className="px-6 pt-4 lg:px-0" aria-label="Trip actions">
      <div className="flex overflow-hidden rounded-xl border border-border bg-card divide-x divide-border">
        <button type="button" onClick={toggleLate} aria-pressed={late} className={cn(btn, late ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
          <Clock className="h-5 w-5" aria-hidden="true" />
          <span>{late ? `Late until ${fmtUntil(lateUntil)}` : "Running late"}</span>
        </button>
        <button type="button" onClick={toggleSkip} aria-pressed={skip} className={cn(btn, skip ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
          <BellOff className="h-5 w-5" aria-hidden="true" />
          <span>{skip ? "Skipping today" : "Skip today"}</span>
        </button>
        <button type="button" onClick={onChat} className={cn(btn, "hover:bg-accent")}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          <span>Message driver</span>
          {chatUnread > 0 && (
            <span className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-caption font-bold text-danger-foreground">
              <span className="sr-only">, </span>{chatUnread > 9 ? "9+" : chatUnread}<span className="sr-only"> unread</span>
            </span>
          )}
        </button>
      </div>
    </section>
  );
}

// Driver, vehicle and how full it is.
export function TripFacts({ bus, crowdCount = 0 }) {
  if (!bus) return null;
  const crowd = crowdLevel(crowdCount, bus.capacity);
  const rows = [
    ["Driver", bus.driver_name || "Not assigned"],
    ["Vehicle", [bus.name, bus.plate_number].filter(Boolean).join(", ")],
  ];
  if (crowd) {
    rows.push([
      "On board",
      <span key="c" className="inline-flex items-center gap-1.5">
        <Users className={cn("h-4 w-4", crowd.tone === "full" ? "text-danger" : crowd.tone === "busy" ? "text-warning" : "text-success")} aria-hidden="true" />
        {bus.capacity ? `${crowdCount} of ${bus.capacity} seats · ${crowd.label}` : crowd.label}
      </span>,
    ]);
  }
  return (
    <section className="px-6 pt-8 lg:px-0" aria-label="About your bus">
      <dl className="divide-y divide-border border-y border-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-[52px] items-center justify-between gap-4 py-2">
            <dt className="text-body-sm text-muted-foreground">{k}</dt>
            <dd className="truncate text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function otherBusLine(v, now) {
  if (v.in_service === false) return "Out of service";
  if (v.tracking_active) return v.status === "on_trip" ? "On a trip" : "On the road";
  if (!v.last_location_update) return "Not on the road today";
  const seen = new Date(v.last_location_update);
  const sameDay = seen.toDateString() === new Date(now).toDateString();
  return sameDay ? `Not tracking since ${clock(seen)}` : `Not on the road today · last seen ${lastSeen(v.last_location_update, now)}`;
}

export function OtherBuses({ buses, crowd = {}, title, now = Date.now() }) {
  if (!buses.length) return null;
  return (
    <section className="px-6 pt-10 lg:px-0" aria-labelledby="tt-other-buses">
      <SectionHead id="tt-other-buses" title={title} aside={<Link to="/route-explorer" className="text-body-sm font-semibold underline-offset-4 hover:underline">See on map</Link>} />
      <ul className="divide-y divide-border border-y border-border">
        {buses.map((v) => {
          const num = busNumber(v.name);
          const level = v.tracking_active ? crowdLevel(crowd[v.id] || 0, v.capacity) : null;
          return (
            <li key={v.id}>
              <Link to={`/route-explorer?bus=${encodeURIComponent(v.id)}`} className="flex min-h-[64px] items-center gap-4 py-2 hover:bg-accent/50">
                <span className={cn("w-12 shrink-0 text-center font-display text-headline font-semibold tabular-nums", !v.tracking_active && "text-muted-foreground")} aria-hidden="true">
                  {num || <span className="text-body-sm">{(v.name || "?").slice(0, 3)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{v.name}</span>
                  <span className="flex items-center gap-1.5 truncate text-body-sm text-muted-foreground">
                    {v.tracking_active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                    {otherBusLine(v, now)}{level ? ` · ${level.label}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STEPS = ["scheduled", "on_the_way", "arrived", "completed"];
const fmtWhen = (iso) => {
  if (!iso) return "Time to be confirmed";
  const d = new Date(iso);
  return new Date().toDateString() === d.toDateString()
    ? `Today ${clock(d)}`
    : d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

// Booked door-to-door rides from your stop.
export function BookedRides({ trips, stopName }) {
  if (!trips.length) return null;
  return (
    <section className="px-6 pt-10 lg:px-0" aria-labelledby="tt-booked">
      <SectionHead id="tt-booked" title={`Booked rides from ${stopName}`} />
      <ul className="divide-y divide-border border-y border-border">
        {trips.map((t) => {
          const current = STEPS.indexOf(t.status);
          return (
            <li key={t.id} className="space-y-2 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate font-semibold">{t.pickup_name} <span className="text-muted-foreground">to</span> {t.dropoff_name}</p>
                <span className="shrink-0 text-body-sm text-muted-foreground">{fmtWhen(t.scheduled_time)}</span>
              </div>
              {t.status === "cancelled" ? (
                <p className="text-body-sm font-semibold text-danger">Cancelled</p>
              ) : (
                <div className="flex items-center gap-3" aria-label={`Status: ${STATUS_LABEL[t.status] || t.status}`}>
                  <div className="flex flex-1 gap-1" aria-hidden="true">
                    {STEPS.map((s, i) => <span key={s} className={cn("h-1.5 flex-1 rounded-full", i <= current ? "bg-primary" : "bg-muted")} />)}
                  </div>
                  <span className="text-body-sm font-semibold">{STATUS_LABEL[t.status] || t.status}</span>
                </div>
              )}
              <p className="truncate text-body-sm text-muted-foreground">
                {t.driver_name || "Driver to be confirmed"} · {t.vehicle_name || "Vehicle to be confirmed"}{t.passenger_name ? ` · ${t.passenger_name}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MoreRow({ icon: Icon, title, sub, onClick, href }) {
  const body = (
    <>
      <Icon className="h-[22px] w-[22px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {sub && <span className="block truncate text-body-sm text-muted-foreground">{sub}</span>}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
  const cls = "flex min-h-[64px] w-full items-center gap-4 py-2 text-left hover:bg-accent/50";
  return <li>{href ? <a href={href} className={cls}>{body}</a> : <button type="button" onClick={onClick} className={cls}>{body}</button>}</li>;
}

export function MoreList({ companyName, companyPhone, onBadge, onAssistant, onHelp, onPickup, pickupSummary }) {
  const tel = (companyPhone || "").trim();
  return (
    <section className="px-6 pt-10 lg:px-0" aria-labelledby="tt-more">
      <SectionHead id="tt-more" title="More" />
      <ul className="divide-y divide-border border-y border-border">
        <MoreRow icon={KeyRound} title="Boarding code" sub="Forgot your badge? Get a one-time code" onClick={onBadge} />
        <MoreRow icon={Sparkles} title="Ask about your bus" sub="Quick answers about times and stops" onClick={onAssistant} />
        {tel && <MoreRow icon={Phone} title={`Call ${companyName || "the operator"}`} sub={tel} href={`tel:${tel}`} />}
        <MoreRow icon={LifeBuoy} title="Help and lost items" sub="Report something left on the bus, safety rules" onClick={onHelp} />
        <MoreRow icon={MapPinned} title="Pickup settings" sub={pickupSummary || "Pickup pin, WhatsApp updates, switch company"} onClick={onPickup} />
      </ul>
    </section>
  );
}

// Sponsor message, kept quiet and at the bottom. Same ads as before.
export function SponsorLine() {
  const [ad, setAd] = useState(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    base44.entities.Advertisement.filter({ active: true })
      .then((ads) => setAd(ads[0] || null))
      .catch(() => {});
  }, []);
  if (!ad || hidden) return null;
  const link = ad.link && /^https?:\/\//i.test(ad.link) ? ad.link : null;
  return (
    <aside className="mx-6 mt-10 flex items-start gap-3 border-t border-border pt-4 lg:mx-0" aria-label="Sponsored message">
      {ad.image_url && <Image src={ad.image_url} className="h-10 w-10 shrink-0 rounded-lg" fittingType="fill" alt="" />}
      <p className="min-w-0 flex-1 text-body-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{ad.title || "Sponsored"}</span>
        {ad.message ? ` ${ad.message}` : ""}
        {link && <> <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline underline-offset-4">Learn more</a></>}
      </p>
      <button type="button" onClick={() => setHidden(true)} className="-mt-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Hide sponsored message">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
