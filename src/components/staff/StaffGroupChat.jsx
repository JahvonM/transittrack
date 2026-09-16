import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";
import ChatThread from "@/components/chat/ChatThread";

// Chat scoped to one bus — its driver plus the staff riding it (channel:
// "staff" on the shared GroupMessage entity; company/dispatch/mechanic are
// separate channels the driver can also reach, not shown here). Driver
// messages come through the driverSession backend function (drivers have no
// login); staff post directly since they're logged in, so this side gets
// live updates via subscribe instead of polling.
export default function StaffGroupChat({ vehicle }) {
  const [messages, setMessages] = useState([]);
  const [name, setName] = useState(() => localStorage.getItem("tt_staff_chat_name") || "");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!vehicle?.id) { setMessages([]); return; }
    let cancelled = false;
    base44.entities.GroupMessage.filter({ vehicle_id: vehicle.id, channel: "staff" }, "created_date", 100)
      .then((rows) => { if (!cancelled) setMessages(rows); })
      .catch(() => {});
    const unsub = base44.entities.GroupMessage.subscribe((event) => {
      if (event.type === "delete") { setMessages((prev) => prev.filter((m) => m.id !== event.id)); return; }
      const rec = event.data;
      if (!rec || rec.vehicle_id !== vehicle.id || (rec.channel || "staff") !== "staff") return;
      setMessages((prev) => (prev.some((m) => m.id === rec.id) ? prev.map((m) => (m.id === rec.id ? rec : m)) : [...prev, rec]));
    });
    return () => { cancelled = true; unsub(); };
  }, [vehicle?.id]);

  const notifyAdmin = (extra) => {
    base44.functions.invoke("notifyAdminMessage", {
      vehicle_name: vehicle.name, company_id: vehicle.company_id, channel: "staff",
      sender_name: name.trim() || "Staff", ...extra,
    }).catch(() => {});
  };

  const send = async (text) => {
    if (!vehicle?.id) return;
    setSending(true);
    const displayName = name.trim() || "Staff";
    localStorage.setItem("tt_staff_chat_name", displayName);
    try {
      await base44.entities.GroupMessage.create({
        vehicle_id: vehicle.id, vehicle_name: vehicle.name,
        company_id: vehicle.company_id, company_name: vehicle.company_name,
        channel: "staff", sender_role: "staff", sender_name: displayName, text,
      });
      notifyAdmin({ text });
    } catch { /* offline or blocked — nothing to recover client-side */ }
    finally { setSending(false); }
  };

  const sendMedia = async (blob, messageType) => {
    if (!vehicle?.id) return;
    const displayName = name.trim() || "Staff";
    localStorage.setItem("tt_staff_chat_name", displayName);
    const ext = messageType === "image" ? "jpg" : "webm";
    const file = new File([blob], `${messageType}-${Date.now()}.${ext}`, { type: blob.type });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.GroupMessage.create({
      vehicle_id: vehicle.id, vehicle_name: vehicle.name,
      company_id: vehicle.company_id, company_name: vehicle.company_name,
      channel: "staff", sender_role: "staff", sender_name: displayName,
      text: "", message_type: messageType, media_url: file_url,
    });
    notifyAdmin({ message_type: messageType });
  };

  const editMessage = async (m, text) => {
    await base44.entities.GroupMessage.update(m.id, { text, edited: true });
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, text, edited: true } : x)));
  };
  const deleteMessage = async (id) => {
    await base44.entities.GroupMessage.delete(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
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

  const myName = name.trim() || "Staff";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> {vehicle.name} group chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChatThread
          messages={messages}
          isMine={(m) => m.sender_role === "staff" && m.sender_name === myName}
          senderLabel={(m) => (m.sender_role === "driver" ? "Driver" : m.sender_role === "admin" ? "Admin" : (m.sender_name || "Staff"))}
          onSend={send}
          onSendImage={(blob) => sendMedia(blob, "image")}
          onSendAudio={(blob) => sendMedia(blob, "audio")}
          onEdit={editMessage}
          onDelete={deleteMessage}
          sending={sending}
          placeholder="Message the driver…"
        />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (shown to the driver)" />
      </CardContent>
    </Card>
  );
}
