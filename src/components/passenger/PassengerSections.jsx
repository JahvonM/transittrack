import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bus, MessageCircle, OctagonAlert, Map as MapIcon, TriangleAlert, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Image } from "@/components/ui/image";
import useDrivingEta from "@/hooks/useDrivingEta";
import { freshnessOf } from "@/components/system/status";
import { STATUS_LABEL } from "@/lib/trip";
import { busNumber, clock } from "./passengerState";

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
