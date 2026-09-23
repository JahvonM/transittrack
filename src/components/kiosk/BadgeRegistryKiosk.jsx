import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, CreditCard, CheckCircle2, Search, Hash, UserPlus } from "lucide-react";
import { useNfcTap } from "@/hooks/useNfcTap";

function Screen({ modeKey, className = "", children }) {
  return (
    <Card className="rounded-3xl shadow-xl border-border/60 overflow-hidden">
      <CardContent key={modeKey} className={`animate-in fade-in zoom-in-95 duration-300 ${className}`}>
        {children}
      </CardContent>
    </Card>
  );
}

// badge_registry kiosk: pick a staff member, then either tap a fresh NFC
// card to link it to them, or generate a persistent access code for the bus
// boarding kiosk's keypad. QR isn't registered here — it's a one-time code
// staff generate themselves from their own app (see OneTimeCode.jsx), never
// a permanent credential someone could screenshot and reuse forever.
export default function BadgeRegistryKiosk({ invoke, onAddStaff }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null); // { id, full_name }
  const [mode, setMode] = useState(null); // null | nfc | code | done
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

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

  const addNewStaff = async () => {
    if (!onAddStaff || !query.trim() || adding) return;
    setAdding(true);
    setAddError("");
    try {
      const created = await onAddStaff(query.trim());
      setSelected(created);
    } catch {
      setAddError("Couldn't add that staff member — try again.");
    } finally {
      setAdding(false);
    }
  };

  const reset = () => { setSelected(null); setMode(null); setQuery(""); setMatches([]); setAccessCode(""); setRegisterError(""); setAddError(""); };

  if (!selected) {
    return (
      <Screen modeKey="search" className="p-8 space-y-4">
        <p className="font-bold text-xl text-center">Badge registry</p>
        <p className="text-base text-muted-foreground text-center">Find yourself to register a badge or get an access code</p>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type your name…" className="pl-11 h-14 text-lg rounded-2xl" />
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {matches.map((s) => (
            <button key={s.id} type="button" onClick={() => setSelected(s)} className="w-full text-left p-4 rounded-2xl border hover:bg-accent hover:border-primary transition-colors text-lg font-medium">
              {s.full_name}
            </button>
          ))}
          {query.trim() && matches.length === 0 && <p className="text-base text-muted-foreground text-center py-4">No matches.</p>}
        </div>
        {onAddStaff && query.trim() && (
          <div className="pt-1 space-y-1.5">
            <Button variant="outline" className="w-full h-14 rounded-2xl" onClick={addNewStaff} disabled={adding}>
              <UserPlus className="w-4 h-4 mr-1.5" /> {adding ? "Adding…" : `Add "${query.trim()}" as new staff`}
            </Button>
            {addError && <p className="text-xs text-destructive text-center">{addError}</p>}
          </div>
        )}
      </Screen>
    );
  }

  if (mode === "done") {
    return (
      <Card className="rounded-3xl shadow-xl border-border/60 overflow-hidden bg-gradient-to-b from-emerald-500/15 to-transparent">
        <CardContent key="done" className="p-10 text-center space-y-4 animate-in fade-in zoom-in-90 duration-500">
          <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/15 grid place-items-center animate-in zoom-in spin-in-6 duration-500">
            <CheckCircle2 className="w-11 h-11 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold">Badge linked to {selected.full_name}!</p>
          <Button variant="outline" className="h-12 px-6 rounded-2xl" onClick={reset}>Done</Button>
        </CardContent>
      </Card>
    );
  }

  if (mode === "nfc") {
    return (
      <Screen modeKey="nfc" className="p-8 text-center space-y-5">
        <Button variant="ghost" className="mb-1" onClick={() => setMode(null)}><ChevronLeft className="w-5 h-5 mr-1" /> Back</Button>
        <div className="relative mx-auto w-28 h-28 grid place-items-center">
          {listening && <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />}
          <div className="relative w-full h-full rounded-full bg-gradient-to-br from-primary/20 to-primary/5 grid place-items-center shadow-inner">
            <CreditCard className={`w-12 h-12 text-primary ${listening ? "animate-pulse" : ""}`} />
          </div>
        </div>
        <p className="text-xl font-semibold">Tap {selected.full_name}'s badge now</p>
        {nfcError && <p className="text-sm text-destructive">{nfcError}</p>}
        {registerError && <p className="text-sm text-destructive">{registerError}</p>}
      </Screen>
    );
  }

  if (mode === "code") {
    return (
      <Screen modeKey="code" className="p-8 text-center space-y-5">
        <p className="text-xl font-semibold">{selected.full_name}'s access code</p>
        <p className="text-5xl font-bold tracking-[0.3em] text-primary">{accessCode}</p>
        <p className="text-sm text-muted-foreground">
          Give this code to {selected.full_name.split(" ")[0]} — they'll type it on the bus boarding kiosk's keypad instead of tapping a badge.
        </p>
        <Button className="h-12 px-8 rounded-2xl" onClick={reset}>Done</Button>
      </Screen>
    );
  }

  return (
    <Screen modeKey="actions" className="p-8 text-center space-y-5">
      <Button variant="ghost" className="mb-1" onClick={reset}><ChevronLeft className="w-5 h-5 mr-1" /> Back</Button>
      <p className="font-bold text-2xl">{selected.full_name}</p>
      <div className="grid grid-cols-1 gap-3">
        <Button variant="outline" className="h-16 text-base rounded-2xl" onClick={() => setMode("nfc")} disabled={!nfcSupported}>
          <CreditCard className="w-5 h-5 mr-2" /> Register NFC badge
        </Button>
        <Button variant="outline" className="h-16 text-base rounded-2xl" onClick={generateCode} disabled={busy}>
          <Hash className="w-5 h-5 mr-2" /> Generate access code
        </Button>
      </div>
      {registerError && <p className="text-sm text-destructive">{registerError}</p>}
      {!nfcSupported && <p className="text-xs text-muted-foreground">NFC isn't supported on this device — an access code still works.</p>}
    </Screen>
  );
}
