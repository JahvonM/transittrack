import React, { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SlideToUnlock from "@/components/kiosk/SlideToUnlock";

// How big the name can be: its longest word must fit across the screen (the
// name wraps between words), and a few lines must fit on a landscape screen.
const nameSize = (text) => {
  const longest = Math.max(...String(text).split(/\s+/).map((w) => w.length), 1);
  return `min(${Math.min(18, 125 / Math.max(longest, 6))}vw, 20vh)`;
};

// The meet-and-greet sign: the tablet full screen, white like a printed arrival
// sign, with the company's logo and the guest's name in letters big enough to
// read across an arrivals hall. With no name it shows just the company, for
// standing by the bus. The driver can change the name on the spot.
//
// It closes with a slide, like a lock screen, so a bump doesn't close it. No
// control sits in the top-right corner: on the kiosk app that corner is the
// hidden "tap 5 times for kiosk settings" area, which takes every tap there.
export default function NameSign({ sign, company, onClose, closeLabel = "Slide to close the sign" }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // Only a different sign resets the name: a boarding tablet gets the same
  // sign again with every check-in, and that mustn't undo a change.
  useEffect(() => {
    if (!sign) return;
    setText(sign.name || "");
    setEditing(false);
  }, [sign?.id, sign?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sign) return null;

  const logo = company?.logo_url && !logoFailed ? company.logo_url : "";
  const companyName = company?.name || "";
  return (
    <div role="dialog" aria-modal="true" aria-label="Name sign" className="fixed inset-0 z-[95] flex flex-col bg-white text-black">
      <div className="absolute left-3 top-3 z-10">
        <Button variant="outline" size="sm" className="h-11 w-11 border-black/15 bg-white/80 p-0 text-black/60 hover:bg-white" onClick={() => setEditing((e) => !e)} aria-label="Change the name" aria-pressed={editing}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <div className={`flex flex-col items-center justify-center px-6 ${text ? "pt-10" : "flex-1"}`}>
        {logo ? (
          <img src={logo} alt={companyName} onError={() => setLogoFailed(true)} className={`${text ? "max-h-[22vh]" : "max-h-[45vh]"} max-w-[80vw] object-contain`} />
        ) : null}
        {companyName && (
          <p className={`mt-3 text-center font-heading font-bold tracking-tight ${logo ? (text ? "text-2xl" : "text-4xl sm:text-5xl") : (text ? "text-4xl" : "text-6xl sm:text-7xl")}`}>{companyName}</p>
        )}
      </div>

      {text && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="font-heading font-extrabold uppercase leading-[1.05] break-words" style={{ fontSize: nameSize(text) }}>{text}</p>
          {sign.subtitle && <p className="mt-4 text-[4vw] font-semibold text-black/60">{sign.subtitle}</p>}
        </div>
      )}

      <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {editing ? (
          <form className="mx-auto flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); setEditing(false); }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Name on the sign" aria-label="Name on the sign" maxLength={60} autoFocus className="h-12 border-black/20 bg-white text-lg text-black" />
            <Button type="submit" className="h-12">Show</Button>
          </form>
        ) : (
          <SlideToUnlock label={closeLabel} onUnlock={onClose} />
        )}
      </div>
    </div>
  );
}
