import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell, BellOff, BellRing, Bus, ChevronRight, Clock, CircleAlert, KeyRound, LifeBuoy, MapPinned, MessageCircle, OctagonAlert,
  Map as MapIcon, Phone, Sparkles, TriangleAlert, UserRound, Users, X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { crowdLevel } from "@/hooks/useCrowding";
import useDrivingEta from "@/hooks/useDrivingEta";
import { freshnessOf } from "@/components/system/status";
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

// The "one stop away" alert as one big action. Same switch as before
// (onToggle), with a way to turn notifications on when this phone hasn't
// allowed them yet.
export function StopAlertRow({ busName, stopAlerts, onToggle, pushPermission, onEnablePush }) {
  const needsPush = stopAlerts && pushPermission !== "granted" && pushPermission !== "unsupported";
  return (
    <section className="px-6 pt-5 lg:px-0">
      <button
        type="button"
        onClick={() => onToggle(!stopAlerts)}
        aria-pressed={stopAlerts}
        className={cn(
          "flex min-h-[64px] w-full flex-col items-center justify-center rounded-xl px-4 py-2.5 text-center transition-[background-color,transform] duration-fast active:scale-[0.99]",
          stopAlerts ? "border border-border bg-card hover:bg-accent" : "bg-primary text-primary-foreground hover:shadow-md",
        )}
      >
        <span className="flex items-center gap-2 text-title-sm font-bold">
          {stopAlerts ? <BellRing className="h-5 w-5 text-primary" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
          {stopAlerts ? "You'll be notified" : "Notify me"}
        </span>
        <span className={cn("text-body-sm", stopAlerts ? "text-muted-foreground" : "text-primary-foreground")}>
          {stopAlerts ? `When ${busName || "a bus"} is one stop away · tap to turn off` : `When ${busName || "the bus"} is one stop away`}
        </span>
      </button>
      {stopAlerts && pushPermission === "unsupported" && (
        <p className="mt-2 text-body-sm text-muted-foreground">This device can't show notifications. Add the app to your home screen to get them.</p>
      )}
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
  const btn = "relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-center text-caption font-semibold transition-colors focus-visible:z-10";
  return (
    <section className="px-6 pt-3 lg:px-0" aria-label="Trip actions">
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

// Driver, vehicle and how full it is, side by side.
export function TripFacts({ bus, crowdCount = 0 }) {
  if (!bus) return null;
  const crowd = crowdLevel(crowdCount, bus.capacity);
  const cells = [
    { icon: UserRound, k: "Driver", v: bus.driver_name || "Not assigned" },
    { icon: Bus, k: "Vehicle", v: bus.name, note: bus.plate_number || null },
    ...(crowd ? [{
      icon: Users, k: "Occupancy",
      v: bus.capacity ? `${crowdCount}/${bus.capacity} seats` : crowd.label,
      tone: crowd.tone === "full" ? "text-danger" : crowd.tone === "busy" ? "text-warning" : "text-success",
      note: bus.capacity ? crowd.label : null,
    }] : []),
  ];
  return (
    <section className="px-6 pt-8 lg:px-0" aria-labelledby="tt-vehicle-details">
      <h2 id="tt-vehicle-details" className="mb-2 text-title-sm font-bold">Vehicle details</h2>
      <dl className={cn("grid divide-x divide-border rounded-xl border border-border bg-card", cells.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {cells.map(({ icon: Icon, k, v, tone, note }) => (
          <div key={k} className="flex min-w-0 flex-col gap-1 px-3 py-3">
            <dt className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Icon className={cn("h-4 w-4 shrink-0", tone)} aria-hidden="true" /> {k}
            </dt>
            <dd className="text-body-sm font-semibold leading-snug">
              {v}
              {note && <span className="block text-caption font-normal text-muted-foreground">{note}</span>}
            </dd>
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

export function MoreList({ companyName, companyPhone, onBadge, onAssistant, onHelp, onPickup, pickupSummary, onChat, chatUnread = 0 }) {
  const tel = (companyPhone || "").trim();
  return (
    <section className="px-6 pt-10 lg:px-0" aria-labelledby="tt-more">
      <SectionHead id="tt-more" title="More" />
      <ul className="divide-y divide-border border-y border-border">
        {/* Also here so the chat is reachable before a stop is chosen. */}
        {onChat && <MoreRow icon={MessageCircle} title="Chat with your driver" sub={chatUnread > 0 ? `${chatUnread} unread` : "Your driver and the people on this bus"} onClick={onChat} />}
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

function OverlayBusRow({ bus, stop, now }) {
  const tracking = bus.tracking_active && bus.current_lat != null && freshnessOf(bus.last_location_update, { now }).state !== "lost";
  const origin = tracking ? { lat: bus.current_lat, lng: bus.current_lng } : null;
  const dest = stop?.lat != null ? { lat: stop.lat, lng: stop.lng } : null;
  const { mins } = useDrivingEta(origin, dest, bus.speed || 25);
  const num = busNumber(bus.name);
  return (
    <li>
      <Link to={`/route-explorer?bus=${encodeURIComponent(bus.id)}`} className="flex min-h-[52px] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary font-display text-title-sm font-semibold tabular-nums" aria-hidden="true">{num || <Bus className="h-4 w-4" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-semibold">{bus.name}</span>
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", tracking ? "bg-success" : "bg-offline")} aria-hidden="true" />
            {tracking ? "On route" : "Not tracking"}
          </span>
        </span>
        {tracking && mins != null && (
          <span className="shrink-0 text-right">
            <span className="block font-display text-title-sm font-semibold tabular-nums">{Math.max(1, Math.round(mins))} min</span>
            <span className="block text-caption text-muted-foreground">to {stop.name}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

// Over the desktop map: the other buses that serve your stop, with how far
// away each is (same road estimate as the arrival time).
export function OtherBusesOverlay({ buses, stop, now = Date.now() }) {
  if (!buses.length || !stop) return null;
  return (
    <section className="rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur" aria-labelledby="tt-overlay-buses">
      <div className="mb-1 flex items-baseline justify-between gap-2 px-2">
        <h2 id="tt-overlay-buses" className="text-body-sm font-bold">Other buses on this route</h2>
        <Link to="/buses" className="text-caption font-semibold text-muted-foreground hover:text-foreground">View all</Link>
      </div>
      <ul>{buses.slice(0, 4).map((b) => <OverlayBusRow key={b.id} bus={b} stop={stop} now={now} />)}</ul>
    </section>
  );
}

// Floating chat button for the passenger app. On Home it opens the chat
// sheet; on other pages it goes to Home with the chat open.
export function PassengerChatBubble({ unread = 0, open = false, onClick }) {
  const navigate = useNavigate();
  const cls = "fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 grid h-14 w-14 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-accent md:bottom-6";
  const badge = unread > 0 && (
    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-caption font-bold text-danger-foreground" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
  );
  const label = unread > 0 ? `Open passenger chat, ${unread} unread` : "Open passenger chat";
  return (
    <button type="button" aria-label={label} aria-expanded={open} onClick={onClick || (() => navigate("/staff?sheet=chat"))} className={cls}>
      <MessageCircle className="h-6 w-6" aria-hidden="true" />{badge}
    </button>
  );
}

// The live map stays closed until asked for, which saves data and battery.
export function MapToggle({ open, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="text-body-sm font-semibold underline-offset-4 hover:underline">
      {open ? "Hide map" : "Show map"}
    </button>
  );
}

export function MapClosed({ onOpen, children }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-5">
      <p className="text-body-sm text-muted-foreground">{children}</p>
      <button type="button" onClick={onOpen} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-card px-4 text-body-sm font-semibold hover:bg-accent">
        <MapIcon className="h-4 w-4" aria-hidden="true" /> Show map
      </button>
    </div>
  );
}
