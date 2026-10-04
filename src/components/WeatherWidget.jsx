import React, { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Sun,
} from "lucide-react";

const conditionFor = (code) => {
  if (code <= 1) return { label: "Clear sky", Icon: Sun };
  if (code === 2) return { label: "Partly cloudy", Icon: CloudSun };
  if (code === 3) return { label: "Cloudy", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Foggy", Icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: "Drizzle", Icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Rain", Icon: CloudRain };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", Icon: CloudSnow };
  if (code >= 95) return { label: "Thunderstorm", Icon: CloudLightning };
  return { label: "Weather", Icon: Cloud };
};

const PILL =
  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 backdrop-blur-[12px]";

export default function WeatherWidget({ variant = "hero" }) {
  const [state, setState] = useState({ status: "locating" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ status: "off" });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current=temperature_2m,weather_code&timezone=auto`
          );
          const data = await res.json();
          setState({
            status: "ready",
            temp: Math.round(data.current.temperature_2m),
            code: data.current.weather_code,
          });
        } catch {
          setState({ status: "off" });
        }
      },
      () => setState({ status: "off" }),
      { timeout: 8000 }
    );
  }, [attempt]);

  if (state.status === "ready") {
    const { label, Icon } = conditionFor(state.code);
    const hero = variant === "hero";
    return (
      <div
        className={`${PILL} ${hero ? "px-4 py-2 bg-success/15 border-success/30 shadow-[0_0_20px_-6px_rgba(34,197,94,0.45)]" : ""}`}
      >
        <Icon className={`w-4 h-4 ${hero ? "text-success" : "text-primary"}`} />
        <span className="text-sm">
          {state.temp}°C · {label}
        </span>
      </div>
    );
  }

  if (state.status === "locating") {
    return (
      <div className={`${PILL} text-muted-foreground text-xs`}>
        <MapPin className="w-3.5 h-3.5 animate-pulse" />
        Checking weather…
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAttempt((a) => a + 1)}
      className={`${PILL} text-muted-foreground text-xs hover:text-foreground transition-colors`}
    >
      <MapPin className="w-3.5 h-3.5" />
      Turn on location for local weather
    </button>
  );
}