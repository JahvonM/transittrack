import React, { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { id: "dispatch", label: "Dispatch" },
  { id: "company", label: "Company manager" },
];
const stamp = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "");

export default function MessagesTab({ messages, loaded, hasBus, onSend }) {
  const [channel, setChannel] = useState("dispatch");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const end = useRef(null);
  const shown = (messages || []).filter((m) => m.channel === channel);

  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [shown.length, channel]);

  const send = async (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true); setError("");
    try {
      await onSend(channel, clean);
      setText("");
    } catch (err) {
      setError(err.message || "Message not sent. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (!hasBus) {
    return <p className="rounded-2xl border border-border bg-card p-4 text-muted-foreground">Messages are linked to your bus. Once dispatch assigns you a bus, you can message them here.</p>;
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-3">
      <div className="grid grid-cols-2 rounded-xl bg-secondary p-1" role="tablist" aria-label="Who to message">
        {CHANNELS.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={channel === c.id} onClick={() => setChannel(c.id)}
            className={cn("min-h-[44px] rounded-lg font-semibold", channel === c.id ? "bg-background shadow-sm" : "text-muted-foreground")}>
            {c.label}
          </button>
        ))}
      </div>

      <ol className="flex flex-1 flex-col gap-2" aria-label="Messages" aria-live="polite">
        {!loaded && <li className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading messages" /></li>}
        {loaded && shown.length === 0 && (
          <li className="py-10 text-center text-muted-foreground">No messages yet. Messages from {channel === "dispatch" ? "dispatch" : "your company manager"} about your bus show here.</li>
        )}
        {shown.map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2", m.mine ? "self-end bg-primary/15" : "self-start border border-border bg-card")}>
            {!m.mine && <p className="text-caption font-semibold text-muted-foreground">{m.sender_name || "Dispatch"}</p>}
            {m.message_type === "image" && m.media_url ? (
              <img src={m.media_url} alt="Photo from dispatch" className="mt-1 max-h-64 rounded-lg" />
            ) : m.message_type === "audio" && m.media_url ? (
              <audio controls src={m.media_url} className="mt-1 w-56 max-w-full" />
            ) : (
              <p className="whitespace-pre-wrap break-words text-body">{m.text}</p>
            )}
            <p className="mt-0.5 text-caption text-muted-foreground">{stamp(m.created_date)}</p>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>

      <form onSubmit={send} className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex items-end gap-2 bg-background pt-2">
        <label className="sr-only" htmlFor="driver-message">Message</label>
        <textarea id="driver-message" value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={1000}
          placeholder={`Message ${channel === "dispatch" ? "dispatch" : "the manager"}`}
          className="min-h-[48px] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" disabled={!text.trim() || sending} aria-label="Send message"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
        </button>
      </form>
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
    </div>
  );
}
