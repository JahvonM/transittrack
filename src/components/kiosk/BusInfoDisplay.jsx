import "./boardingShowcase.css";
import "./busInfoDisplay.css";
import React, { useEffect, useMemo, useState } from "react";
import { Bus, Clock, MapPin, Megaphone, Users } from "lucide-react";
import useFutureAppearance from "@/hooks/useFutureAppearance";
import WeatherWidget from "@/components/WeatherWidget";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { formatEta } from "@/lib/geo";
import { nearestStopOf, orderedStops, positionState } from "@/lib/busInfo";
import { TopStatusBar } from "./BusBoardingKiosk";
import BoardingSettingsGate, { useHold } from "./BoardingSettingsGate";

const clock = (iso) => new Date(iso).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit" });

// The in-bus passenger information screen: a boarding device set to the
// "Passenger information screen" layout. It only shows; nobody taps here,
// and it keeps no passenger list. Staff open its settings the same way as
// on the boarding tablet (hold the top bar, then the bus PIN).
export default function BusInfoDisplay({ device, online, invoke }) {
  useFutureAppearance();
  const [now, setNow] = useState(() => new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adIndex, setAdIndex] = useState(0);
  const hold = useHold(() => setSettingsOpen(true));
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  const context = device?.context || {};
  const vehicle = context.vehicle || null;
  const route = context.route || null;
  const ads = context.ads || [];
  useEffect(() => {
    if (ads.length < 2) return undefined;
    const t = setInterval(() => setAdIndex((i) => (i + 1) % ads.length), 12_000);
    return () => clearInterval(t);
  }, [ads.length]);
  const position = positionState(vehicle, now.getTime());
  const nearest = useMemo(() => (position === "none" ? null : nearestStopOf(vehicle, route)), [vehicle, route, position]);
  const stops = orderedStops(route);
  const occupancy = context.occupancy || 0;
  const capacity = vehicle?.capacity || 0;
  const ad = ads.length ? ads[adIndex % ads.length] : null;

  return (
    <div className="tt-boarding-showcase tt-info-display" data-layout="info">
      <TopStatusBar device={device} vehicle={vehicle} route={route} now={now} online={online} holdProps={hold} />
      <BoardingSettingsGate open={settingsOpen} onClose={() => setSettingsOpen(false)} deviceId={device?.device_id || device?.id} invoke={invoke} device={device} online={online} />
      <main className="tt-info-grid">
        <section className="tt-board-panel tt-info-stop" aria-label="Where the bus is">
          <p><MapPin size={18} aria-hidden="true" /> {nearest ? "Nearest stop" : "This bus"}</p>
          {nearest ? (
            <>
              <strong>{nearest.name}</strong>
              <small>{position !== "live" ? `Last known position at ${clock(vehicle.last_location_update)}` : nearest.mins < 1 ? "At or near this stop" : `About ${formatEta(nearest.mins)} away`}</small>
            </>
          ) : (
            <>
              <strong>{vehicle?.name || device?.vehicle_name || "Your bus"}</strong>
              <small>{position === "none" ? "Bus position not available right now" : "No stop locations on this route yet"}</small>
            </>
          )}
        </section>
        <section className="tt-board-panel tt-info-route" aria-label="Route stops">
          <p><Bus size={18} aria-hidden="true" /> {route?.name || "Route"}</p>
          {stops.length ? (
            <ol>
              {stops.map((s, i) => (
                <li key={`${s.name}-${i}`} aria-current={nearest && nearest.name === s.name ? "location" : undefined}>
                  <span className="tt-info-dot" aria-hidden="true" />{s.name}
                </li>
              ))}
            </ol>
          ) : <small>This bus has no route stops set.</small>}
        </section>
        <aside className="tt-info-side" aria-label="On this bus">
          <section className="tt-board-panel tt-board-occupancy" aria-label="How full the bus is">
            <p><Users size={16} aria-hidden="true" /> On board</p>
            <strong>{occupancy}<small>{capacity ? ` / ${capacity}` : ""}</small></strong>
            <div className="tt-board-meter"><i style={{ width: capacity ? Math.min(100, (occupancy / capacity) * 100) + "%" : "0%" }} /></div>
            <span>From passengers' taps</span>
          </section>
          <section className="tt-board-panel"><p><Clock size={16} aria-hidden="true" /> Weather</p><WeatherWidget variant="hero" /></section>
          {ad && (
            <section className="tt-board-panel tt-info-ad" aria-label="Announcement" aria-live="polite">
              <p><Megaphone size={16} aria-hidden="true" /> Announcement</p>
              {ad.image_url && <img src={ad.image_url} alt="" />}
              <strong>{ad.title}</strong>
              {ad.message && <small>{ad.message}</small>}
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
