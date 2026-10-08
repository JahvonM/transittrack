import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, Bus, Wrench, BellRing, ClipboardCheck, Settings, LayoutDashboard, MessageCircle, Camera, Mic } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import ChatThread from "@/components/chat/ChatThread";
import MechanicSettingsDialog from "@/components/MechanicSettingsDialog";
import MechanicDashboardTab from "@/components/mechanic/MechanicDashboardTab";
import { loadFailed } from "@/lib/loadFailed";
import { accountName } from "@/lib/userName";
import BusLoader from "@/components/BusLoader";
import { PageActions, PageIntro } from "@/components/admin/kit";

const TAB = "h-9 rounded-lg px-4 text-body-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);
  const { permission: pushPermission, enableNotifications } = usePushNotifications({
    email: user?.email, role: "mechanic",
  });

  const senderName = accountName(user) || "Mechanic";
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId) || null;
  const activeMessages = messagesByVehicle[activeVehicleId] || [];

  useEffect(() => {
    base44.entities.Vehicle.list().then((v) => { setVehicles(v); setLoading(false); }).catch(() => { setLoading(false); loadFailed(); });
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
      const message = await base44.entities.GroupMessage.create({
        vehicle_id: activeVehicle.id, vehicle_name: activeVehicle.name,
        company_id: activeVehicle.company_id, company_name: activeVehicle.company_name,
        channel: "mechanic", sender_role: "mechanic", sender_name: senderName, text,
      });
      base44.functions.invoke("notifyAdminMessage", { message_id: message.id }).catch(() => {});
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
      channel: "mechanic", sender_role: "mechanic", sender_name: senderName,
      text: "", message_type: messageType, media_url: file_url,
    });
    base44.functions.invoke("notifyAdminMessage", { message_id: message.id }).catch(() => {});
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
            <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setActiveVehicleId(null)} aria-label="Back to all chats">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Bus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-title-sm font-bold">{activeVehicle.name}</span>
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = accountName(user).split(" ")[0];

  return (
    <AppLayout title="Mechanic">
      <div className="space-y-4">
        <PageIntro>{greeting}{firstName ? `, ${firstName}` : ""}. Vehicle issues, maintenance and messages from drivers.</PageIntro>
        <PageActions>
          {pushPermission !== "granted" && pushPermission !== "unsupported" && (
            <Button variant="outline" size="sm" onClick={enableNotifications}>
              <BellRing className="h-4 w-4" /> Enable notifications
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" /> Maintenance settings
          </Button>
          <Button asChild size="sm">
            <Link to="/run-inspection"><ClipboardCheck className="h-4 w-4" /> Run inspection</Link>
          </Button>
        </PageActions>
        <MechanicSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <Tabs defaultValue="dashboard">
          <TabsList className="h-auto gap-1 rounded-xl bg-secondary p-1">
            <TabsTrigger value="dashboard" className={TAB}><LayoutDashboard className="mr-1.5 h-4 w-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="messages" className={TAB}>
              <MessageCircle className="mr-1.5 h-4 w-4" /> Messages
              {unreadVehicleIds.size > 0 && <span className="ml-1.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-danger px-1 text-caption font-semibold text-danger-foreground" aria-label={`${unreadVehicleIds.size} unread`}>{unreadVehicleIds.size}</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-4">
            <MechanicDashboardTab />
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <div className="max-w-lg">
              {loading ? (
                <BusLoader className="py-8" />
              ) : (
                <div className="space-y-2">
                  {chatVehicles.map((v) => {
                    const list = messagesByVehicle[v.id] || [];
                    const last = list[list.length - 1];
                    return (
                      <Card key={v.id} className="rounded-2xl transition-colors hover:bg-accent/40">
                        <CardContent className="p-0">
                          <button type="button" onClick={() => openThread(v.id)} className="flex min-h-[64px] w-full items-center gap-3 p-3.5 text-left">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary" aria-hidden="true">
                            <Wrench className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm truncate">{v.name}</p>
                              {last && <span className="shrink-0 text-caption text-muted-foreground">{formatTime(last.created_date)}</span>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {last ? <>{last.sender_role === "mechanic" ? "You" : last.sender_name || "Driver"}: {previewText(last)}</> : (v.driver_name || "No messages yet")}
                            </p>
                          </div>
                          {unreadVehicleIds.has(v.id) && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" aria-label="Unread" />}
                          </button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}