import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import KioskDeviceDialog from "@/components/admin/KioskDeviceDialog";
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
  Smartphone,
  DoorOpen,
  CreditCard,
  Bus,
  Plus,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Pencil,
  Clock,
  Navigation,
  XCircle,
  Activity,
  Download,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const TYPE_META = {
  bus_boarding: { label: "Bus boarding", icon: Bus },
  driver: { label: "Driver tablet", icon: Navigation },
  front_desk: { label: "Front-desk", icon: DoorOpen },
  badge_registry: { label: "Retired mode - edit to switch to Bus boarding", icon: CreditCard },
};

function timeAgo(dateStr) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Windows setup tool (public/tools): installs FreeKiosk, WebView and the
// TransitTrack Helper on a new tablet over USB and sets it up as a driver or
// bus boarding tablet. The per-tablet version comes pre-filled (type, pairing
// code, bus number) so it runs without typing.
const SETUP_TOOL = "/tools/TransitTrack-Tablet-Setup.bat";
const batSafe = (v) => String(v || "").replace(/[^A-Za-z0-9 .,-]/g, "").trim();

async function downloadSetupFile(d, typeLabel) {
  const res = await fetch(SETUP_TOOL, { cache: "no-store" });
  if (!res.ok) throw new Error("Setup tool not found");
  let text = await res.text();
  const busNumber = (String(d.vehicle_name || d.label || "").match(/\d+/) || [""])[0];
  const name = batSafe(`${d.label} - ${typeLabel}${d.vehicle_name ? ` - ${d.vehicle_name}` : ""}`);
  const fill = (key, value) => {
    text = text.replace(new RegExp(`set ${key}=\\r?\\n`), (m) => `set ${key}=${value}${m.endsWith("\r\n") ? "\r\n" : "\n"}`);
  };
  fill("PRESET_TYPE", d.kiosk_type === "driver" ? "1" : "2");
  fill("PRESET_CODE", String(d.pairing_code || "").replace(/[^A-Za-z0-9]/g, ""));
  if (busNumber) fill("PRESET_BUS", busNumber);
  fill("PRESET_NAME", name);
  const blob = new Blob([text], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `TransitTrack-Setup-${batSafe(d.label).replace(/[ .,]+/g, "-") || "tablet"}.bat`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Status reported by the TransitTrack Helper app on the tablet (battery, card
// reader, USB GPS, last card). Red when the battery is low or a device has a problem.
const OK_STATES = /^(connected|fix|paused|card reader off|gps off)/i;
function HelperHealthLine({ h }) {
  if (!h || !h.reported_at) return null;
  const stale = Date.now() - new Date(h.reported_at).getTime() > 10 * 60 * 1000;
  const parts = [];
  if (h.version) parts.push(`Helper ${h.version}`);
  if (typeof h.battery === "number") parts.push(`Battery ${h.battery}%${h.charging ? " (charging)" : ""}`);
  if (h.parked) parts.push("Parked");
  if (h.reader) parts.push(`Reader: ${h.reader}`);
  if (h.gps) parts.push(`GPS: ${h.gps}`);
  if (h.hotspot) parts.push(`Hotspot: ${h.hotspot}`);
  if (h.last_card_at) parts.push(`Last card ${timeAgo(h.last_card_at)}`);
  if (stale) parts.push(`reported ${timeAgo(h.reported_at)}`);
  const lowBattery = typeof h.battery === "number" && h.battery <= 20 && !h.charging;
  const problem = (h.reader && !OK_STATES.test(h.reader)) || (h.gps && !OK_STATES.test(h.gps) && !/^searching/i.test(h.gps)) || (h.hotspot && /^(blocked|failed)/i.test(h.hotspot) && !h.parked);
  return (
    <div className={`text-xs flex items-start gap-1 mt-0.5 ${lowBattery || problem ? "text-destructive" : "text-muted-foreground"}`}>
      <Activity className="w-3 h-3 mt-0.5 shrink-0" />
      <span className="break-words">{parts.join(" · ")}</span>
    </div>
  );
}

export default function KioskTablets({ vehicles, companies, onChange }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const loadDevices = async () => {
    try {
      const list = await base44.entities.KioskDevice.list("-created_date");
      setDevices(list);
    } catch {
      toast({ title: "Couldn't load devices", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast({ title: "Couldn't copy", description: text });
    }
  };

  const regenerate = async (device) => {
    const code = randomCode();
    setBusyId(device.id);
    try {
      await base44.entities.KioskDevice.update(device.id, {
        pairing_code: code,
        paired: false,
      });
      toast({ title: "New pairing code generated", description: code });
      loadDevices();
    } catch {
      toast({ title: "Couldn't generate code", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const removeDevice = async (device) => {
    setBusyId(device.id);
    try {
      await base44.entities.KioskDevice.delete(device.id);
      toast({ title: "Device removed", description: `${device.label} was deleted` });
      loadDevices();
      onChange?.();
    } catch {
      toast({ title: "Couldn't remove device", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (device) => {
    setBusyId(device.id);
    try {
      await base44.entities.KioskDevice.update(device.id, {
        status: "revoked",
        pairing_code: "",
        paired: false,
      });
      toast({ title: "Device revoked", description: `${device.label} is unpaired` });
      loadDevices();
      onChange?.();
    } catch {
      toast({ title: "Couldn't revoke", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const reactivate = async (device) => {
    const code = randomCode();
    setBusyId(device.id);
    try {
      await base44.entities.KioskDevice.update(device.id, {
        status: "active",
        pairing_code: code,
        paired: false,
      });
      toast({ title: "Device reactivated", description: `New pairing code: ${code}` });
      loadDevices();
    } catch {
      toast({ title: "Couldn't reactivate", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (device) => {
    setEditDevice(device);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditDevice(null);
    setDialogOpen(true);
  };

  const pairedCount = devices.filter((d) => d.paired).length;
  const activeCount = devices.filter((d) => d.status === "active").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3">
          <div className="text-center px-4 py-2 rounded-xl border bg-card">
            <div className="text-2xl font-bold">{devices.length}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="text-center px-4 py-2 rounded-xl border bg-card">
            <div className="text-2xl font-bold">{pairedCount}</div>
            <div className="text-xs text-muted-foreground">Paired</div>
          </div>
          <div className="text-center px-4 py-2 rounded-xl border bg-card">
            <div className="text-2xl font-bold">{activeCount}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <a href={SETUP_TOOL} download><Download className="w-4 h-4 mr-1" /> Setup tool</a>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Register tablet
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">
        <p className="font-medium">Setting up a new driver or bus boarding tablet</p>
        <ol className="text-muted-foreground list-decimal ml-4 mt-1 space-y-0.5">
          <li>Register the tablet here, then press <b>Setup file</b> on its card. The file comes filled in with its type, code and bus.</li>
          <li>On the tablet: turn on USB debugging, remove all accounts, connect to Wi-Fi, and plug it into this Windows PC.</li>
          <li>Double-click the downloaded file (if Windows warns you: <i>More info → Run anyway</i>) and follow the blue window.</li>
        </ol>
        <p className="text-xs text-muted-foreground mt-1">
          Needs ADB on the PC (<code>winget install Google.PlatformTools</code>) and the WebView .apk in your Downloads folder.
          FreeKiosk and TransitTrack Helper download themselves. <b>Setup tool</b> is the same file without anything filled in.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading devices…</p>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">No kiosk tablets registered yet.</p>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Register your first tablet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => {
            const meta = TYPE_META[d.kiosk_type] || TYPE_META.bus_boarding;
            const Icon = meta.icon;
            const isRevoked = d.status === "revoked";
            const hasCode = !!d.pairing_code;
            return (
              <Card key={d.id} className={isRevoked ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {d.label}
                          {d.paired && <Badge variant="default" className="text-sm">Paired</Badge>}
                          {isRevoked && <Badge variant="destructive" className="text-sm">Revoked</Badge>}
                          {!d.paired && !isRevoked && hasCode && <Badge variant="outline" className="text-sm">Awaiting pairing</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {meta.label}
                          {d.company_name && ` · ${d.company_name}`}
                          {d.vehicle_name && ` · ${d.vehicle_name}`}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> Last seen: {timeAgo(d.last_seen)}
                        </div>
                        <HelperHealthLine h={d.helper_health} />
                      </div>
                    </div>

                    {hasCode && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted font-mono text-lg font-bold tracking-widest">
                        {d.pairing_code}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(d.pairing_code, d.id)}>
                          {copiedId === d.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {hasCode && !isRevoked && (
                        <Button size="sm" variant="default" onClick={() => copy(`${window.location.origin}${d.kiosk_type === "driver" ? "/driver" : "/kiosk"}?code=${d.pairing_code}`, `url-${d.id}`)}>
                          {copiedId === `url-${d.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy URL
                        </Button>
                      )}
                      {hasCode && !isRevoked && (d.kiosk_type === "driver" || d.kiosk_type === "bus_boarding") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            downloadSetupFile(d, meta.label).catch(() =>
                              toast({ title: "Couldn't make the setup file", description: "Try again, or use Setup tool at the top.", variant: "destructive" })
                            )
                          }
                        >
                          <Download className="w-3.5 h-3.5" /> Setup file
                        </Button>
                      )}
                      {!isRevoked && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                            <Pencil className="w-3.5 h-3.5" /> Reassign
                          </Button>
                          <Button size="sm" variant="secondary" disabled={busyId === d.id} onClick={() => regenerate(d)}>
                            <RefreshCw className={`w-3.5 h-3.5 ${busyId === d.id ? "animate-spin" : ""}`} />
                            {hasCode ? "Regenerate" : "New code"}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                <XCircle className="w-3.5 h-3.5" /> Revoke
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {d.label} will be unpaired immediately. The tablet will need a new pairing code to reconnect. You can reactivate it later, and the device record stays around. Use "Remove" instead if you want it gone for good.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => revoke(d)}>Revoke device</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      {isRevoked && (
                        <Button size="sm" variant="outline" disabled={busyId === d.id} onClick={() => reactivate(d)}>
                          <RefreshCw className={`w-3.5 h-3.5 ${busyId === d.id ? "animate-spin" : ""}`} /> Reactivate
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busyId === d.id}>
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Permanently remove this device?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {d.label} will be deleted for good — unlike Revoke, this can't be undone and there's nothing left to reactivate. Use this once you're sure the tablet is retired.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeDevice(d)}>Remove device</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <KioskDeviceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        companies={companies}
        vehicles={vehicles}
        device={editDevice}
        onSaved={loadDevices}
      />
    </div>
  );
}