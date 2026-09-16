import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import Greeting from "@/components/Greeting";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Bus, Wrench, BellRing } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import ChatThread from "@/components/chat/ChatThread";

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function previewText(m) {
  if (!m) return "";
  if (m.message_type === "image") return "📷 Photo";
  if (m.message_type === "audio") return "🎤 Voice note";
  return m.text;
}

// Mechanic team's home base — the other end of every driver's "Mechanic"
// contact. One flat list of vehicles across the whole fleet (not scoped to a
// single company, since maintenance is usually a shared/central team), each
// opening its channel:"mechanic" thread.
export default function MechanicPortal() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [messagesByVehicle, setMessagesByVehicle] = useState({});
  const [activeVehicleId, setActiveVehicleId] = useState(null);
  const [sending, setSending] = useState(false);
  const [unreadVehicleIds, setUnreadVehicleIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);
  const { permission: pushPermission, enableNotifications } = usePushNotifications({
    email: user?.email, role: "mechanic",
  });

  const senderName = user?.full_name || "Mechanic";
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId) || null;
  const activeMessages = messagesByVehicle[activeVehicleId] || [];

  useEffect(() => {
    base44.entities.Vehicle.list().then((v) => { setVehicles(v); setLoading(false); });
  }, []);

  useEffect(() => {
    base44.entities.GroupMessage.filter({ channel: "mechanic" }, "-created_date", 300)
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
      if (!rec || rec.channel !== "mechanic") return;
      setMessagesByVehicle((prev) => {
        const list = prev[rec.vehicle_id] || [];
        const idx = list.findIndex((m) => m.id === rec.id);
        const nextList = idx === -1 ? [...list, rec] : list.map((m) => (m.id === rec.id ? rec : m));
        return { ...prev, [rec.vehicle_id]: nextList };
      });
      if (!firstLoad.current && !seenIds.current.has(rec.id) && rec.sender_role !== "mechanic") {
        seenIds.current.add(rec.id);
        setUnreadVehicleIds((prev) => {
          if (rec.vehicle_id === activeVehicleId) return prev;
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

  const chatVehicles = useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const la = messagesByVehicle[a.id]?.length ? new Date(messagesByVehicle[a.id].slice(-1)[0].created_date) : 0;
      const lb = messagesByVehicle[b.id]?.length ? new Date(messagesByVehicle[b.id].slice(-1)[0].created_date) : 0;
      return lb - la;
    });
  }, [vehicles, messagesByVehicle]);

  const openThread = (vehicleId) => {
    setActiveVehicleId(vehicleId);
    setUnreadVehicleIds((prev) => { const next = new Set(prev); next.delete(vehicleId); return next; });
  };

  const send = async (text) => {
    if (!activeVehicle) return;
    setSending(true);
    try {
      await base44.entities.GroupMessage.create({
        vehicle_id: activeVehicle.id, vehicle_name: activeVehicle.name,
        company_id: activeVehicle.company_id, company_name: activeVehicle.company_name,
        channel: "mechanic", sender_role: "mechanic", sender_name: senderName, text,
      });
      base44.functions.invoke("notifyAdminMessage", {
        vehicle_name: activeVehicle.name, company_id: activeVehicle.company_id, channel: "mechanic",
        sender_name: senderName, text,
      }).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (blob, messageType) => {
    if (!activeVehicle) return;
    const ext = messageType === "image" ? "jpg" : "webm";
    const file = new File([blob], `${messageType}-${Date.now()}.${ext}`, { type: blob.type });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.GroupMessage.create({
      vehicle_id: activeVehicle.id, vehicle_name: activeVehicle.name,
      company_id: activeVehicle.company_id, company_name: activeVehicle.company_name,
      channel: "mechanic", sender_role: "mechanic", sender_name: senderName,
      text: "", message_type: messageType, media_url: file_url,
    });
    base44.functions.invoke("notifyAdminMessage", {
      vehicle_name: activeVehicle.name, company_id: activeVehicle.company_id, channel: "mechanic",
      sender_name: senderName, message_type: messageType,
    }).catch(() => {});
  };

  const editMessage = async (m, text) => {
    await base44.entities.GroupMessage.update(m.id, { text, edited: true });
  };
  const deleteMessage = async (id) => {
    await base44.entities.GroupMessage.delete(id);
  };

  if (user && user.role !== "mechanic" && user.role !== "admin") return <Navigate to="/" replace />;

  if (activeVehicle) {
    return (
      <AppLayout title="Mechanic">
        <div className="max-w-lg space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => setActiveVehicleId(null)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Bus className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{activeVehicle.name}</span>
          </div>
          <ChatThread
            messages={activeMessages}
            isMine={(m) => m.sender_role === "mechanic"}
            senderLabel={(m) => (m.sender_role === "driver" ? "Driver" : m.sender_name || "Mechanic")}
            onSend={send}
            onSendImage={(blob) => sendMedia(blob, "image")}
            onSendAudio={(blob) => sendMedia(blob, "audio")}
            onEdit={editMessage}
            onDelete={deleteMessage}
            sending={sending}
            placeholder="Message this bus's driver…"
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Mechanic">
      <div className="max-w-lg space-y-4">
        <Greeting subtitle="Vehicle issues and maintenance chat" />
        {pushPermission !== "granted" && pushPermission !== "unsupported" && (
          <Button variant="outline" size="sm" onClick={enableNotifications}>
            <BellRing className="w-4 h-4 mr-1.5" /> Enable notifications
          </Button>
        )}
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {chatVehicles.map((v) => {
              const list = messagesByVehicle[v.id] || [];
              const last = list[list.length - 1];
              return (
                <Card key={v.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openThread(v.id)}>
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 grid place-items-center shrink-0">
                      <Wrench className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{v.name}</p>
                        {last && <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(last.created_date)}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {last ? `${last.sender_role === "mechanic" ? "You" : last.sender_name || "Driver"}: ${previewText(last)}` : (v.driver_name || "No messages yet")}
                      </p>
                    </div>
                    {unreadVehicleIds.has(v.id) && <span className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0" />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
