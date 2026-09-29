import React from "react";
import { Check } from "lucide-react";
import { Vehicle3D } from "@/components/MapBusPin";
import { VEHICLE_MODELS } from "@/lib/vehicleModels";
import { accentHex } from "@/lib/accents";

// Small still 3D preview of a model, angled so the side and roof show.
export function VehicleModelThumb({ model, size = 56 }) {
  const scale = size / 84;
  return (
    <div className="relative overflow-hidden shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <Vehicle3D model={model} heading={235} color={accentHex()} glow={false} />
      </div>
    </div>
  );
}

// Grid of every 3D model with a live preview; the chosen one is highlighted.
export default function VehicleModelPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="3D model on the map">
      {VEHICLE_MODELS.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.id)}
            className={`relative flex flex-col items-center gap-1 rounded-2xl border px-1 pt-1 pb-2 transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
          >
            {active && (
              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground grid place-items-center">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
            )}
            <VehicleModelThumb model={m.id} size={72} />
            <span className="text-xs font-medium leading-tight text-center">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
