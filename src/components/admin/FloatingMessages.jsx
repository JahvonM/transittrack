import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, ChevronLeft, Bus, Pencil, Trash2, Check } from "lucide-react";

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// Floating chat bubble for admin — mirrors FloatingChatbot's UX, but connects
// to the real per-bus driver/staff group chats instead of the AI copilot.
// Opens to a WhatsApp-style list of buses; tapping one opens that thread.
export default function FloatingMessages({ vehicles = [] }) {
  const [open, setOpen] = useState(false);
  const [activeVehicleId, setActiveVehicleId] = useState(null);
  const [messagesByVehicle, setMessagesByVehicle] = useState({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadVehicleIds, setUnreadVehicleIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const bottomRef = useRef(null);
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);

  const chatVehicles = useMemo(() => vehicles.filter((v) => v.id), [vehicles]);
  const activeVehicle = chatVehicles.find((v) => v.id === activeVehicleId) || null;
  const activeMessages = messagesByVehicle[activeVehicleId] || [];

  // One global subscription covers every bus — cheaper than one per vehicle,
  // and lets the bubble badge light up for whichever chat got a new message.
  useEffect(() => {
    base44.entities.GroupMessage.list("-created_date", 300)
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
      if (!firstLoad.current && !seenIds.current.has(rec.id) && rec.sender_role !== "admin") {
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [activeMessages.length, activeVehicleId]);

  const openThread = (vehicleId) => {
    setActiveVehicleId(vehicleId);
    setUnreadVehicleIds((prev) => { const next = new Set(prev); next.delete(vehicleId); return next; });
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeVehicle || sending) return;
    setSending(true);
    try {
      await base44.entities.GroupMessage.create({
        vehicle_id: activeVehicle.id, vehicle_name: activeVehicle.name,
        company_id: activeVehicle.company_id, company_name: activeVehicle.company_name,
        sender_role: "admin", sender_name: "Admin", text: trimmed,
      });
      setText("");
    } finally {
      setSending(false);
    }
  };

  const startEdit = (m) => { setEditingId(m.id); setEditText(m.text); setConfirmDeleteId(null); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async (m) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try { await base44.entities.GroupMessage.update(m.id, { text: trimmed, edited: true }); }
    finally { cancelEdit(); }
  };
  const deleteMessage = async (id) => {
    try { await base44.entities.GroupMessage.delete(id); }
    finally { setConfirmDeleteId(null); }
  };

  const totalUnread = unreadVehicleIds.size;

  return (
    <>
      {open && (
        <div className="fixed bottom-20 left-4 z-50 w-[92vw] max-w-sm h-[65vh] flex flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden">
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
                  <p className="text-sm text-muted-foreground text-center py-10 px-4">No vehicles yet.</p>
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
                          {last && <div className="text-[11px] text-muted-foreground shrink-0">{formatTime(last.created_date)}</div>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {last ? `${last.sender_role === "admin" ? "You" : last.sender_name || last.sender_role}: ${last.text}` : (v.driver_name || "No messages yet")}
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
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {activeMessages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
                )}
                {activeMessages.map((m) => {
                  const isMine = m.sender_role === "admin";
                  const isEditing = editingId === m.id;
                  return (
                    <div key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {!isMine && <div className="text-xs font-medium opacity-70 mb-0.5">{m.sender_name || m.sender_role}</div>}
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m); if (e.key === "Escape") cancelEdit(); }}
                              className="h-8 text-sm bg-background text-foreground"
                            />
                            <button type="button" onClick={() => saveEdit(m)}><Check className="w-4 h-4" /></button>
                            <button type="button" onClick={cancelEdit}><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{m.text}</div>
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
              <div className="p-2 border-t flex gap-2 shrink-0">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Message this bus…"
                />
                <Button size="icon" onClick={send} disabled={sending || !text.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <Button
        className="fixed bottom-4 left-4 z-50 rounded-full h-14 w-14 shadow-lg relative"
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
