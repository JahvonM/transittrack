import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Copy,
  RefreshCw,
  Smartphone,
  DoorOpen,
  Bus,
  Check,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function KioskTablets({ vehicles, companies, onChange }) {
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", plate: "", company_id: "" });
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

  const removeUrl = async (vehicle) => {
    setBusyId(vehicle.id);
    try {
      await base44.entities.Vehicle.update(vehicle.id, { entry_code: "" });
      toast({ title: "URL removed", description: `${vehicle.name}'s kiosk link was revoked` });
      onChange?.();
    } catch {
      toast({ title: "Couldn't remove", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const addTablet = async () => {
    if (!form.name.trim()) {
      toast({ title: "Bus name is required", variant: "destructive" });
      return;
    }
    const company = companies?.find((c) => c.id === form.company_id);
    setBusyId("new");
    try {
      await base44.entities.Vehicle.create({
        name: form.name.trim(),
        plate_number: form.plate.trim(),
        type: "bus",
        company_id: form.company_id || null,
        company_name: company?.name || null,
        entry_code: randomCode(),
        status: "offline",
      });
      toast({ title: "Kiosk tablet added", description: form.name.trim() });
      setForm({ name: "", plate: "", company_id: "" });
      setAdding(false);
      onChange?.();
    } catch {
      toast({ title: "Couldn't add tablet", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const buses = vehicles.filter((v) => v.type === "bus");
  const frontDeskUrl = `${origin}/kiosk/front-desk`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="w-4 h-4" /> Bus entry kiosk tablets
          </CardTitle>
          <Button size="sm" variant={adding ? "outline" : "default"} onClick={() => setAdding((a) => !a)}>
            {adding ? "Cancel" : <><Plus className="w-4 h-4" /> Add tablet</>}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Each tablet opens its dedicated URL to skip code entry. Regenerate to invalidate the old URL; Remove revokes the link.
          </p>

          {adding && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-xl border bg-card">
              <div className="space-y-1">
                <Label className="text-xs">Bus name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bus 12" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Plate</Label>
                <Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC-123" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Company</Label>
                <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    {(companies || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" disabled={busyId === "new"} onClick={addTablet}>
                  {busyId === "new" ? "Adding…" : "Create"}
                </Button>
              </div>
            </div>
          )}

          {buses.length === 0 && <p className="text-sm text-muted-foreground">No buses yet — add a tablet above.</p>}
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
                      {hasCode ? url : "No URL — generate a code"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={hasCode ? "default" : "outline"}>{hasCode ? v.entry_code : "none"}</Badge>
                  <Button size="sm" variant="outline" disabled={!hasCode} onClick={() => copy(url, v.id)}>
                    {copiedId === v.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span className="hidden sm:inline">Copy</span>
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === v.id} onClick={() => regenerate(v)}>
                    <RefreshCw className={`w-4 h-4 ${busyId === v.id ? "animate-spin" : ""}`} />
                    {hasCode ? "Regenerate" : "Generate"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={!hasCode}>
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Remove</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this kiosk URL?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This revokes the link for {v.name}. The old URL will stop working. The bus itself stays in your fleet — generate a new code anytime.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeUrl(v)}>Remove URL</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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