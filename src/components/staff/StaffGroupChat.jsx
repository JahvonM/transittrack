import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Users } from "lucide-react";

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// Chat scoped to one bus — its driver plus the staff riding it. Driver
// messages come through the driverSession backend function (drivers have no
// login); staff post directly since they're logged in, so this side gets
// live updates via subscribe instead of polling.
export default function StaffGroupChat({ vehicle }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("tt_staff_chat_name") || "");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!vehicle?.id) { setMessages([]); return; }
    let cancelled = false;
    base44.entities.GroupMessage.filter({ vehicle_id: vehicle.id }, "created_date", 100)
      .then((rows) => { if (!cancelled) setMessages(rows); })
      .catch(() => {});
    const unsub = base44.entities.GroupMessage.subscribe((event) => {
      if (event.type === "delete") { setMessages((prev) => prev.filter((m) => m.id !== event.id)); return; }
      const rec = event.data;
      if (!rec || rec.vehicle_id !== vehicle.id) return;
      setMessages((prev) => (prev.some((m) => m.id === rec.id) ? prev.map((m) => (m.id === rec.id ? rec : m)) : [...prev, rec]));
    });
    return () => { cancelled = true; unsub(); };
  }, [vehicle?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !vehicle?.id || sending) return;
    setSending(true);
    const displayName = name.trim() || "Staff";
    localStorage.setItem("tt_staff_chat_name", displayName);
    try {
      await base44.entities.GroupMessage.create({
        vehicle_id: vehicle.id, vehicle_name: vehicle.name,
        company_id: vehicle.company_id, company_name: vehicle.company_name,
        sender_role: "staff", sender_name: displayName, text: trimmed,
      });
      setText("");
    } catch { /* offline or blocked — nothing to recover client-side */ }
    finally { setSending(false); }
  };

  if (!vehicle) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground text-center">
          Pick your pickup stop above to join your bus's group chat.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> {vehicle.name} group chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              <MessageCircle className="w-7 h-7 mx-auto mb-2 opacity-40" />
              No messages yet.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender_role === "staff" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                m.sender_role === "staff" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}>
                <div className="text-xs font-medium opacity-70 mb-0.5">
                  {m.sender_role === "driver" ? "Driver" : (m.sender_name || "Staff")}
                </div>
                <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                <div className={`text-[11px] mt-0.5 ${m.sender_role === "staff" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {formatTime(m.created_date)}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (shown to the driver)" />
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the driver…"
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          />
          <Button onClick={send} disabled={sending || !text.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
