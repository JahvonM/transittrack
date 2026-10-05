import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Pencil, Trash2, Check, X, Image as ImageIcon, Mic, Square } from "lucide-react";

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// Resize/compress a photo client-side before it's sent — keeps chat payloads
// (especially the driver's base64-over-JSON path) small.
function compressImage(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob || file); }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Shared WhatsApp-style thread view: text/image/audio bubbles, edit/delete on
// "mine" messages, and an input row with text + photo + voice-note capture.
// Every consumer (driver/staff/admin/company/mechanic) supplies its own
// send/edit/delete/upload wiring — this component only renders and captures.
export default function ChatThread({
  messages,
  isMine,
  senderLabel,
  onSend,
  onSendImage,
  onSendAudio,
  onEdit,
  onDelete,
  sending,
  placeholder = "Type a message…",
  emptyText = "No messages yet.",
  quickReplies,
}) {
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const send = async (value) => {
    const trimmed = (value ?? text).trim();
    if (!trimmed || sending) return;
    setSendError("");
    try {
      await onSend(trimmed);
      setText(current => current.trim() === trimmed ? "" : current);
    } catch {
      setSendError("Couldn't send. Your message is still here; try again.");
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onSendImage) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      await onSendImage(compressed);
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = async () => {
    if (!onSendAudio) return;
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = window.MediaRecorder?.isTypeSupported?.("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setUploading(true);
        try { await onSendAudio(blob); } finally { setUploading(false); }
      };
      rec.start();
      mediaRecorderRef.current = rec;
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const startEdit = (m) => { setEditingId(m.id); setEditText(m.text); setConfirmDeleteId(null); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async (m) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try { await onEdit(m, trimmed); } finally { cancelEdit(); }
  };
  const removeMessage = async (id) => {
    try { await onDelete(id); } finally { setConfirmDeleteId(null); }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            <MessageCircle className="w-7 h-7 mx-auto mb-2 opacity-40" />
            {emptyText}
          </p>
        )}
        {messages.map((m) => {
          const mine = isMine(m);
          const isEditing = editingId === m.id;
          const isLocal = String(m.id).startsWith("local-");
          const isMedia = m.message_type === "image" || m.message_type === "audio";
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {!mine && (
                  <div className="text-xs font-medium opacity-70 mb-0.5">
                    {senderLabel ? senderLabel(m) : m.sender_name}
                  </div>
                )}
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
                ) : m.message_type === "image" && m.media_url ? (
                  <a href={m.media_url} target="_blank" rel="noopener noreferrer">
                    <img src={m.media_url} alt="Shared" className="rounded-lg max-h-64 max-w-full" />
                  </a>
                ) : m.message_type === "audio" && m.media_url ? (
                  <audio controls src={m.media_url} className="max-w-[220px] h-9" />
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                )}
                <div className={`text-caption mt-0.5 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {formatTime(m.created_date)}{m.edited ? " · edited" : ""}
                </div>
              </div>
              {mine && !isLocal && (
                <div className="flex items-center gap-2 mt-1 px-1">
                  {!isMedia && !isEditing && (
                    <button type="button" onClick={() => startEdit(m)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!isEditing && (confirmDeleteId === m.id ? (
                    <>
                      <button type="button" onClick={() => removeMessage(m.id)} className="text-xs text-destructive font-medium">Delete?</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs text-muted-foreground">Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteId(m.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {quickReplies?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickReplies.map((q) => (
            <Button key={q} type="button" variant="outline" size="sm" disabled={sending} onClick={() => send(q)}>{q}</Button>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-center">
        {onSendImage && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Send photo">
              <ImageIcon className="w-4 h-4" />
            </Button>
          </>
        )}
        {onSendAudio && (
          <Button type="button" variant={recording ? "destructive" : "outline"} size="icon" className="shrink-0" onClick={toggleRecording} disabled={uploading} aria-label={recording ? "Stop recording" : "Record voice note"}>
            {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
        )}
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          disabled={uploading}
        />
        <Button aria-label="Send message" onClick={() => send()} disabled={sending || uploading || !text.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
      {sendError && <p role="alert" className="text-xs text-destructive">{sendError}</p>}
      {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
    </div>
  );
}
