import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Inbox, ChevronLeft, Send, MessageSquare, Reply } from "lucide-react";

export default function DriverMessages({ session, invoke }) {
  const [selected, setSelected] = useState(null);
  const [localReplies, setLocalReplies] = useState([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const broadcasts = session?.broadcasts || [];

  // Remove local replies once they appear in server data
  useEffect(() => {
    if (broadcasts.length === 0) return;
    setLocalReplies((prev) =>
      prev.filter((lr) => !broadcasts.some((b) => b.message === lr.message && b.is_reply))
    );
  }, [broadcasts]);

  const allMessages = [...localReplies, ...broadcasts].sort(
    (a, b) => new Date(b.created_date) - new Date(a.created_date)
  );

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await invoke("send_broadcast", { message: reply.trim() });
      setLocalReplies((prev) => [
        {
          id: `local-${Date.now()}`,
          message: reply.trim(),
          is_reply: true,
          created_date: new Date().toISOString(),
          title: "Reply",
        },
        ...prev,
      ]);
      setReply("");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  // Detail view
  if (selected) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to inbox
        </Button>
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span
                className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
                  selected.is_reply ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                }`}
              >
                {selected.is_reply ? <Reply className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {selected.is_reply ? "Your reply" : selected.driver_email ? "From dispatch" : "Broadcast"}
                </p>
                <h3 className="font-heading font-semibold text-lg">{selected.title || "Message"}</h3>
                <p className="text-xs text-muted-foreground">{formatTime(selected.created_date)}</p>
              </div>
            </div>
            <p className="text-base text-foreground whitespace-pre-wrap pt-2">{selected.message}</p>
            {selected.vehicle_name && (
              <p className="text-xs text-muted-foreground">Re: {selected.vehicle_name}</p>
            )}
          </CardContent>
        </Card>

        {!selected.is_reply && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type a reply to dispatch…"
                rows={3}
              />
              <div className="flex justify-end">
                <Button onClick={handleReply} disabled={sending || !reply.trim()}>
                  {sending ? "Sending…" : (<><Send className="w-4 h-4 mr-1.5" /> Send reply</>)}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Inbox list view
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Inbox className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-heading font-semibold text-lg">Inbox</h2>
        <span className="text-sm text-muted-foreground ml-auto">
          {allMessages.length} {allMessages.length === 1 ? "message" : "messages"}
        </span>
      </div>
      {allMessages.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No messages yet.</p>
          </CardContent>
        </Card>
      ) : (
        allMessages.map((msg) => (
          <Card
            key={msg.id}
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => setSelected(msg)}
          >
            <CardContent className="p-4 flex items-start gap-3">
              <span
                className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${
                  msg.is_reply ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                }`}
              >
                {msg.is_reply ? <Reply className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">
                    {msg.title || (msg.is_reply ? "Your reply" : "Message")}
                  </p>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatTime(msg.created_date)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{msg.message}</p>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}