import React, { useCallback, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Usb, CheckCircle2, Keyboard, Nfc, Bus, ArrowRight } from "lucide-react";
import { CardDescription } from "@/components/ui/card";
import OfflineStatusBadge from "@/components/OfflineStatusBadge";

const ROSTER_KEY = "kiosk_card_roster";

function readRoster() {
  try {
    return JSON.parse(localStorage.getItem(ROSTER_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeRoster(r) {
  localStorage.setItem(ROSTER_KEY, JSON.stringify(r));
}

const SUCCESS_CHIME = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(660, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {
    /* audio not available */
  }
};

export default function BusEntryKiosk() {
  const { safeCreate, online, pendingCount } = useOfflineSync();
  const [readerStatus, setReaderStatus] = useState("disconnected");
  const [flash, setFlash] = useState(null);
  const [manualTag, setManualTag] = useState("");
  const [pendingName, setPendingName] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const deviceRef = useRef(null);
  const [bus, setBus] = useState(() => {
    try {
      const s = localStorage.getItem("tt_kiosk_bus");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [busCode, setBusCode] = useState("");
  const [busError, setBusError] = useState("");
  const [busChecking, setBusChecking] = useState(false);

  const unlockBus = async (e) => {
    e.preventDefault();
    const value = busCode.trim().toUpperCase();
    if (!value) return;
    setBusChecking(true);
    setBusError("");
    try {
      const list = await base44.entities.Vehicle.list();
      const match = list.find((v) => (v.entry_code || "").toUpperCase() === value);
      if (!match) {
        setBusError("That code doesn't match any bus. Check with your operator.");
        return;
      }
      localStorage.setItem("tt_kiosk_bus", JSON.stringify(match));
      setBus(match);
      setBusCode("");
    } catch {
      setBusError("Couldn't verify code. Try again.");
    } finally {
      setBusChecking(false);
    }
  };

  const switchBus = () => {
    localStorage.removeItem("tt_kiosk_bus");
    setBus(null);
  };

  const showFlash = useCallback((ok, name) => {
    setFlash({ ok, name });
    if (ok) SUCCESS_CHIME();
    setTimeout(() => setFlash(null), 2500);
  }, []);

  const board = useCallback(
    async (cardTag, name) => {
      if (!cardTag) return;
      const roster = readRoster();
      const staffName = name || roster[cardTag] || "Unknown staff";
      if (name) {
        roster[cardTag] = name;
        writeRoster(roster);
      }
      await safeCreate("StaffCheckIn", {
        staff_name: staffName,
        card_tag: cardTag,
        status: "boarded",
        boarded_at: new Date().toISOString(),
        vehicle_id: bus?.id || null,
        vehicle_name: bus?.name || null,
        company_id: bus?.company_id || null,
        company_name: bus?.company_name || null,
      });
      showFlash(true, staffName);
    },
    [safeCreate, showFlash, bus]
  );

  const handleTag = useCallback(
    async (tag) => {
      const clean = String(tag).trim();
      if (!clean) return;
      // Cross-reference the tapped badge against User.nfc_tag_id
      try {
        const users = await base44.entities.User.filter({ nfc_tag_id: clean });
        if (users.length) {
          const u = users[0];
          const staffName = u.full_name || u.email || "Registered staff";
          try {
            await base44.entities.User.update(u.id, { skip_pickup_today: false });
          } catch {
            /* RLS may block non-admin operators */
          }
          const roster = readRoster();
          roster[clean] = staffName;
          writeRoster(roster);
          await board(clean, staffName);
          return;
        }
      } catch {
        /* offline — fall through to roster / StaffCheckIn */
      }
      const roster = readRoster();
      if (roster[clean]) {
        await board(clean, roster[clean]);
        return;
      }
      try {
        const existing = await base44.entities.StaffCheckIn.filter({ card_tag: clean });
        if (existing.length && existing[0].staff_name) {
          roster[clean] = existing[0].staff_name;
          writeRoster(roster);
          await board(clean, existing[0].staff_name);
          return;
        }
      } catch {
        /* offline — fall through to name prompt */
      }
      setPendingName({ tag: clean });
      setNameInput("");
    },
    [board]
  );

  const connectReader = async () => {
    if (!navigator.usb) {
      setReaderStatus("unsupported");
      return;
    }
    try {
      const device = await navigator.usb.requestDevice({
        filters: [{ vendorId: 0x072f }],
      });
      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      await device.claimInterface(0);
      deviceRef.current = device;
      setReaderStatus("connected");
      listenLoop();
    } catch {
      setReaderStatus("error");
    }
  };

  const listenLoop = async () => {
    const device = deviceRef.current;
    if (!device) return;
    const decode = (data) =>
      new TextDecoder()
        .decode(data)
        .replace(/[^\x20-\x7E]/g, "")
        .trim();
    const poll = async () => {
      try {
        if (!deviceRef.current) return;
        const result = await device.transferIn(1, 64);
        const tag = decode(result.data);
        if (tag && tag.length >= 4) await handleTag(tag);
      } catch {
        /* transfer failed — keep polling */
      }
      if (deviceRef.current) poll();
    };
    poll();
  };

  const submitManual = (e) => {
    e.preventDefault();
    if (!manualTag.trim()) return;
    handleTag(manualTag.trim());
    setManualTag("");
  };

  const submitName = async (e) => {
    e.preventDefault();
    if (!nameInput.trim() || !pendingName) return;
    await board(pendingName.tag, nameInput.trim());
    setPendingName(null);
    setNameInput("");
  };

  if (!bus) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="h-14 border-b border-border flex items-center px-5">
          <div className="flex items-center gap-2 font-heading font-semibold">
            <Usb className="w-5 h-5 text-primary" />
            Bus Entry Kiosk
          </div>
        </header>
        <main className="flex-1 grid place-items-center p-6">
          <div className="w-full max-w-sm">
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary text-primary-foreground grid place-items-center mb-2">
                  <Bus className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl">Enter the bus code</CardTitle>
                <CardDescription>Type the code for this bus to open its boarding kiosk.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={unlockBus} className="space-y-3">
                  <Input
                    value={busCode}
                    onChange={(e) => setBusCode(e.target.value.toUpperCase())}
                    placeholder="e.g. BUS12"
                    maxLength={12}
                    autoFocus
                    className="h-12 text-center text-lg font-semibold tracking-[0.3em]"
                  />
                  {busError && <p className="text-sm text-destructive">{busError}</p>}
                  <Button type="submit" className="w-full" disabled={busChecking || !busCode.trim()}>
                    {busChecking ? "Checking…" : "Open kiosk"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (flash) {
    return (
      <div
        className={`fixed inset-0 grid place-items-center z-50 ${
          flash.ok ? "bg-emerald-500" : "bg-red-500"
        }`}
      >
        <div className="text-center text-white animate-in fade-in zoom-in duration-300">
          <CheckCircle2 className="w-28 h-28 mx-auto mb-5 drop-shadow-lg" />
          <div className="text-4xl font-bold">Boarded</div>
          <div className="text-xl mt-2 opacity-90">{flash.name}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border flex items-center px-5 justify-between">
        <div className="flex items-center gap-2 font-heading font-semibold">
          <Usb className="w-5 h-5 text-primary" />
          Bus Entry Kiosk
          <span className="text-muted-foreground font-normal hidden sm:inline">· {bus.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={switchBus}>
            Switch bus
          </Button>
          <OfflineStatusBadge online={online} pendingCount={pendingCount} />
          <span
          className={`text-xs px-2.5 py-1 rounded-full border ${
            readerStatus === "connected"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          {readerStatus === "connected"
            ? "NFC reader connected"
            : readerStatus === "unsupported"
            ? "WebUSB unsupported"
            : readerStatus === "error"
            ? "Reader error"
            : "Reader disconnected"}
          </span>
        </div>
      </header>

      <main className="flex-1 grid place-items-center p-6">
        <div className="w-full max-w-md space-y-5">
          {pendingName ? (
            <Card>
              <CardHeader>
                <CardTitle>New badge detected</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Card <code className="text-foreground">{pendingName.tag}</code> isn't registered yet.
                  Enter the staff member's name to continue.
                </p>
                <form onSubmit={submitName} className="space-y-3">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Staff full name"
                    autoFocus
                  />
                  <Button type="submit" className="w-full" disabled={!nameInput.trim()}>
                    Board staff
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="text-center space-y-2">
                <div className="w-20 h-20 rounded-full bg-primary/10 grid place-items-center mx-auto">
                  <Nfc className="w-10 h-10 text-primary" />
                </div>
                <h1 className="text-2xl font-heading font-semibold">Tap your badge to board</h1>
                <p className="text-sm text-muted-foreground">
                  Hold your ID card against the reader, or enter the tag manually below.
                </p>
              </div>

              {readerStatus !== "connected" && (
                <Button onClick={connectReader} variant="outline" className="w-full">
                  <Usb className="w-4 h-4 mr-2" />
                  Connect ACR122U NFC reader
                </Button>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-background px-3 text-muted-foreground">or manual entry</span>
                </div>
              </div>

              <form onSubmit={submitManual} className="flex gap-2">
                <div className="relative flex-1">
                  <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={manualTag}
                    onChange={(e) => setManualTag(e.target.value)}
                    placeholder="Badge tag ID"
                    className="pl-9"
                  />
                </div>
                <Button type="submit" disabled={!manualTag.trim()}>
                  Board
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}