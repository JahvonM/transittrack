import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, CreditCard, QrCode, CheckCircle2, Search, Hash } from "lucide-react";
import { useNfcTap } from "@/hooks/useNfcTap";
import { staffQrDataUrl } from "@/lib/qr";

// badge_registry kiosk: pick a staff member, then either tap a fresh NFC
// card to link it to them, or show them a personal QR code to save/screenshot
// (same QR they could also pull up from their own StaffPortal profile).
export default function BadgeRegistryKiosk({ invoke }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null); // { id, full_name }
  const [mode, setMode] = useState(null); // null | nfc | qr | code | done
  const [qrUrl, setQrUrl] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [registerError, setRegisterError] = useState("");

  const { supported: nfcSupported, listening, nfcError } = useNfcTap(
    (tag) => registerTag(tag),
    mode === "nfc" && !!selected
  );

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!query.trim()) { setMatches([]); return; }
      try { const res = await invoke("search_staff", { query: query.trim() }); if (!cancelled) setMatches(res.staff || []); }
      catch { if (!cancelled) setMatches([]); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, invoke]);

  useEffect(() => {
    if (mode !== "qr" || !selected) return;
    staffQrDataUrl(selected.id).then(setQrUrl);
  }, [mode, selected]);

  const registerTag = async (tag) => {
    if (!selected || busy) return;
    setBusy(true);
    setRegisterError("");
    try {
      await invoke("register_badge", { staff_id: selected.id, card_tag: tag });
      setMode("done");
    } catch {
      setRegisterError("Couldn't register that badge — try tapping it again.");
    } finally {
      setBusy(false);
    }
  };

  const generateCode = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setRegisterError("");
    try {
      const res = await invoke("generate_access_code", { staff_id: selected.id });
      setAccessCode(res.code);
      setMode("code");
    } catch {
      setRegisterError("Couldn't generate a code — try again.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setSelected(null); setMode(null); setQuery(""); setMatches([]); setQrUrl(""); setAccessCode(""); setRegisterError(""); };

  if (!selected) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="font-semibold text-center">Badge registry</p>
          <p className="text-sm text-muted-foreground text-center">Find yourself to register a badge or get a QR code</p>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type your name…" className="pl-9" />
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {matches.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelected(s)} className="w-full text-left p-3 rounded-lg border hover:bg-accent">
                {s.full_name}
              </button>
            ))}
            {query.trim() && matches.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No matches.</p>}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mode === "done") {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
          <p className="text-lg font-semibold">Badge linked to {selected.full_name}!</p>
          <Button variant="outline" onClick={reset}>Done</Button>
        </CardContent>
      </Card>
    );
  }

  if (mode === "nfc") {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <Button variant="ghost" size="sm" className="mb-1" onClick={() => setMode(null)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 grid place-items-center">
            <CreditCard className={`w-8 h-8 text-primary ${listening ? "animate-pulse" : ""}`} />
          </div>
          <p className="font-medium">Tap {selected.full_name}'s badge now</p>
          {nfcError && <p className="text-xs text-destructive">{nfcError}</p>}
          {registerError && <p className="text-xs text-destructive">{registerError}</p>}
        </CardContent>
      </Card>
    );
  }

  if (mode === "qr") {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <Button variant="ghost" size="sm" className="mb-1" onClick={() => setMode(null)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <p className="font-medium">{selected.full_name}'s badge QR</p>
          {qrUrl && <img src={qrUrl} alt="Badge QR code" className="mx-auto rounded-lg border" width={220} height={220} />}
          <p className="text-xs text-muted-foreground">Save or screenshot this — show it to the bus boarding kiosk to check in.</p>
          <Button onClick={reset}>Done</Button>
        </CardContent>
      </Card>
    );
  }

  if (mode === "code") {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <p className="font-medium">{selected.full_name}'s access code</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-primary">{accessCode}</p>
          <p className="text-xs text-muted-foreground">
            Give this code to {selected.full_name.split(" ")[0]} — they'll type it on the bus boarding kiosk's keypad instead of tapping a badge.
          </p>
          <Button onClick={reset}>Done</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 text-center space-y-4">
        <Button variant="ghost" size="sm" onClick={reset} className="mb-1"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <p className="font-semibold text-lg">{selected.full_name}</p>
        <div className="grid grid-cols-1 gap-2">
          <Button variant="outline" onClick={() => setMode("nfc")} disabled={!nfcSupported}>
            <CreditCard className="w-4 h-4 mr-1.5" /> Register NFC badge
          </Button>
          <Button variant="outline" onClick={generateCode} disabled={busy}>
            <Hash className="w-4 h-4 mr-1.5" /> Generate access code
          </Button>
          <Button variant="outline" onClick={() => setMode("qr")}>
            <QrCode className="w-4 h-4 mr-1.5" /> Show QR code
          </Button>
        </div>
        {registerError && <p className="text-xs text-destructive">{registerError}</p>}
        {!nfcSupported && <p className="text-xs text-muted-foreground">NFC isn't supported on this device — QR and access codes still work.</p>}
      </CardContent>
    </Card>
  );
}
