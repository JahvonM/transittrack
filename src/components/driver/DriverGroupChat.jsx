import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Users } from "lucide-react";

// One-tap canned messages so a driver can update the group without typing
// while driving — tapping sends immediately.
const QUICK_REPLIES = [
  "Running late",
  "On the way",
  "Almost there",
  "Arrived at stop",
  "Stuck in traffic",
  "Vehicle issue — delay expected",
];

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export default function DriverGroupChat({ session, invoke }) {
  const messages = session?.group_messages || [];
  const [text, setText] = useState("");
  const [localMessages, setLocalMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  // Drop optimistic local echoes once the server's own copy shows up (next heartbeat).
  useEffect(() => {
    if (messages.length === 0) return;
    setLocalMessages((prev) => prev.filter((lm) => !messages.some((m) => m.text === lm.text && m.sender_role === "driver")));
  }, [messages]);

  const allMessages = [...messages, ...localMessages].sort(
    (a, b) => new Date(a.created_date) - new Date(b.created_date)
  );

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [allMessages.length]);

  const send = async (value) => {
    const trimmed = (value ?? text).trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await invoke("send_group_message", { text: trimmed });
      setLocalMessages((prev) => [...prev, {
        id: `local-${Date.now()}`, text: trimmed, sender_role: "driver",
        created_date: new Date().toISOString(),
      }]);
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="w-4 h-4" /> Chat with staff riding this bus
      </div>
      <Card>
        <CardContent className="p-3 space-y-2 max-h-[45vh] overflow-y-auto">
          {allMessages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No messages yet — say hello or send a quick update below.
            </p>
          )}
          {allMessages.map((m) => (
            <div key={m.id} className={`flex ${m.sender_role === "driver" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                m.sender_role === "driver" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}>
                {m.sender_role !== "driver" && (
                  <div className="text-xs font-medium opacity-70 mb-0.5">{m.sender_name || "Staff"}</div>
                )}
                <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                <div className={`text-[11px] mt-0.5 ${m.sender_role === "driver" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {formatTime(m.created_date)}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {QUICK_REPLIES.map((q) => (
          <Button key={q} type="button" variant="outline" size="sm" disabled={sending} onClick={() => send(q)}>
            {q}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <Button onClick={() => send()} disabled={sending || !text.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
