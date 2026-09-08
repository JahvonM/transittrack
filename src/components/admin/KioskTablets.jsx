import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, RefreshCw, Smartphone, DoorOpen, Bus, Check } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function KioskTablets({ vehicles, onChange }) {
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const origin = window.location.origin;

  const copy = async (url, id) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast({ title: "Couldn't copy", description: url });
    }
  };

  const regenerate = async (vehicle) => {
    const code = randomCode();
    setBusyId(vehicle.id);
    try {
      await base44.entities.Vehicle.update(vehicle.id, { entry_code: code });
      toast({ title: "URL regenerated", description: `${vehicle.name} now uses code ${code}` });
      onChange?.();
    } catch {
      toast({ title: "Couldn't regenerate", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const buses = vehicles.filter((v) => v.type === "bus");
  const frontDeskUrl = `${origin}/kiosk/front-desk`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="w-4 h-4" /> Bus entry kiosk tablets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Open a tablet's dedicated URL and it skips the code entry. Regenerate a code to invalidate the old URL.
          </p>
          {buses.length === 0 && <p className="text-sm text-muted-foreground">No buses yet.</p>}
          {buses.map((v) => {
            const hasCode = !!v.entry_code;
            const url = `${origin}/kiosk/bus?code=${v.entry_code || ""}`;
            return (
              <div key={v.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border bg-card">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Bus className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{v.name}</div>
                    <div className="text-xs text-muted-foreground truncate font-mono">
                      {hasCode ? url : "No URL yet — generate a code"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={hasCode ? "default" : "outline"}>{hasCode ? v.entry_code : "none"}</Badge>
                  <Button size="sm" variant="outline" disabled={!hasCode} onClick={() => copy(url, v.id)}>
                    {copiedId === v.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    Copy URL
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === v.id} onClick={() => regenerate(v)}>
                    <RefreshCw className={`w-4 h-4 ${busyId === v.id ? "animate-spin" : ""}`} />
                    {hasCode ? "Regenerate" : "Generate"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DoorOpen className="w-4 h-4" /> Front-desk kiosk tablet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-3 rounded-xl border bg-card">
            <DoorOpen className="w-4 h-4 text-primary shrink-0" />
            <code className="text-xs sm:text-sm flex-1 truncate">{frontDeskUrl}</code>
            <Button size="sm" variant="outline" onClick={() => copy(frontDeskUrl, "frontdesk")}>
              {copiedId === "frontdesk" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}