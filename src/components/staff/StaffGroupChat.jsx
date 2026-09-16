import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Users, Pencil, Trash2, Check, X } from "lucide-react";

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
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
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
      // Notify admin (staff creates go straight through the client SDK, so
      // this is the one path that doesn't already push-notify inline).
      base44.functions.invoke("notifyAdminMessage", {
        vehicle_name: vehicle.name, sender_name: displayName, text: trimmed,
      }).catch(() => {});
    } catch { /* offline or blocked — nothing to recover client-side */ }
    finally { setSending(false); }
  };

  const startEdit = (m) => { setEditingId(m.id); setEditText(m.text); setConfirmDeleteId(null); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async (m) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      await base44.entities.GroupMessage.update(m.id, { text: trimmed, edited: true });
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, text: trimmed, edited: true } : x)));
    } finally {
      cancelEdit();
    }
  };
  const deleteMessage = async (id) => {
    try {
      await base44.entities.GroupMessage.delete(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setConfirmDeleteId(null);
    }
  };

  if (!vehicle) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground text-center">
          Choose your bus below, or pick your pickup stop further down, to join your bus's group chat.
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
          {messages.map((m) => {
            const isMine = m.sender_role === "staff" && m.sender_name === (name.trim() || "Staff");
            const isEditing = editingId === m.id;
            return (
              <div key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                  isMine ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  <div className="text-xs font-medium opacity-70 mb-0.5">
                    {m.sender_role === "driver" ? "Driver" : m.sender_role === "admin" ? "Admin" : (m.sender_name || "Staff")}
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m); if (e.key === "Escape") cancelEdit(); }}
                        className="h-8 text-sm bg-background text-foreground"
                      />
                      <button type="button" onClick={() => saveEdit(m)} className="shrink-0"><Check className="w-4 h-4" /></button>
                      <button type="button" onClick={cancelEdit} className="shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                  )}
                  <div className={`text-[11px] mt-0.5 ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {formatTime(m.created_date)}{m.edited ? " · edited" : ""}
                  </div>
                </div>
                {isMine && !isEditing && (
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <button type="button" onClick={() => startEdit(m)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {confirmDeleteId === m.id ? (
                      <>
                        <button type="button" onClick={() => deleteMessage(m.id)} className="text-xs text-destructive font-medium">Delete?</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs text-muted-foreground">Cancel</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDeleteId(m.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
