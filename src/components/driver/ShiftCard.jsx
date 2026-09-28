import React, { useEffect, useState } from "react";
import { Clock, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";

function formatDuration(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// Start / end the driver's shift. The open shift comes back on every
// heartbeat, so the timer survives reloads and tablet restarts.
export default function ShiftCard({ session, invoke, refresh }) {
  const { toast } = useToast();
  const [shift, setShift] = useState(session?.open_shift || null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { if (!busy) setShift(session?.open_shift || null); }, [session?.open_shift, busy]);
  useEffect(() => {
    if (!shift) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [shift]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await invoke("start_shift");
      setShift(res?.shift || null);
      setNow(Date.now());
      toast({ title: "Shift started", description: "Have a safe drive." });
      refresh?.();
    } catch {
      toast({ title: "Couldn't start the shift", description: "Check the connection and try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!(await confirmAction({ title: "End your shift?", description: "Your hours for this shift will be saved.", confirmLabel: "End shift" }))) return;
    setBusy(true);
    try {
      const res = await invoke("end_shift");
      const mins = res?.shift?.duration_minutes;
      setShift(null);
      toast({ title: "Shift ended", description: mins != null ? `Logged ${formatDuration(mins * 60000)}.` : undefined });
      refresh?.();
    } catch {
      toast({ title: "Couldn't end the shift", description: "Check the connection and try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const since = shift ? new Date(shift.started_at) : null;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl border border-border bg-card">
      <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${shift ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        <Clock className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        {shift ? (
          <>
            <p className="font-semibold">On shift · {formatDuration(now - since.getTime())}</p>
            <p className="text-xs text-muted-foreground">
              Started {since.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">Off shift</p>
            <p className="text-xs text-muted-foreground">Start your shift so your hours are logged.</p>
          </>
        )}
      </div>
      {shift ? (
        <Button variant="outline" onClick={end} disabled={busy} className="min-h-[44px]">
          <Square className="w-4 h-4" /> End shift
        </Button>
      ) : (
        <Button onClick={start} disabled={busy} className="min-h-[44px]">
          <Play className="w-4 h-4" /> Start shift
        </Button>
      )}
    </div>
  );
}
