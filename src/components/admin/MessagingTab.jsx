import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Megaphone, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import BroadcastInbox from "@/components/admin/BroadcastInbox";

export default function MessagingTab({ vehicles }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("driver");
  const [targetEmail, setTargetEmail] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const drivers = vehicles
    .filter((v) => v.driver_email)
    .filter((v, i, arr) => arr.findIndex((x) => x.driver_email === v.driver_email) === i);

  const send = async () => {
    if (!message.trim()) return;
    if (mode === "driver" && !targetEmail) return;
    setSending(true);
    try {
      const payload = { type: "info", message, title: title || undefined };
      if (mode === "driver") {
        const v = vehicles.find((x) => x.driver_email === targetEmail);
        payload.driver_email = targetEmail;
        payload.driver_name = v?.driver_name || "";
        payload.vehicle_name = v?.name || "";
        payload.company_id = v?.company_id || "";
        payload.company_name = v?.company_name || "";
      }
      await base44.entities.Broadcast.create(payload);
      toast({
        title: mode === "driver" ? "Message sent to driver" : "Broadcast sent",
        description: message,
      });
      setTitle("");
      setMessage("");
      setTargetEmail("");
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <BroadcastInbox />
      <div>
        <h1 className="text-2xl font-heading font-semibold">Messaging</h1>
        <p className="text-sm text-muted-foreground">
          Send a message that pops up on a driver's screen, or broadcast to all drivers and staff.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-4 h-4" /> Send a message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("driver")}
              className={`flex-1 px-3 h-9 rounded-lg border text-sm ${
                mode === "driver" ? "bg-primary text-primary-foreground border-primary" : "bg-card"
              }`}
            >
              To a driver
            </button>
            <button
              type="button"
              onClick={() => setMode("broadcast")}
              className={`flex-1 px-3 h-9 rounded-lg border text-sm ${
                mode === "broadcast" ? "bg-primary text-primary-foreground border-primary" : "bg-card"
              }`}
            >
              Broadcast to all
            </button>
          </div>
          {mode === "driver" && (
            <div className="space-y-1.5">
              <Label>Driver</Label>
              <Select value={targetEmail} onValueChange={setTargetEmail}>
                <SelectTrigger><SelectValue placeholder="Choose a driver" /></SelectTrigger>
                <SelectContent>
                  {drivers.map((v) => (
                    <SelectItem key={v.driver_email} value={v.driver_email}>
                      {v.driver_name || v.driver_email} · {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {drivers.length === 0 && (
                <p className="text-xs text-muted-foreground">No drivers assigned to vehicles yet.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Title (optional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Route change" />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your message…" rows={3} />
          </div>
          <Button onClick={send} disabled={sending || !message.trim() || (mode === "driver" && !targetEmail)}>
            {sending ? "Sending…" : (<><Send className="w-4 h-4 mr-1.5" />Send</>)}
          </Button>
          {mode === "broadcast" && (
            <p className="text-xs text-muted-foreground">This pops up on every driver and staff screen.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}