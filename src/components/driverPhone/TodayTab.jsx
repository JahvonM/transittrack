import React from "react";
import { Bus, CircleCheck, ClipboardCheck, Clock, Megaphone, MessageCircle, Phone, Play, Radio, Route as RouteIcon, Square, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { telLink, whatsappLink } from "@/lib/driverPhone";

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const day = (iso) => (iso ? new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "");
function duration(fromIso, toIso) {
  const mins = Math.max(0, Math.round((new Date(toIso || Date.now()) - new Date(fromIso)) / 60000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

function Section({ title, icon: Icon, children, className }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)} aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 text-title-sm font-bold">
        {Icon && <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />} {title}
      </h2>
      {children}
    </section>
  );
}

function ContactRow({ label, phone }) {
  const tel = telLink(phone);
  const wa = whatsappLink(phone);
  if (!tel) return null;
  return (
    <li className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
      <a href={tel} className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 font-semibold hover:bg-accent">
        <Phone className="h-4 w-4" aria-hidden="true" /> Call
      </a>
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 font-semibold hover:bg-accent">
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
        </a>
      )}
    </li>
  );
}

export default function TodayTab({ today, driverName, onPickBus, onStartShift, onEndShift, onWalkaround, backupSentAt }) {
  const { buses = [], bus, route, pickups = [], shift, last_shift: lastShift, notices = [], contacts, workplace, walkaround } = today || {};
  const first = (driverName || "").split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const stops = route?.stops || [];
  const riding = pickups.filter((p) => !p.skipping);
  const atStop = (name) => riding.filter((p) => p.stop === name);
  const noPoint = riding.filter((p) => !p.stop);
  const skipping = pickups.filter((p) => p.skipping);
  const hasContacts = telLink(contacts?.dispatch_phone) || telLink(contacts?.manager_phone);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-body-sm text-muted-foreground">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="text-headline">{greeting}, {first}</h1>
      </header>

      {!bus ? (
        <Section title="No bus assigned" icon={Bus}>
          <p className="text-body text-muted-foreground">Your administrator hasn't assigned you a bus yet. Messages and reports still reach dispatch.</p>
        </Section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4" aria-label="Your bus">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary" aria-hidden="true"><Bus className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-title font-bold">{bus.name}</p>
              <p className="truncate text-body-sm text-muted-foreground">
                {[bus.plate_number, bus.fleet_number && `No. ${bus.fleet_number}`].filter(Boolean).join(" · ") || "Your bus"}
              </p>
            </div>
          </div>
          {buses.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose a bus">
              {buses.map((b) => (
                <button key={b.id} type="button" onClick={() => onPickBus(b.id)} aria-pressed={b.id === bus.id}
                  className={cn("min-h-[40px] rounded-full border px-3 text-body-sm font-semibold", b.id === bus.id ? "border-primary bg-primary/12" : "border-border hover:bg-accent")}>
                  {b.name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-xl bg-secondary p-3">
            {shift ? (
              <p className="flex items-center gap-2 font-semibold">
                <CircleCheck className="h-5 w-5 text-success" aria-hidden="true" />
                {shift.mine ? "On shift" : `${shift.driver_name || "Another driver"} is on shift`} since {time(shift.started_at)} · {duration(shift.started_at)}
              </p>
            ) : (
              <p className="flex items-center gap-2 font-semibold">
                <Clock className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> Not on shift
              </p>
            )}
            {!shift && lastShift?.started_at && (
              <p className="mt-1 text-body-sm text-muted-foreground">
                Last shift: {day(lastShift.started_at)}, {time(lastShift.started_at)} to {time(lastShift.ended_at)} ({duration(lastShift.started_at, lastShift.ended_at)})
              </p>
            )}
            <p className="mt-1 flex items-center gap-2 text-body-sm text-muted-foreground">
              <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              {walkaround ? `Walk-around done at ${time(walkaround.created_date)}${walkaround.status === "failed" ? ", problems reported" : ""}` : "Walk-around not done today"}
              {!walkaround && onWalkaround && <button type="button" onClick={onWalkaround} className="ml-auto font-semibold text-foreground underline underline-offset-2">Do it now</button>}
            </p>
          </div>
          {!shift && onStartShift && (
            <button type="button" onClick={onStartShift} className="mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-title-sm font-bold text-primary-foreground">
              <Play className="h-5 w-5" aria-hidden="true" /> Start shift
            </button>
          )}
          {shift?.mine && onEndShift && (
            <button type="button" onClick={onEndShift} className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-border font-semibold hover:bg-accent">
              <Square className="h-4 w-4" aria-hidden="true" /> End shift
            </button>
          )}
        </section>
      )}

      {today?.backup_gps && shift?.mine && (
        <section role="status" className="rounded-2xl border border-primary/60 bg-primary/10 p-4" aria-label="Backup GPS">
          <p className="flex items-center gap-2 text-title-sm font-bold"><Radio className="h-5 w-5 text-primary" aria-hidden="true" /> Backup GPS is on</p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Dispatch switched the bus position to this phone for your shift. Keep this app open and the phone on charge.
            {backupSentAt ? ` Last sent ${backupSentAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}.` : " Waiting for the phone's GPS…"}
          </p>
        </section>
      )}

      {notices.length > 0 && (
        <Section title="From dispatch" icon={Megaphone}>
          <ul className="space-y-3">
            {notices.map((n) => (
              <li key={n.id}>
                {n.title && <p className="font-semibold">{n.title}</p>}
                <p className="text-body-sm text-muted-foreground">{n.message}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {bus && (
        <Section title={route?.name || "No route assigned"} icon={RouteIcon}>
          {!route ? (
            <p className="text-body text-muted-foreground">Ask dispatch to give this bus a route.</p>
          ) : (
            <>
              <p className="-mt-2 mb-3 text-body-sm text-muted-foreground">
                {stops.length} stop{stops.length === 1 ? "" : "s"} · {riding.length} pickup{riding.length === 1 ? "" : "s"} today
                {workplace?.name ? ` · drop-off at ${workplace.name}` : ""}
              </p>
              <ol className="relative space-y-0">
                {stops.map((s, i) => {
                  const people = atStop(s.name);
                  return (
                    <li key={`${s.name}-${i}`} className="flex gap-3 pb-4 last:pb-0">
                      <span className="flex flex-col items-center">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-secondary text-caption font-bold">{i + 1}</span>
                        {i < stops.length - 1 && <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="font-semibold">{s.name}</p>
                        {people.length > 0 ? (
                          <p className="text-body-sm text-muted-foreground">
                            Pick up {people.map((p) => p.name + (p.late ? " (running late)" : "")).join(", ")}
                          </p>
                        ) : (
                          <p className="text-body-sm text-muted-foreground">No pickups</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {noPoint.length > 0 && (
                <p className="mt-3 text-body-sm text-muted-foreground">No pickup point set: {noPoint.map((p) => p.name).join(", ")}</p>
              )}
              {skipping.length > 0 && (
                <p className="mt-2 flex items-start gap-2 text-body-sm text-muted-foreground">
                  <UserX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Not riding today: {skipping.map((p) => p.name).join(", ")}
                </p>
              )}
            </>
          )}
        </Section>
      )}

      {hasContacts && (
        <Section title="Call for help" icon={Phone}>
          <ul className="space-y-2">
            <ContactRow label="Dispatch" phone={contacts?.dispatch_phone} />
            <ContactRow label="Manager" phone={contacts?.manager_phone} />
          </ul>
        </Section>
      )}
    </div>
  );
}
