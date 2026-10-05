import React, { useState } from "react";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  ["Ocean", "#dbeafe", "#1e3a8a", "#a66a42"],
  ["Lime", "#ecfccb", "#365314", "#dcab82"],
  ["Sunset", "#ffedd5", "#9a3412", "#805038"],
  ["Violet", "#ede9fe", "#5b21b6", "#e5b793"],
  ["Rose", "#fce7f3", "#9d174d", "#b77b54"],
  ["Slate", "#e2e8f0", "#334155", "#f0c7a2"],
];
function portrait([, background, shirt, skin], index) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="32" fill="${background}"/><path d="M36 256v-24c0-60 184-60 184 0v24" fill="${shirt}"/><rect x="109" y="150" width="38" height="42" rx="12" fill="${skin}"/><ellipse cx="128" cy="111" rx="53" ry="65" fill="${skin}"/><path d="${index % 2 ? "M74 116V81c0-69 111-65 111 0v35l-20-45-48 13-28-13Z" : "M75 94c-6-75 113-76 107 0l-20-26-25 16-25-12-27 24Z"}" fill="#292524"/><circle cx="108" cy="112" r="5" fill="#292524"/><circle cx="148" cy="112" r="5" fill="#292524"/><path d="M113 140q15 15 30 0" fill="none" stroke="#713f32" stroke-width="5" stroke-linecap="round"/></svg>`;
}
export default function AvatarPicker({ onChange, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = async (option, index) => {
    setBusy(true); setError("");
    try {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(portrait(option, index));
      await img.decode();
      const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
      canvas.getContext("2d").drawImage(img, 0, 0);
      onChange(canvas.toDataURL("image/png"));
    } catch { setError("Could not create avatar. Try again."); }
    finally { setBusy(false); }
  };
  return <fieldset disabled={disabled || busy} className="space-y-2">
    <legend className="text-sm font-medium">Use an avatar instead of a photo</legend>
    <div className="flex flex-wrap gap-2">{OPTIONS.map((option, index) => <button key={option[0]} type="button" aria-label={option[0] + " avatar"} className="w-12 h-12 rounded-xl border overflow-hidden hover:ring-2 hover:ring-primary disabled:opacity-50" onClick={() => choose(option, index)}>
      <img src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(portrait(option, index))} alt="" className="w-full h-full" />
    </button>)}</div>
    <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>Use initials / no photo</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </fieldset>;
}
