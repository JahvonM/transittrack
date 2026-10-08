import React, { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, ChevronLeft, Bus, Camera, Mic } from "lucide-react";
import ChatThread from "@/components/chat/ChatThread";
import { accountName } from "@/lib/userName";

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

// Floating "Own company" chat bubble for a company/fleet-owner login — the
// other end of the driver's "Own company" contact. Vehicles are already
// scoped to this company by Vehicle's own RLS, so no extra filtering here.
export default function CompanyMessages({ vehicles = [] }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeVehicleId, setActiveVehicleId] = useState(null);
  const [messagesByVehicle, setMessagesByVehicle] = useState({});
  const [sending, setSending] = useState(false);
  const [unreadVehicleIds, setUnreadVehicleIds] = useState(() => new Set());
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);

  const chatVehicles = useMemo(() => vehicles.filter((v) => v.id), [vehicles]);
  const activeVehicle = chatVehicles.find((v) => v.id === activeVehicleId) || null;
  const activeMessages = messagesByVehicle[activeVehicleId] || [];
  const senderName = accountName(user) || "Company";

  useEffect(() => {
    base44.entities.GroupMessage.filter({ channel: "company" }, "-created_date", 300)
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
      if (!rec || rec.channel !== "company") return;
      setMessagesByVehicle((prev) => {
        const list = prev[rec.vehicle_id] || [];
        const idx = list.findIndex((m) => m.id === rec.id);
        const nextList = idx === -1 ? [...list, rec] : list.map((m) => (m.id === rec.id ? rec : m));
        return { ...prev, [rec.vehicle_id]: nextList };
      });
      if (!firstLoad.current && !seenIds.current.has(rec.id) && rec.sender_role !== "company") {
        seenIds.current.add(rec.id);
        setUnreadVehicleIds((prev) => {
          if (rec.vehicle_id === activeVehicleId && open) return prev;
          const next = new Set(prev);
          next.add(rec.vehicle_id);
          return next;
        });
      } else {
        seenIds.current.add(rec.id);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openThread = (vehicleId) => {
    setActiveVehicleId(vehicleId);
    setUnreadVehicleIds((prev) => { const next = new Set(prev); next.delete(vehicleId); return next; });
  };

  const notifyAdmin = (message) => {
    base44.functions.invoke("notifyAdminMessage", { message_id: message.id }).catch(() => {});
  };

  const send = async (text) => {
    if (!activeVehicle) return;
    setSending(true);
    try {
      const message = await base44.entities.GroupMessage.create({
        vehicle_id: activeVehicle.id, vehicle_name: activeVehicle.name,
        company_id: activeVehicle.company_id, company_name: activeVehicle.company_name,
        channel: "company", sender_role: "company", sender_name: senderName, text,
      });
      setMessagesByVehicle(prev=>({...prev,[message.vehicle_id]:[...(prev[message.vehicle_id]||[]).filter(m=>m.id!==message.id),message]}));
      notifyAdmin(message);
      return message;
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (blob, messageType) => {
    if (!activeVehicle) return;
    const ext = messageType === "image" ? "jpg" : "webm";
    const file = new File([blob], `${messageType}-${Date.now()}.${ext}`, { type: blob.type });
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    const message = await base44.entities.GroupMessage.create({
      vehicle_id: activeVehicle.id, vehicle_name: activeVehicle.name,
      company_id: activeVehicle.company_id, company_name: activeVehicle.company_name,
      channel: "company", sender_role: "company", sender_name: senderName,
      text: "", message_type: messageType, media_url: file_url,
    });
    notifyAdmin(message);
  };

  const editMessage = async (m, text) => {
    await base44.entities.GroupMessage.update(m.id, { text, edited: true });
  };
  const deleteMessage = async (id) => {
    await base44.entities.GroupMessage.delete(id);
  };

  const totalUnread = unreadVehicleIds.size;

  return (
    <>
      {open && (
        <div className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-[60vh] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl md:bottom-24" role="dialog" aria-label="Driver chats">
          {!activeVehicle ? (
            <>
              <div className="flex items-center justify-between p-3 border-b shrink-0">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <MessageCircle className="w-4 h-4 text-primary" /> Driver chats
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
                      onClick={() => openThread(v.id)}
                      className="w-full flex items-center gap-3 p-3 border-b hover:bg-accent text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 grid place-items-center shrink-0">
                        <Bus className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm truncate">{v.name}</div>
                          {last && <div className="text-caption text-muted-foreground shrink-0">{formatTime(last.created_date)}</div>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {last ? <>{last.sender_role === "company" ? "You" : last.sender_name || "Driver"}: {previewText(last)}</> : (v.driver_name || "No messages yet")}
                        </div>
                      </div>
                      {unreadVehicleIds.has(v.id) && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
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
              <div className="flex-1 overflow-y-auto p-3">
                <ChatThread key={activeVehicleId}
                  messages={activeMessages}
                  isMine={(m) => m.sender_role === "company"}
                  senderLabel={(m) => (m.sender_role === "driver" ? "Driver" : m.sender_name || "Company")}
                  onSend={send}
                  onSendImage={(blob) => sendMedia(blob, "image")}
                  onSendAudio={(blob) => sendMedia(blob, "audio")}
                  onEdit={editMessage}
                  onDelete={deleteMessage}
                  sending={sending}
                  placeholder="Message this bus's driver…"
                />
              </div>
            </>
          )}
        </div>
      )}
      <Button
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 h-14 w-14 rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-accent md:bottom-6"
        size="icon"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close driver chats" : "Open driver chats"}
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {!open && totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-danger px-1 text-caption font-semibold text-danger-foreground" aria-hidden="true">
            {totalUnread}
          </span>
        )}
      </Button>
    </>
  );
}