import React, { useState } from "react";
import { BellRing, Bus, Car, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND = { bus_arrived: { icon: Bus, title: "Bus arrived" }, taxi_arrived: { icon: Car, title: "Taxi arrived" }, info: { icon: Info, title: "Update" } };
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

// Chats with staff, company, dispatch and mechanic, and the alerts dispatch
// has sent. chats: the existing chat list component.
export default function DriverMessages({ chats, broadcasts = [], hasUnreadChat = false }) {
  const [tab, setTab] = useState("chats");
  const alerts = broadcasts.filter((b) => !b.is_reply).slice(0, 30);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-3 text-title font-bold">Messages</h1>
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-secondary p-1" role="tablist" aria-label="Chats or alerts">
        {[["chats", "Chats"], ["alerts", `Alerts${alerts.length ? ` (${alerts.length})` : ""}`]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("relative h-11 rounded-lg text-body font-semibold transition-colors", tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {label}
            {id === "chats" && hasUnreadChat && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-danger" aria-label="Unread messages" />}
          </button>
        ))}
      </div>
      {tab === "chats" ? (
        <div role="tabpanel">{chats}</div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center" role="tabpanel">
          <BellRing className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-title-sm font-semibold">No alerts</p>
          <p className="mt-1 text-body-sm text-muted-foreground">Messages from dispatch show up here and pop up while you drive.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card" role="tabpanel">
          {alerts.map((a) => {
            const k = KIND[a.type] || KIND.info;
            const Icon = k.icon;
            return (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold">{a.title || k.title}</p>
                    <span className="shrink-0 text-body-sm text-muted-foreground">{time(a.created_date)}</span>
                  </div>
                  <p className="text-body">{a.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
