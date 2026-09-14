import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Megaphone, Send } from "lucide-react";

const DEFAULT_MESSAGE =
  "There is a delay with today's service. We apologise for the inconvenience and will update shortly.";

// Posts a real in-app Broadcast (the same channel StaffAlerts/Notifications
// already show) instead of the old approach — a wa.me link with no
// recipient, which just handed the manager an unaddressed message to send
// manually. This reaches every staff/passenger currently in the app instantly.
export default function DelayBroadcast() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await base44.entities.Broadcast.create({ type: "info", title: "Delay notice", message: message.trim() });
      toast({ title: "Delay notice sent", description: "Staff and passengers will see it in their alerts." });
      setOpen(false);
    } catch (e) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Megaphone className="w-4 h-4 mr-2" /> Broadcast group delay
      </Button>
    );
  }

  return (
    <div className="w-full sm:w-96 space-y-2 p-3 rounded-xl border bg-card">
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
        <Button size="sm" onClick={send} disabled={sending || !message.trim()}>
          <Send className="w-3.5 h-3.5 mr-1.5" /> {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
