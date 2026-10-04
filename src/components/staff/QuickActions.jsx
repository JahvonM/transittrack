import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Clock, BellOff, MessageCircle, KeyRound, Phone } from "lucide-react";
import { endOfToday, hoursFromNow, lateActive, skipActive, LATE_HOURS } from "@/lib/staffFlags";

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Tile({ icon: Icon, label, sub, active, dot, onClick, href }) {
  const cls = `relative shrink-0 w-[84px] sm:w-auto snap-start flex flex-col items-center justify-start gap-1.5 rounded-2xl border px-1.5 py-3 text-center transition-colors min-h-[96px] ${
    active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"
  }`;
  const body = (
    <>
      <span className={`w-9 h-9 rounded-xl grid place-items-center ${active ? "bg-black/10" : "bg-primary/15 text-primary"}`}>
        <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
      </span>
      <span className="text-xs font-semibold leading-tight">{label}</span>
      {sub && <span className={`text-[11px] leading-tight ${active ? "opacity-80" : "text-muted-foreground"}`}>{sub}</span>}
      {dot > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold grid place-items-center">
          {dot > 9 ? "9+" : dot}
        </span>
      )}
    </>
  );
  if (href) return <a href={href} className={cls}>{body}</a>;
  return <button type="button" onClick={onClick} className={cls} aria-pressed={active ?? undefined}>{body}</button>;
}

// Running late / skip today, saved on the passenger's account. Shared by the
// quick actions here and the passenger home's trip actions.
export function useStaffFlags() {
  const { user, checkUserAuth } = useAuth();
  const { toast } = useToast();
  const [override, setOverride] = useState({});

  const merged = { ...user, ...override };
  const late = lateActive(merged);
  const skip = skipActive(merged);

  const save = async (patch, message) => {
    setOverride((o) => ({ ...o, ...patch }));
    try {
      await base44.auth.updateMe(patch);
      await checkUserAuth?.();
      setOverride({});
      if (message) toast(message);
    } catch {
      setOverride({});
      toast({ title: "Couldn't update that", description: "Check your connection and try again.", variant: "destructive" });
    }
  };

  const toggleLate = () =>
    late
      ? save({ late_snooze_active: false, late_until: null }, { title: "Thanks, you're on time" })
      : save({ late_snooze_active: true, late_until: hoursFromNow(LATE_HOURS) }, { title: "Driver notified", description: `They'll see you're running late for the next ${LATE_HOURS} hours.` });

  const toggleSkip = () =>
    skip
      ? save({ skip_pickup_today: false, skip_pickup_until: null }, { title: "Pickup back on for today" })
      : save({ skip_pickup_today: true, skip_pickup_until: endOfToday() }, { title: "Skipping today's pickup", description: "Your pickup turns back on automatically tomorrow." });

  return { late, skip, lateUntil: merged.late_until, toggleLate, toggleSkip };
}

// One-tap actions under the "Your bus" card. Late and Skip switch themselves
// off (after LATE_HOURS / at midnight) so nobody gets left behind tomorrow.
export default function QuickActions({ onChat, chatUnread = 0, onBadge, companyPhone }) {
  const { late, skip, lateUntil, toggleLate, toggleSkip } = useStaffFlags();
  const tel = (companyPhone || "").trim();

  return (
    <div className="-mx-4 px-4 flex gap-2 overflow-x-auto snap-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:grid sm:grid-cols-5 sm:overflow-visible">
      <Tile icon={Clock} label={late ? "Running late" : "I'm late"} sub={late ? `until ${time(lateUntil)}` : null} active={late} onClick={toggleLate} />
      <Tile icon={BellOff} label={skip ? "Skipping" : "Skip today"} sub={skip ? "back tomorrow" : null} active={skip} onClick={toggleSkip} />
      <Tile icon={MessageCircle} label="Chat" sub="with driver" dot={chatUnread} onClick={onChat} />
      <Tile icon={KeyRound} label="No badge?" sub="get a code" onClick={onBadge} />
      {tel && <Tile icon={Phone} label="Call" sub="operator" href={`tel:${tel}`} />}
    </div>
  );
}
