import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ChatThread from "@/components/chat/ChatThread";
import { blobToBase64 } from "@/lib/chatMedia";
import { ChevronLeft, Users, Building2, Radio, Wrench, Camera, Mic } from "lucide-react";

const QUICK_REPLIES = [
  "⏰ Running late",
  "🚌 On the way",
  "📍 Almost there",
  "✅ Arrived at stop",
  "🚦 Stuck in traffic",
  "🔧 Vehicle issue — delay expected",
];

const CONTACTS = [
  { channel: "staff", label: "Staff", icon: Users, blurb: "Passengers riding this bus", quickReplies: QUICK_REPLIES },
  { channel: "company", label: "Own company", icon: Building2, blurb: "Your company's manager" },
  { channel: "dispatch", label: "Dispatch", icon: Radio, blurb: "Admin / control room" },
  { channel: "mechanic", label: "Mechanic", icon: Wrench, blurb: "Report or discuss vehicle issues" },
];

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function previewText(m) {
  if (!m) return "";
  if (m.message_type === "image") return <><Camera className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Photo</>;
  if (m.message_type === "audio") return <><Mic className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Voice note</>;
  return m.text;
}

// Driver's WhatsApp-style chat list — merges what used to be two separate
// tabs ("Messages": admin broadcasts + reply, and "Chat": staff group chat)
// into one contact list with four threads. Dispatch, Company and Mechanic
// are all backed by the same GroupMessage entity, split by `channel`; only
// Dispatch also carries over old Broadcast-based history for continuity.
export default function DriverChats({ session, invoke, onUnreadChange }) {
  const [activeChannel, setActiveChannel] = useState(null);
  const [localMessages, setLocalMessages] = useState({});
  const [sending, setSending] = useState(false);
  // When each conversation was last read. Opening a chat marks it read and it
  // stays read — including anything that arrives while you're reading it.
  const [readAt, setReadAt] = useState({});
  const seeded = React.useRef(false);

  const groupMessages = session?.group_messages || [];
  const broadcasts = session?.broadcasts || [];
  const driverName = session?.driver_name || "Driver";

  const byChannel = useMemo(() => {
    const map = { staff: [], company: [], dispatch: [], mechanic: [] };
    groupMessages.forEach((m) => {
      const ch = m.channel || "staff";
      if (map[ch]) map[ch].push(m);
    });
    // Legacy admin<->driver messages lived in Broadcast before this feature —
    // fold that history into Dispatch, read-only, for continuity.
    broadcasts.forEach((b) => {
      map.dispatch.push({
        id: `bc-${b.id}`,
        __broadcast: true,
        sender_role: b.is_reply ? "driver" : "admin",
        sender_name: b.is_reply ? driverName : "Dispatch",
        text: b.message,
        message_type: "text",
        created_date: b.created_date,
      });
    });
    Object.keys(map).forEach((ch) => {
      const local = localMessages[ch] || [];
      map[ch] = [...map[ch], ...local].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    });
    return map;
  }, [groupMessages, broadcasts, localMessages, driverName]);

  // Drop optimistic local echoes once the server's own copy shows up.
  useEffect(() => {
    setLocalMessages((prev) => {
      let changed = false;
      const next = {};
      Object.keys(prev).forEach((ch) => {
        const filtered = prev[ch].filter(
          (lm) => !groupMessages.some((m) => m.id === lm.id)
        );
        if (filtered.length !== prev[ch].length) changed = true;
        next[ch] = filtered;
      });
      return changed ? next : prev;
    });
  }, [groupMessages]);

  // Newest message from someone else, per channel.
  const lastIncoming = useMemo(() => {
    const latest = {};
    groupMessages.forEach((m) => {
      if (m.sender_role === "driver") return;
      const ch = m.channel || "staff";
      const t = new Date(m.created_date).getTime();
      if (!latest[ch] || t > latest[ch]) latest[ch] = t;
    });
    broadcasts.forEach((b) => {
      if (b.is_reply) return;
      const t = new Date(b.created_date).getTime();
      if (!latest.dispatch || t > latest.dispatch) latest.dispatch = t;
    });
    return latest;
  }, [groupMessages, broadcasts]);

  // First time this tablet sees the history, everything already there counts as
  // read — otherwise every old message would light up the Chat tab.
  useEffect(() => {
    if (seeded.current || !Object.keys(lastIncoming).length) return;
    seeded.current = true;
    setReadAt((prev) => {
      const next = { ...prev };
      Object.entries(lastIncoming).forEach(([ch, t]) => { if (!next[ch]) next[ch] = t; });
      return next;
    });
  }, [lastIncoming]);

  // The conversation on screen is read, and anything arriving in it is read too.
  useEffect(() => {
    if (!activeChannel) return;
    setReadAt((prev) => (
      prev[activeChannel] >= (lastIncoming[activeChannel] || 0) ? prev : { ...prev, [activeChannel]: Date.now() }
    ));
  }, [activeChannel, lastIncoming]);

  const unreadChannels = useMemo(() => {
    const unread = new Set();
    Object.entries(lastIncoming).forEach(([ch, t]) => {
      if (ch !== activeChannel && t > (readAt[ch] || 0)) unread.add(ch);
    });
    return unread;
  }, [lastIncoming, readAt, activeChannel]);

  useEffect(() => { onUnreadChange?.(unreadChannels.size > 0); }, [unreadChannels, onUnreadChange]);

  const openChannel = (ch) => {
    setActiveChannel(ch);
    setReadAt((prev) => ({ ...prev, [ch]: Date.now() }));
  };

  const send = async (text) => {
    setSending(true);
    try {
      const result = await invoke("send_group_message", { text, channel: activeChannel });
      const message = result?.message || result?.data?.message;
      if (message?.id) setLocalMessages(prev=>({...prev,[activeChannel]:[...(prev[activeChannel]||[]).filter(m=>m.id!==message.id),message]}));
      return message;
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (blob, messageType) => {
    const data_base64 = await blobToBase64(blob);
    await invoke("send_chat_media", { channel: activeChannel, message_type: messageType, data_base64, mime_type: blob.type });
  };

  const editMessage = async (m, text) => {
    await invoke("edit_group_message", { message_id: m.id, text });
  };
  const deleteMessage = async (id) => {
    await invoke("delete_group_message", { message_id: id });
  };

  if (activeChannel) {
    const contact = CONTACTS.find((c) => c.channel === activeChannel);
    const Icon = contact.icon;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => setActiveChannel(null)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Icon className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">{contact.label}</span>
        </div>
        <ChatThread key={activeChannel}
          messages={byChannel[activeChannel]}
          isMine={(m) => !m.__broadcast && m.sender_role === "driver"}
          senderLabel={(m) => (m.sender_role === "driver" ? driverName : m.sender_name || contact.label)}
          onSend={send}
          onSendImage={(blob) => sendMedia(blob, "image")}
          onSendAudio={(blob) => sendMedia(blob, "audio")}
          onEdit={editMessage}
          onDelete={deleteMessage}
          sending={sending}
          placeholder={`Message ${contact.label.toLowerCase()}…`}
          emptyText="No messages yet — say hello below."
          quickReplies={contact.quickReplies}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {CONTACTS.map((c) => {
        const list = byChannel[c.channel];
        const last = list[list.length - 1];
        const Icon = c.icon;
        return (
          <Card key={c.channel} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openChannel(c.channel)}>
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 grid place-items-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm truncate">{c.label}</p>
                  {last && <span className="text-caption text-muted-foreground shrink-0">{formatTime(last.created_date)}</span>}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {last ? previewText(last) : c.blurb}
                </p>
              </div>
              {unreadChannels.has(c.channel) && <span className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0" />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}