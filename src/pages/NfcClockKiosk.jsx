import React, { useCallback, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Usb, Keyboard, Nfc, Clock, ArrowRight, Building2 } from "lucide-react";
import OfflineStatusBadge from "@/components/OfflineStatusBadge";

const COMPANY_KEY = "tt_clock_company";

const CHIME = (up) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(up ? 660 : 440, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(up ? 990 : 330, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {
    /* audio not available */
  }
};

export default function NfcClockKiosk() {
  const { safeCreate, online, pendingCount } = useOfflineSync();
  const [company, setCompany] = useState(() => {
    try {
      const s = localStorage.getItem(COMPANY_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [checking, setChecking] = useState(false);
  const [readerStatus, setReaderStatus] = useState("disconnected");
  const [manualTag, setManualTag] = useState("");
  const [flash, setFlash] = useState(null);
  const [pendingName, setPendingName] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const deviceRef = useRef(null);

  const unlock = async (e) => {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) return;
    setChecking(true);
    setCodeError("");
    try {
      const list = await base44.entities.Company.list();
      const match = list.find((c) => (c.access_code || "").toUpperCase() === value);
      if (!match) {
        setCodeError("That code doesn't match any company. Check with your operator.");
        return;
      }
      localStorage.setItem(COMPANY_KEY, JSON.stringify(match));
      setCompany(match);
      setCode("");
    } catch {
      setCodeError("Couldn't verify code. Try again.");
    } finally {
      setChecking(false);
    }
  };

  const switchCompany = () => {
    localStorage.removeItem(COMPANY_KEY);
    setCompany(null);
  };

  const showFlash = useCallback((ok, name, action) => {
    setFlash({ ok, name, action });
    if (ok) CHIME(action === "in");
    setTimeout(() => setFlash(null), 3000);
  }, []);

  const clock = useCallback(
    async (cardTag, staffName) => {
      if (!cardTag) return;
      // Determine last status to toggle in/out
      let nextStatus = "boarded";
      try {
        const recent = await base44.entities.StaffCheckIn.filter({ card_tag: cardTag }, "-created_date", 1);
        if (recent.length && recent[0].status === "boarded") nextStatus = "off_board";
      } catch {
        /* offline — default to check-in */
      }
      await safeCreate("StaffCheckIn", {
        staff_name: staffName || "Unknown staff",
        card_tag: cardTag,
        status: nextStatus,
        boarded_at: new Date().toISOString(),
        company_id: company?.id || null,
        company_name: company?.name || null,
      });
      showFlash(true, staffName, nextStatus === "boarded" ? "in" : "out");
    },
    [safeCreate, showFlash, company]
  );

  const handleTag = useCallback(
    async (tag) => {
      const clean = String(tag).trim();
      if (!clean) return;
      try {
        const users = await base44.entities.User.filter({ nfc_tag_id: clean });
        if (users.length) {
          const u = users[0];
          const staffName = u.full_name || u.email || "Registered staff";
          await clock(clean, staffName);
          return;
        }
      } catch {
        /* offline — fall through */
      }
      // Fall back to a prior check-in record for the name
      try {
        const existing = await base44.entities.StaffCheckIn.filter({ card_tag: clean }, "-created_date", 1);
        if (existing.length && existing[0].staff_name) {
          await clock(clean, existing[0].staff_name);
          return;
        }
      } catch {
        /* offline — fall through to name prompt */
      }
      setPendingName({ tag: clean });
      setNameInput("");
    },
    [clock]
  );

  const connectReader = async () => {
    if (!navigator.usb) {
      setReaderStatus("unsupported");
      return;
    }
    try {
      const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x072f }] });
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
      new TextDecoder().decode(data).replace(/[^\x20-\x7E]/g, "").trim();
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
    await clock(pendingName.tag, nameInput.trim());
    setPendingName(null);
    setNameInput("");
  };

  // Company code gate
  if (!company) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="h-14 border-b border-border flex items-center px-5">
          <div className="flex items-center gap-2 font-heading font-semibold">
            <Clock className="w-5 h-5 text-primary" />
            Staff Clock Kiosk
          </div>
        </header>
        <main className="flex-1 grid place-items-center p-6">
          <div className="w-full max-w-sm">
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary text-primary-foreground grid place-items-center mb-2">
                  <Building2 className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl">Enter your company code</CardTitle>
                <CardDescription>Type the code for this tablet's clock kiosk.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={unlock} className="space-y-3">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. AB3D9K"
                    maxLength={12}
                    autoFocus
                    className="h-12 text-center text-lg font-semibold tracking-[0.3em]"
                  />
                  {codeError && <p className="text-sm text-destructive">{codeError}</p>}
                  <Button type="submit" className="w-full" disabled={checking || !code.trim()}>
                    {checking ? "Checking…" : "Open kiosk"}
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

  // Clock flash
  if (flash) {
    const isIn = flash.action === "in";
    return (
      <div className={`fixed inset-0 grid place-items-center z-50 ${isIn ? "bg-emerald-500" : "bg-sky-500"}`}>
        <div className="text-center text-white animate-in fade-in zoom-in duration-300">
          <div className="w-28 h-28 mx-auto mb-5 rounded-full bg-white/20 grid place-items-center">
            {isIn ? <Clock className="w-16 h-16" /> : <ArrowRight className="w-16 h-16" />}
          </div>
          <div className="text-4xl font-bold">{isIn ? "Clocked in" : "Clocked out"}</div>
          <div className="text-2xl mt-2">{flash.name}</div>
          <div className="text-lg mt-1 opacity-90">{company.name}</div>
          <div className="text-sm mt-3 opacity-80">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border flex items-center px-5 justify-between">
        <div className="flex items-center gap-2 font-heading font-semibold">
          <Clock className="w-5 h-5 text-primary" />
          Staff Clock Kiosk
          <span className="text-muted-foreground font-normal hidden sm:inline">· {company.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={switchCompany}>
            Switch company
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
                    Clock in
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
                <h1 className="text-2xl font-heading font-semibold">Tap your badge to clock in or out</h1>
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
                  Clock
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}