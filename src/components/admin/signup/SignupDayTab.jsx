import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCheck, MapPin, Nfc, QrCode, Search, Smartphone, Upload, UserCheck, UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState, PageActions, PageIntro, Segmented } from "@/components/admin/kit";
import BusLoader from "@/components/BusLoader";
import { STEPS, progress, stepsOf, isReady, visiblePeople } from "@/lib/signupDay";
import SignupPersonSheet from "./SignupPersonSheet";
import { AddPersonDialog, ImportListDialog, TableQr } from "./SignupDialogs";

// Sign-up day at a hotel. Everyone helping opens this page on their own phone,
// tablet or laptop and works from the same live list of the hotel's staff:
// who has signed in, has the app, has a pickup spot and has a card, and which
// helper is with whom. The list refreshes every few seconds.

const HOTEL_KEY = "tt-signup-hotel";
const REFRESH_MS = 5000;
const STEP_ICONS = { signed: UserCheck, app: Smartphone, pickup: MapPin, card: Nfc };
const errorText = (e, fallback) => e?.response?.data?.error || e?.message || fallback;

function StepMarks({ person }) {
  const s = stepsOf(person);
  return (
    <span className="flex items-center gap-1" aria-label={STEPS.map((st) => `${st.label} ${s[st.id] ? "done" : "not done"}`).join(", ")}>
      {STEPS.map((st) => {
        const Icon = STEP_ICONS[st.id];
        return (
          <span key={st.id} title={st.label} aria-hidden="true"
            className={`grid h-8 w-8 place-items-center rounded-lg ${s[st.id] ? "bg-success text-white" : "bg-secondary text-muted-foreground/70"}`}>
            {s[st.id] ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
          </span>
        );
      })}
    </span>
  );
}

function PersonRow({ person, onOpen }) {
  const helper = person.helper;
  return (
    <li>
      <button type="button" onClick={() => onOpen(person.ref)}
        className="flex min-h-[64px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{person.name}</span>
          <span className="block truncate text-body-sm text-muted-foreground">
            {helper ? (helper.mine ? "You're helping" : `${helper.name} is helping`) : isReady(person) ? "All set" : person.email || "No email yet"}
          </span>
        </span>
        <StepMarks person={person} />
      </button>
    </li>
  );
}

export default function SignupDayTab() {
  const { toast } = useToast();
  const [hotels, setHotels] = useState(null);
  const [hotelId, setHotelId] = useState(() => { try { return localStorage.getItem(HOTEL_KEY) || ""; } catch { return ""; } });
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("todo");
  const [query, setQuery] = useState("");
  const [openRef, setOpenRef] = useState("");
  const [dialog, setDialog] = useState(""); // add | import | qr
  const loading = useRef(false);

  // Admins choose the hotel; it's remembered on this device for the day.
  useEffect(() => {
    let live = true;
    base44.entities.Company.list("name", 500)
      .then((rows) => { if (live) setHotels((rows || []).filter((c) => c?.id).sort((a, b) => String(a.name).localeCompare(String(b.name)))); })
      .catch(() => { if (live) setHotels([]); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!hotels?.length) return;
    if (!hotels.some((h) => h.id === hotelId)) setHotelId(hotels.length === 1 ? hotels[0].id : "");
  }, [hotels, hotelId]);
  useEffect(() => { try { if (hotelId) localStorage.setItem(HOTEL_KEY, hotelId); } catch { /* chosen again next time */ } }, [hotelId]);

  const call = useCallback(async (action, body = {}) => {
    const res = await base44.functions.invoke("nfcCards", { action, company_id: hotelId, ...body });
    return res.data;
  }, [hotelId]);

  const load = useCallback(async () => {
    if (!hotelId || loading.current) return;
    loading.current = true;
    try { setState(await call("signup_state")); setLoadError(""); }
    catch (e) { setLoadError(errorText(e, "Couldn't load the list. Check the connection.")); }
    finally { loading.current = false; }
  }, [hotelId, call]);

  useEffect(() => { setState(null); setOpenRef(""); setLoadError(""); }, [hotelId]);
  // Every helper's screen follows the others every few seconds while it's open.
  useEffect(() => {
    if (!hotelId) return undefined;
    load();
    const tick = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    const onShow = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onShow); };
  }, [hotelId, load]);

  const people = state?.people || [];
  const counts = useMemo(() => progress(people), [people]);
  const shown = useMemo(() => visiblePeople(people, view, query), [people, view, query]);
  const open = people.find((p) => p.ref === openRef) || null;
  const hotel = state?.company || hotels?.find((h) => h.id === hotelId) || null;

  const add = async (form) => {
    const res = await call("signup_add", form);
    toast({ title: res.existing ? `${res.name} is already on the list` : `${res.name} added` });
    setDialog(""); await load(); setOpenRef(res.person_ref);
  };
  const importRows = async (rows) => { const res = await call("signup_import", { rows }); await load(); return res; };

  if (hotels === null) return <BusLoader className="py-12" />;

  return (
    <div className="space-y-4">
      <PageIntro>Run a sign-up day at a hotel. Everyone helping opens this page on their own phone, tablet or laptop and works from the same list, which updates by itself.</PageIntro>
      <PageActions>
        <Button variant="outline" onClick={() => setDialog("import")} disabled={!hotelId}><Upload className="h-4 w-4" aria-hidden="true" /> Import list</Button>
        <Button variant="outline" onClick={() => setDialog("add")} disabled={!hotelId}><UserPlus className="h-4 w-4" aria-hidden="true" /> Add person</Button>
        <Button onClick={() => setDialog("qr")} disabled={!state?.company?.join_code}><QrCode className="h-4 w-4" aria-hidden="true" /> Table QR</Button>
      </PageActions>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 sm:max-w-sm">
          <label htmlFor="signup-hotel" className="mb-1.5 block text-body-sm font-medium">Hotel</label>
          <Select value={hotelId} onValueChange={setHotelId}>
            <SelectTrigger id="signup-hotel"><SelectValue placeholder="Choose the hotel" /></SelectTrigger>
            <SelectContent>{(hotels || []).map((h) => <SelectItem key={h.id} value={h.id}>{h.name || "Unnamed company"}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {state && (
          <div className="min-w-[220px] flex-1" role="status" aria-live="polite">
            <p className="text-body-sm text-muted-foreground"><span className="font-display text-title-md font-semibold tabular-nums text-foreground">{counts.ready}</span> of {counts.total} all set</p>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              <div className="bg-success transition-[width] duration-500" style={{ width: `${counts.total ? (counts.ready / counts.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {!hotelId ? (
        <EmptyState icon={ClipboardCheck} title="Choose the hotel">Pick the hotel you're signing up today. Everyone helping picks the same one.</EmptyState>
      ) : !state && !loadError ? (
        <BusLoader className="py-12" />
      ) : (
        <>
          {loadError && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-body-sm text-danger">{loadError}</p>}
          {state && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STEPS.map((st) => {
                const Icon = STEP_ICONS[st.id];
                return (
                  <div key={st.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-body-sm">{st.label}</span>
                    <span className="font-display text-title-sm font-semibold tabular-nums">{counts[st.id]}<span className="text-body-sm font-normal text-muted-foreground">/{counts.total}</span></span>
                  </div>
                );
              })}
            </div>
          )}
          {state && !state.company?.join_code && (
            <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-body-sm">{hotel?.name || "This hotel"} has no join code yet, so there's no QR to scan. Make one in Admin → Companies.</p>
          )}

          {state && people.length === 0 ? (
            <EmptyState icon={UserPlus} title={`No one on ${hotel?.name || "the hotel"}'s list yet`}
              action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setDialog("import")}>Import their staff list</Button><Button variant="outline" onClick={() => setDialog("add")}>Add a person</Button></div>}>
              Import the hotel's staff list, add people as they arrive, or put the Table QR out so staff can join by themselves. They appear here as they sign in.
            </EmptyState>
          ) : state && (
            <section className="rounded-2xl border border-border bg-card p-2 sm:p-3" aria-label="Staff">
              <div className="flex flex-wrap items-center gap-2 p-1 pb-3">
                <Segmented label="Show" value={view} onChange={setView} options={[
                  { value: "todo", label: "To do" }, { value: "mine", label: "Mine" }, { value: "ready", label: "All set" }, { value: "all", label: "Everyone" },
                ]} />
                <div className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or phone" aria-label="Search staff" className="pl-9" />
                </div>
              </div>
              {shown.length ? (
                <ul className="divide-y divide-border/70">{shown.map((p) => <PersonRow key={p.ref} person={p} onOpen={setOpenRef} />)}</ul>
              ) : (
                <p className="px-3 py-8 text-center text-body-sm text-muted-foreground">
                  {query ? "No one matches that search." : view === "mine" ? "You're not helping anyone right now. Tap a name to start." : view === "ready" ? "No one is all set yet." : "Everyone left is being helped or is all set."}
                </p>
              )}
            </section>
          )}
        </>
      )}

      {open && <SignupPersonSheet key={open.ref} person={open} company={state?.company} call={call} onChanged={load} onClose={() => setOpenRef("")} />}
      {dialog === "add" && <AddPersonDialog hotel={hotel?.name} onAdd={add} onClose={() => setDialog("")} />}
      {dialog === "import" && <ImportListDialog hotel={hotel?.name} onImport={importRows} onClose={() => setDialog("")} />}
      {dialog === "qr" && state?.company?.join_code && <TableQr code={state.company.join_code} hotel={state.company.name} onClose={() => setDialog("")} />}
    </div>
  );
}
