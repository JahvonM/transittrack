import React, { useEffect, useState } from "react";
import { Bell, BellOff, Clock, FileText, Loader2, LogOut, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { expiryState, hoursText, weekHours } from "@/lib/driverPhone";

const KIND = { license: "Driving licence", insurance: "Insurance" };
const TONE = { success: "text-success", warning: "text-warning", danger: "text-danger", neutral: "text-muted-foreground" };

export default function MeTab({ me, documents, docsLoaded, onLoadDocs, shifts, onLoadHours, notifications, onEnableNotifications, onSignOut }) {
  const [opening, setOpening] = useState("");
  const [enabling, setEnabling] = useState(false);
  useEffect(() => { onLoadDocs(); onLoadHours?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const week = weekHours(shifts || []);
  const recent = (shifts || []).slice(0, 5);

  // Links to the document files only work for two minutes, so fetch fresh
  // ones right before opening.
  const open = async (doc) => {
    setOpening(doc.id);
    try {
      const fresh = await onLoadDocs();
      const url = fresh?.find((d) => d.id === doc.id)?.url;
      if (url) window.open(url, "_blank", "noopener");
    } finally {
      setOpening("");
    }
  };
  const enable = async () => {
    setEnabling(true);
    try { await onEnableNotifications(); } finally { setEnabling(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4" aria-label="You">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-title font-bold">
          {me?.driver?.photo_url ? <img src={me.driver.photo_url} alt="" className="h-full w-full object-cover" /> : (me?.driver?.name || "?").slice(0, 1)}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-title">{me?.driver?.name}</h1>
          <p className="truncate text-body-sm text-muted-foreground">{me?.company?.name}</p>
          <p className="flex items-center gap-1.5 truncate text-body-sm text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {me?.driver?.email}</p>
          {me?.driver?.phone && <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {me.driver.phone}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4" aria-label="Hours">
        <h2 className="mb-1 flex items-center gap-2 text-title-sm font-bold"><Clock className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> Hours this week</h2>
        {!shifts ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading hours" />
        ) : (
          <>
            <p className="text-headline tabular-nums">{hoursText(week.minutes)}</p>
            <p className="text-body-sm text-muted-foreground">{week.count} shift{week.count === 1 ? "" : "s"} since Monday, from the shifts you started and ended.</p>
            {recent.length > 0 && (
              <ul className="mt-3 divide-y divide-border">
                {recent.map((s) => (
                  <li key={s.id} className="py-2 text-body-sm">
                    <span className="block truncate font-semibold">
                      {new Date(s.started_at).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · {s.vehicle_name || "Bus"}
                    </span>
                    <span className="block tabular-nums text-muted-foreground">
                      {new Date(s.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{s.ended_at ? new Date(s.ended_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"}
                      {s.minutes != null ? ` · ${hoursText(s.minutes)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4" aria-label="My documents">
        <h2 className="mb-3 flex items-center gap-2 text-title-sm font-bold"><FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> My documents</h2>
        {!docsLoaded ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading documents" />
        ) : documents.length === 0 ? (
          <p className="text-muted-foreground">No documents on file. Your administrator adds your licence and insurance.</p>
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => {
              const state = expiryState(d.expiry_date);
              return (
                <li key={d.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{KIND[d.kind] || "Document"}{d.document_number ? ` · ${d.document_number}` : ""}</p>
                    <p className={cn("text-body-sm font-medium", TONE[state.tone])}>{state.text}</p>
                  </div>
                  {(d.url || d.file_name) && (
                    <button type="button" onClick={() => open(d)} disabled={opening === d.id}
                      className="min-h-[44px] rounded-xl border border-border px-3 font-semibold hover:bg-accent disabled:opacity-60">
                      {opening === d.id ? "Opening…" : "View"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4" aria-label="Notifications">
        <h2 className="mb-1 flex items-center gap-2 text-title-sm font-bold">
          {notifications === "on" ? <Bell className="h-5 w-5 text-success" aria-hidden="true" /> : <BellOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
          Notifications
        </h2>
        {notifications === "on" ? (
          <p className="text-muted-foreground">On. Messages from dispatch about your bus alert this phone.</p>
        ) : (
          <>
            <p className="mb-3 text-muted-foreground">Turn on to get dispatch messages even when the app is closed.</p>
            <button type="button" onClick={enable} disabled={enabling}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">
              {enabling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Turn on notifications
            </button>
          </>
        )}
      </section>

      <p className="px-1 text-body-sm text-muted-foreground">
        This app never sends your location. It uses the phone's GPS only during your shift, to hide the screens while the bus is moving.
      </p>

      <button type="button" onClick={onSignOut} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border font-semibold hover:bg-accent">
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
      </button>
    </div>
  );
}
