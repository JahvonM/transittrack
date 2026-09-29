import React, { useState } from "react";
import { Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ACCENTS, applyAccent, currentAccent } from "@/lib/accents";

// Colour theme picker. Applies instantly on this device and is saved to the
// account so it follows the person to their other devices.
export default function AccentPicker() {
  const { user } = useAuth();
  const [selected, setSelected] = useState(currentAccent);

  const choose = (id) => {
    setSelected(applyAccent(id));
    if (user) base44.auth.updateMe({ theme_accent: id }).catch(() => {});
  };

  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2" role="radiogroup" aria-label="Colour theme">
      {ACCENTS.map((a) => {
        const active = selected === a.id;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(a.id)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
          >
            <span className="relative w-9 h-9 rounded-full grid place-items-center shadow-inner" style={{ background: a.swatch }}>
              {active && <Check className="w-4 h-4 text-black" strokeWidth={3} />}
            </span>
            <span className="text-xs font-medium">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}
