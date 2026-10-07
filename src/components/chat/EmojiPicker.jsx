import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";

// The emojis people actually reach for in a quick message — reactions, travel
// and status. A full searchable picker would mean another library; this covers
// what a bus chat needs and stays a tap away.
const EMOJIS = [
  "👍", "👎", "👋", "🙏", "🙌", "👌", "💪", "🤝",
  "😀", "😄", "😁", "😂", "🤣", "😊", "🙂", "😉",
  "😍", "🤩", "😎", "🤔", "😐", "😴", "😅", "🥳",
  "😢", "😭", "😡", "🤯", "😮", "🙄", "🤒", "🤗",
  "❤️", "🔥", "✅", "❌", "⚠️", "❗", "❓", "🎉",
  "🚌", "🚕", "🚏", "📍", "🕒", "⏰", "⏳", "🏁",
  "☀️", "🌧️", "🚦", "🛑", "🅿️", "🧭", "🔔", "📞",
];

export default function EmojiPicker({ onPick, disabled }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={disabled} aria-label="Add emoji">
          <Smile className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-md p-1 text-lg leading-none hover:bg-accent"
              aria-label={emoji}
              onClick={() => { onPick(emoji); setOpen(false); }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}