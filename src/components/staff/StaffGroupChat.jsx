import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ChatThread from "@/components/chat/ChatThread";
import { accountName } from "@/lib/userName";

const seenKey = (vehicleId) => `tt_staff_chat_seen_${vehicleId}`;

function useBusMessages(vehicleId) {
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    if (!vehicleId) { setMessages([]); return undefined; }
    let cancelled = false;
    base44.entities.GroupMessage.filter({ vehicle_id: vehicleId, channel: "staff" }, "-created_date", 100)
      .then((rows) => { if (!cancelled) setMessages([...rows].reverse()); })
      .catch(() => {});
    const unsub = base44.entities.GroupMessage.subscribe((event) => {
      if (event.type === "delete") { setMessages((prev) => prev.filter((m) => m.id !== event.id)); return; }
      const rec = event.data;
      if (!rec || rec.vehicle_id !== vehicleId || (rec.channel || "staff") !== "staff") return;
      setMessages((prev) => (prev.some((m) => m.id === rec.id) ? prev.map((m) => (m.id === rec.id ? rec : m)) : [...prev, rec]));
    });
    return () => { cancelled = true; unsub(); };
  }, [vehicleId]);
  return [messages, setMessages];
}

// Messages from others on this bus's chat since the chat was last opened.
export function useChatUnread(vehicleId, open) {
  const { user } = useAuth();
  const [messages] = useBusMessages(vehicleId);
  const [seenAt, setSeenAt] = useState(() => (vehicleId ? Number(localStorage.getItem(seenKey(vehicleId)) || 0) : 0));
  useEffect(() => { if (vehicleId) setSeenAt(Number(localStorage.getItem(seenKey(vehicleId)) || 0)); }, [vehicleId]);
  useEffect(() => {
    if (!open || !vehicleId) return;
    const now = Date.now();
    try { localStorage.setItem(seenKey(vehicleId), String(now)); } catch { /* storage full */ }
    setSeenAt(now);
  }, [open, vehicleId, messages.length]);
  return messages.filter((m) => m.created_by_id !== user?.id && new Date(m.created_date).getTime() > seenAt).length;
}

// Chat scoped to one bus: its driver plus the staff riding it (channel
// "staff" on GroupMessage). Staff post directly as themselves; driver
// messages arrive through the driverSession backend function.
export default function StaffGroupChat({ vehicle }) {
  const { user } = useAuth();
  const [messages, setMessages] = useBusMessages(vehicle?.id);
  const [sending, setSending] = useState(false);
  const displayName = accountName(user) || "Staff";

  const notifyAdmin = (message) => {
    base44.functions.invoke("notifyAdminMessage", { message_id: message.id }).catch(() => {});
  };

  const send = async (text) => {
    if (!vehicle?.id) return;
    setSending(true);
    try {
      const message = await base44.entities.GroupMessage.create({
        vehicle_id: vehicle.id, vehicle_name: vehicle.name,
        company_id: vehicle.company_id, company_name: vehicle.company_name,
        channel: "staff", sender_role: "staff", sender_name: displayName, text,
      });
      setMessages(prev=>[...prev.filter(m=>m.id!==message.id),message]);
      notifyAdmin(message);
      return message;
    }
    finally { setSending(false); }
  };

  const sendMedia = async (blob, messageType) => {
    if (!vehicle?.id) return;
    const ext = messageType === "image" ? "jpg" : "webm";
    const file = new File([blob], `${messageType}-${Date.now()}.${ext}`, { type: blob.type });
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    const message = await base44.entities.GroupMessage.create({
      vehicle_id: vehicle.id, vehicle_name: vehicle.name,
      company_id: vehicle.company_id, company_name: vehicle.company_name,
      channel: "staff", sender_role: "staff", sender_name: displayName,
      text: "", message_type: messageType, media_url: file_url,
    });
    notifyAdmin(message);
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
      <p className="p-6 text-sm text-muted-foreground text-center">
        Choose your pickup stop or your bus first to join its group chat.
      </p>
    );
  }

  return (
    <ChatThread key={vehicle.id}
      messages={messages}
      isMine={(m) => m.created_by_id === user?.id}
      senderLabel={(m) => (m.sender_role === "driver" ? "Driver" : m.sender_role === "admin" ? "Admin" : (m.sender_name || "Staff"))}
      onSend={send}
      onSendImage={(blob) => sendMedia(blob, "image")}
      onSendAudio={(blob) => sendMedia(blob, "audio")}
      onEdit={editMessage}
      onDelete={deleteMessage}
      sending={sending}
      placeholder="Message the driver…"
    />
  );
}