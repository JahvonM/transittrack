import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, X, Send } from "lucide-react";

export default function DriverMessageAlert({ alert, onAcknowledge, onReply }) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  if (!alert) return null;

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await onReply(reply.trim());
      setReply("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl p-6 space-y-4 animate-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {alert.is_reply ? "" : alert.driver_email ? "Message from dispatch" : "Broadcast"}
              </p>
              <h2 className="text-lg font-heading font-semibold">{alert.title || "New message"}</h2>
            </div>
          </div>
          <button onClick={onAcknowledge} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-base text-foreground whitespace-pre-wrap">{alert.message}</p>

        {alert.vehicle_name && (
          <p className="text-xs text-muted-foreground">Re: {alert.vehicle_name}</p>
        )}

        <div className="space-y-2 border-t pt-4">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type a reply to dispatch…"
            rows={2}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onAcknowledge}>Acknowledge</Button>
            <Button onClick={send} disabled={sending || !reply.trim()}>
              {sending ? "Sending…" : (<><Send className="w-4 h-4 mr-1.5" />Reply</>)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}