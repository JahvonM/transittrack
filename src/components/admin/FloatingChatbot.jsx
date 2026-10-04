import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, X, Send } from "lucide-react";

export default function FloatingChatbot({ placement = "float" }) {
  const inHeader = placement === "header";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm the TransitTrack copilot. Ask me about your fleet, trips, drivers, inspections, or safety procedures." },
  ]);
  const endRef = useRef(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const convo = next.map((m) => `${m.role}: ${m.content}`).join("\n");
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an assistant for a transit/fleet management app called TransitTrack. Help the admin concisely with fleet, trips, drivers, inspections, incidents, and safety.\n\nConversation:\n${convo}\n\nassistant:`,
      });
      const reply = typeof res === "string" ? res : res?.response || JSON.stringify(res);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, I couldn't reach the AI service just now." }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  return (
    <>
      {open && (
        <div className={inHeader ? "fixed right-3 top-[4.5rem] z-50 flex h-[min(70vh,640px)] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" : "fixed bottom-20 right-4 z-50 w-[92vw] max-w-sm h-[60vh] flex flex-col rounded-2xl border bg-card shadow-2xl"} role="dialog" aria-label="AI copilot">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Sparkles className="w-4 h-4 text-primary" /> AI copilot
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-6 rounded-lg bg-primary text-primary-foreground p-2"
                    : "mr-6 rounded-lg bg-muted p-2"
                }
              >
                {m.content}
              </div>
            ))}
            {busy && <div className="text-xs text-muted-foreground">Typing…</div>}
            <div ref={endRef} />
          </div>
          <div className="p-2 border-t flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask anything…"
            />
            <Button size="icon" onClick={send} disabled={busy}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
      <Button
        className={inHeader ? "relative h-10 w-10 rounded-full" : "fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-accent"}
        variant={inHeader ? "ghost" : "default"}
        size="icon"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </Button>
    </>
  );
}