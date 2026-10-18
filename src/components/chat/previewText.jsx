import React from "react";
import { Camera, Mic } from "lucide-react";

// A message as one line in a chat list: its text, or "Photo" / "Voice note".
export function previewText(m) {
  if (!m) return "";
  if (m.message_type === "image") return <><Camera className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Photo</>;
  if (m.message_type === "audio") return <><Mic className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Voice note</>;
  return m.text;
}
