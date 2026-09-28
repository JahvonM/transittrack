import React from "react";
import { Hand } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import LiveClock from "@/components/LiveClock";
import WeatherWidget from "@/components/WeatherWidget";

const greetingWord = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

export default function Greeting({ subtitle }) {
  const { user } = useAuth();
  const name = (user?.full_name || user?.email || "").split("@")[0].split(" ")[0] || "there";
  const dateStr = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-5 rounded-2xl border border-border bg-card/60 backdrop-blur-[12px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-primary mb-1">{dateStr}</p>
          <h2 className="text-2xl font-heading font-semibold">
            {greetingWord()}, {name} <Hand className="inline-block w-6 h-6 ml-1 -mt-1 text-primary tt-wave" aria-hidden="true" />
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <WeatherWidget variant="chip" />
          <LiveClock className="text-lg font-mono" />
        </div>
      </div>
    </div>
  );
}