import React, { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, ChevronLeft, Bus, Users, Building2, Radio, Wrench, Camera, Mic } from "lucide-react";
import ChatThread from "@/components/chat/ChatThread";

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function previewText(m) {
  if (!m) return "";
  if (m.message_type === "image") return <><Camera className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Photo</>;
  if (m.message_type === "audio") return <><Mic className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Voice note</>;
  return m.text;
}

const CHANNELS = [
  { channel: "staff", label: "Passengers", icon: Users },
  { channel: "company", label: "Company", icon: Building2 },
  { channel: "dispatch", label: "Dispatch", icon: Radio },
  { channel: "mechanic", label: "Mechanic", icon: Wrench },
];

function senderLabelFor(m, channel) {
  if (m.sender_role === "driver") return "Driver";
  if (m.sender_role === "admin") return "Admin";
  if (channel === "company") return m.sender_name || "Company";
  if (channel === "mechanic") return m.sender_name || "Mechanic";
  return m.sender_name || "Passenger";
}

// Floating chat bubble for admin — mirrors FloatingChatbot's UX, but connects
// to the real per-bus chats instead of the AI copilot. Opens to a
// WhatsApp-style list of buses; each bus expands into its four channels
// (Staff / Company / Dispatch / Mechanic), since admin has global oversight
// across every conversation the driver can start.
export default function FloatingMessages({ vehicles = [] }) {
  const [open, setOpen] = useState(false);
  const [activeVehicleId, setActiveVehicleId] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messagesByVehicle, setMessagesByVehicle] = useState({});
  const [sending, setSending] = useState(false);
  const [unreadKeys, setUnreadKeys] = useState(() => new Set());
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);

  const chatVehicles = useMemo(() => vehicles.filter((v) => v.id), [vehicles]);
  const activeVehicle = chatVehicles.find((v) => v.id === activeVehicleId) || null;
  const allActiveMessages = messagesByVehicle[activeVehicleId] || [];
  const activeMessages = useMemo(
    () => allActiveMessages.filter((m) => (m.channel || "staff") === activeChannel),
    [allActiveMessages, activeChannel]
  );

  // One global subscription covers every bus and channel — cheaper than one
  // per thread, and lets the bubble badge light up for whichever chat got a
  // new message.
  useEffect(() => {
    base44.entities.GroupMessage.list("-created_date", 500)
      .then((rows) => {
        const byVehicle = {};
        rows.forEach((m) => { (byVehicle[m.vehicle_id] ||= []).push(m); });
        Object.values(byVehicle).forEach((list) => list.reverse());
        setMessagesByVehicle(byVehicle);
        rows.forEach((m) => seenIds.current.add(m.id));
        firstLoad.current = false;
      })
      .catch(() => {});

    const unsub = base44.entities.GroupMessage.subscribe((event) => {
      if (event.type === "delete") {
        setMessagesByVehicle((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((vid) => { next[vid] = next[vid].filter((m) => m.id !== event.id); });
          return next;
        });
        return;
      }
      const rec = event.data;
      if (!rec) return;
      setMessagesByVehicle((prev) => {
        const list = prev[rec.vehicle_id] || [];
        const idx = list.findIndex((m) => m.id === rec.id);
        const nextList = idx === -1 ? [...list, rec] : list.map((m) => (m.id === rec.id ? rec : m));
        return { ...prev, [rec.vehicle_id]: nextList };
      });
      const ch = rec.channel || "staff";
      if (!firstLoad.current && !seenIds.current.has(rec.id) && rec.sender_role !== "admin") {
        seenIds.current.add(rec.id);
        const key = `${rec.vehicle_id}:${ch}`;
        setUnreadKeys((prev) => {
          if (key === `${activeVehicleId}:${activeChannel}` && open) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      } else {
        seenIds.current.add(rec.id);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openVehicle = (vehicleId) => { setActiveVehicleId(vehicleId); setActiveChannel(null); };
  const openChannel = (channel) => {
    setActiveChannel(channel);
    setUnreadKeys((prev) => { const next = new Set(prev); next.delete(`${activeVehicleId}:${channel}`); return next; });
  };

  const send = async (text) => {
    if (!activeVehicle || !activeChannel) return;
    setSending(true);
    try {
      await base44.entities.GroupMessage.create({
        vehicle_id: activeVehicle.id, vehicle_name: activeVehicle.name,
        company_id: activeVehicle.company_id, company_name: activeVehicle.company_name,
        channel: activeChannel, sender_role: "admin", sender_name: "Admin", text,
      });
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (blob, messageType) => {
    if (!activeVehicle || !activeChannel) return;
    const ext = messageType === "image" ? "jpg" : "webm";
    const file = new File([blob], `${messageType}-${Date.now()}.${ext}`, { type: blob.type });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.GroupMessage.create({
      vehicle_id: activeVehicle.id, vehicle_name: activeVehicle.name,
      company_id: activeVehicle.company_id, company_name: activeVehicle.company_name,
      channel: activeChannel, sender_role: "admin", sender_name: "Admin",
      text: "", message_type: messageType, media_url: file_url,
    });
  };

  const editMessage = async (m, text) => {
    await base44.entities.GroupMessage.update(m.id, { text, edited: true });
  };
  const deleteMessage = async (id) => {
    await base44.entities.GroupMessage.delete(id);
  };

  const vehicleHasUnread = (vehicleId) => CHANNELS.some((c) => unreadKeys.has(`${vehicleId}:${c.channel}`));
  const totalUnread = unreadKeys.size;

  return (
    <>
      {open && (
        <div className="fixed bottom-40 right-4 z-50 w-[92vw] max-w-sm h-[65vh] flex flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden">
          {!activeVehicle ? (
            <>
              <div className="flex items-center justify-between p-3 border-b shrink-0">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <MessageCircle className="w-4 h-4 text-primary" /> Bus chats
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {chatVehicles.length === 0 && (
                  <EmptyState text="No vehicles yet." />
                )}
                {chatVehicles.map((v) => {
                  const list = messagesByVehicle[v.id] || [];
                  const last = list[list.length - 1];
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => openVehicle(v.id)}
                      className="w-full flex items-center gap-3 p-3 border-b hover:bg-accent text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 grid place-items-center shrink-0">
                        <Bus className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm truncate">{v.name}</div>
                          {last && <div className="text-[11px] text-muted-foreground shrink-0">{formatTime(last.created_date)}</div>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {last ? <>{last.sender_role === "admin" ? "You" : last.sender_name || last.sender_role}: {previewText(last)}</> : (v.driver_name || "No messages yet")}
                        </div>
                      </div>
                      {vehicleHasUnread(v.id) && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          ) : !activeChannel ? (
            <>
              <div className="flex items-center gap-2 p-3 border-b shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={() => setActiveVehicleId(null)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="font-semibold text-sm flex-1 truncate">{activeVehicle.name}</div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {CHANNELS.map((c) => {
                  const list = allActiveMessages.filter((m) => (m.channel || "staff") === c.channel);
                  const last = list[list.length - 1];
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.channel}
                      type="button"
                      onClick={() => openChannel(c.channel)}
                      className="w-full flex items-center gap-3 p-3 border-b hover:bg-accent text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 grid place-items-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{c.label}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {last ? <>{last.sender_role === "admin" ? "You" : senderLabelFor(last, c.channel)}: {previewText(last)}</> : "No messages yet"}
                        </div>
                      </div>
                      {unreadKeys.has(`${activeVehicle.id}:${c.channel}`) && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 border-b shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={() => setActiveChannel(null)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="font-semibold text-sm flex-1 truncate">
                  {activeVehicle.name} · {CHANNELS.find((c) => c.channel === activeChannel)?.label}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <ChatThread
                  messages={activeMessages}
                  isMine={(m) => m.sender_role === "admin"}
                  senderLabel={(m) => senderLabelFor(m, activeChannel)}
                  onSend={send}
                  onSendImage={(blob) => sendMedia(blob, "image")}
                  onSendAudio={(blob) => sendMedia(blob, "audio")}
                  onEdit={editMessage}
                  onDelete={deleteMessage}
                  sending={sending}
                  placeholder={`Message this bus's ${CHANNELS.find((c) => c.channel === activeChannel)?.label.toLowerCase()}…`}
                />
              </div>
            </>
          )}
        </div>
      )}
      <Button
        className="fixed bottom-24 right-4 z-50 rounded-full h-14 w-14 shadow-lg relative"
        size="icon"
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold grid place-items-center">
            {totalUnread}
          </span>
        )}
      </Button>
    </>
  );
}
