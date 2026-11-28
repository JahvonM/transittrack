import { confirmAction } from "@/components/ConfirmHost";
import React, { useEffect, useRef, useState } from "react";
import { Check, Mail, MapPin, Nfc, Pencil, QrCode, Smartphone, UserCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PassengerPickupDialog from "@/components/directory/PassengerPickupDialog";
import { useCardReader, formatUid, normalizeUid } from "@/lib/cardReader";
import { busesForPickup, inviteText, isReady, stepsOf } from "@/lib/signupDay";
import { JoinQrImage } from "./SignupDialogs";

const errorText = (e, fallback) => e?.response?.data?.error || e?.message || fallback;
const NO_BUS = "__none__";
const firstName = (name) => String(name || "them").split(/\s+/)[0];

function Step({ n, icon: Icon, title, done, status, children }) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? "bg-success text-white" : "bg-secondary text-muted-foreground"}`} aria-hidden="true">
          {done ? <Check className="h-5 w-5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{title}</p>
          <p className={`mt-0.5 text-body-sm ${done ? "text-success" : "text-muted-foreground"}`}>{status}</p>
          {children && <div className="mt-3 space-y-3">{children}</div>}
        </div>
      </div>
    </li>
  );
}

// Giving a card: the USB reader on a laptop (through the McSween Card Reader
// helper), an Android phone's own NFC, or typing the number printed on it.
function GiveCard({ person, onChanged }) {
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState(null);
  const [typed, setTyped] = useState("");
  const busy = useRef(false);
  const issue = async ({ uid, cardType }) => {
    if (busy.current) return;
    busy.current = true;
    setMsg({ tone: "muted", text: `Saving card ${formatUid(uid)}…` });
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "issue", person_key: person.key, uid, card_type: cardType || "" });
      const data = res.data || {};
      if (!data.ok) throw new Error(data.error || "The card wasn't saved");
      feedback("success");
      setArmed(false); setTyped("");
      setMsg({ tone: "success", text: `Card saved for ${firstName(person.name)}.${data.sent_to_bus ? " It's on its way to their bus tablet." : ""}` });
      onChanged();
    } catch (e) {
      feedback("error");
      setMsg({ tone: "danger", text: errorText(e, "The card wasn't saved. Try again.") });
    } finally { busy.current = false; }
  };
  // Taps only arrive while waiting for a card (active).
  const { helper, reader, webNfc, feedback, connect } = useCardReader(issue, { active: armed });
  const readerReady = helper === "connected" || webNfc;
  const readerText = helper === "connected" ? `USB card reader ready${reader ? ` (${reader})` : ""}.`
    : webNfc ? "This phone's NFC is ready. Hold the card flat against the back of the phone."
    : helper === "connecting" ? "Looking for the USB card reader…"
    : "No card reader on this device. Use the laptop with the USB reader or an Android phone, or type the card number.";
  const tone = { success: "text-success", danger: "text-danger", muted: "text-muted-foreground" };
  return (
    <>
      {armed ? (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3" role="status">
          <p className="font-semibold">{readerReady ? "Hold the card to the reader now" : "Type the card number"}</p>
          <p className="mt-0.5 text-body-sm text-muted-foreground">{readerText}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setArmed(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setArmed(true); setMsg(null); }}><Nfc className="h-4 w-4" aria-hidden="true" /> {person.card === "issued" ? "Give a new card" : "Give card"}</Button>
          {!readerReady && helper !== "connecting" && <Button variant="outline" onClick={connect}>Connect USB reader</Button>}
        </div>
      )}
      {armed && !webNfc && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const uid = normalizeUid(typed); if (uid.length >= 8) issue({ uid }); }}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Card number, e.g. 04:A2:1B:7C" aria-label="Card number" autoComplete="off" className="font-mono" />
          <Button type="submit" variant="outline" disabled={normalizeUid(typed).length < 8}>Save</Button>
        </form>
      )}
      {msg && <p role={msg.tone === "danger" ? "alert" : "status"} className={`text-body-sm ${tone[msg.tone]}`}>{msg.text}</p>}
    </>
  );
}

const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

// The setup email: a personal link that joins them to the hotel once they
// sign in with this email address. Sent again if they can't find it.
function SetupEmail({ person, call, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await call("signup_invite", { person_ref: person.ref });
      const status = res.results?.[0]?.status || "failed";
      setMsg({ ok: status === "sent", text: inviteText(status, person.name) });
      if (status === "sent") onChanged();
    } catch (e) { setMsg({ ok: false, text: errorText(e, inviteText("failed")) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-1.5">
      <Button variant="outline" onClick={send} loading={busy}><Mail className="h-4 w-4" aria-hidden="true" /> {person.invite_sent_at ? "Send the setup email again" : "Email the setup link"}</Button>
      {person.invite_sent_at && !msg && <p className="text-body-sm text-muted-foreground">Setup email sent at {clock(person.invite_sent_at)}{person.invite_sent_by ? ` by ${person.invite_sent_by}` : ""}.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-body-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

// Which bus picks them up, chosen with their pickup spot (nfcCards set_bus
// keeps their directory card and app account on the same bus).
function BusChoice({ person, buses, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const change = async (value) => {
    setBusy(true); setMsg(null);
    try {
      const vehicleId = value === NO_BUS ? "" : value;
      const res = await base44.functions.invoke("nfcCards", { action: "set_bus", person_key: person.key, vehicle_id: vehicleId });
      if (res.data?.error) throw new Error(res.data.error);
      const name = buses.find((b) => b.id === vehicleId)?.name;
      setMsg({ ok: true, text: name ? `${firstName(person.name)} rides ${name}.` : "Taken off their bus." });
      await onChanged();
    } catch (e) { setMsg({ ok: false, text: errorText(e, "Couldn't change the bus. Try again.") }); }
    finally { setBusy(false); }
  };
  if (!buses.length) return <p className="text-body-sm text-muted-foreground">This hotel has no buses yet. Add them in Admin → Vehicles.</p>;
  // The bus whose route drives past their pickup spot, one tap away.
  const { passing, currentPasses } = busesForPickup(person, buses);
  const suggestion = !person.vehicle_id || currentPasses === false ? passing[0] : null;
  const first = firstName(person.name);
  return (
    <div className="space-y-1.5">
      {suggestion && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2" role="status">
          <p className="text-body-sm">{suggestion.route?.name ? `${suggestion.route.name}` : "A route"} passes {first}'s pickup spot ({Math.round(suggestion.distanceM)} m away).</p>
          <Button size="sm" onClick={() => change(suggestion.id)} disabled={busy}>Put {first} on {suggestion.name}</Button>
        </div>
      )}
      {currentPasses === false && <p className="text-body-sm text-warning">{person.bus || "Their bus"} doesn't drive past {first}'s pickup spot.{passing.length ? "" : " No bus's route does yet, so check Plan pickups."}</p>}
      {!person.vehicle_id && person.pickup && !passing.length && <p className="text-body-sm text-muted-foreground">No bus's route passes this pickup spot yet. Choose a bus below, or check Plan pickups.</p>}
      <Select value={person.vehicle_id || NO_BUS} onValueChange={change} disabled={busy}>
        <SelectTrigger aria-label={`${firstName(person.name)}'s bus`}><SelectValue placeholder="Choose their bus" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_BUS}>No bus yet</SelectItem>
          {buses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-body-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

export default function SignupPersonSheet({ person, company, buses = [], call, onChanged, onClose }) {
  const [claim, setClaim] = useState({ state: "claiming" }); // claiming | mine | taken | free
  const [showQr, setShowQr] = useState(!person?.registered);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [appBusy, setAppBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [details, setDetails] = useState({ name: person?.name || "", email: person?.email || "", phone: person?.phone || "" });
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = person?.ref;

  // Opening someone means "I'm helping them": the other helpers see it.
  const take = async (takeOver = false) => {
    try {
      await call("signup_claim", { person_ref: ref, take_over: takeOver });
      setClaim({ state: "mine" }); onChanged();
    } catch (e) {
      const data = e?.response?.data;
      if (data?.code === "taken") setClaim({ state: "taken", name: data.helper_name });
      else { setClaim({ state: "free" }); setError(errorText(e, "Couldn't mark them as yours.")); }
    }
  };
  useEffect(() => { if (ref) take(false); }, [ref]);
  // Keep the claim fresh while the panel is open (claims lapse after 20 minutes).
  useEffect(() => {
    if (claim.state !== "mine") return undefined;
    const timer = setInterval(() => { call("signup_claim", { person_ref: ref }).catch(() => {}); }, 4 * 60_000);
    return () => clearInterval(timer);
  }, [claim.state, ref, call]);

  if (!person) return null;
  const steps = stepsOf(person);
  const first = firstName(person.name);
  const pickupRoutes = [...new Map(buses.filter((bus) => bus.route).map((bus) => [bus.route.id, bus.route])).values()];
  const selectedPickupRouteId = buses.find((bus) => bus.id === person.vehicle_id)?.route?.id || "";
  const relevantPickupRoutes = selectedPickupRouteId
    ? pickupRoutes.filter((route) => route.id === selectedPickupRouteId)
    : pickupRoutes;
  const letGo = async () => { await call("signup_claim", { person_ref: ref, release: true }).catch(() => {}); onChanged(); onClose(); };
  const remove = async () => {
    if (!(await confirmAction({ title: `Remove ${person.name}?`, description: "This deletes their app login and sign-in, removes them from the sign-up list, passengers and users, and stops their card and codes. Past trips are kept. This can't be undone. (If they also ride with another company you don't manage, only this company is removed.)", confirmLabel: "Remove and delete login" }))) return;
    setRemoving(true); setError("");
    try {
      const data = await call("signup_remove", { person_ref: ref });
      if (!data?.ok) throw new Error(data?.error || "Removal failed");
      toast({ title: `${person.name} removed`, description: data.login_deleted ? "Their app login was deleted too." : data.kept_for_other_company ? "They also ride with another company, so their login was kept." : "They had no app login." });
      onClose(); await onChanged();
    }
    catch (e) { setError(errorText(e, "Couldn't remove this passenger.")); }
    finally { setRemoving(false); }
  };
  const setApp = async (value) => {
    setAppBusy(true); setError("");
    try { await call("signup_app", { person_ref: ref, has_app: value }); onChanged(); }
    catch (e) { setError(errorText(e, "Couldn't save that. Try again.")); }
    finally { setAppBusy(false); }
  };
  const saveDetails = async (event) => {
    event.preventDefault();
    setDetailsBusy(true); setError("");
    try {
      const result = await call("signup_edit", { person_ref: ref, ...details });
      if (!result?.ok) throw new Error(result?.error || "Couldn't update their details");
      setEditingDetails(false);
      await onChanged(result.person_ref);
    } catch (e) { setError(errorText(e, "Couldn't update their details. Try again.")); }
    finally { setDetailsBusy(false); }
  };

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle className="text-title-md">{person.name}</SheetTitle>
          <SheetDescription>{[person.email || "No email yet", person.phone].filter(Boolean).join(", ")}</SheetDescription>
        </SheetHeader>
        <div className="mt-3">
          {editingDetails ? (
            <form className="space-y-3 rounded-xl border border-border p-3" onSubmit={saveDetails}>
              <div className="space-y-1.5">
                <Label htmlFor="signup-person-name">Name</Label>
                <Input id="signup-person-name" value={details.name} maxLength={120} required
                  disabled={detailsBusy} onChange={(e) => setDetails((v) => ({ ...v, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-person-email">Email</Label>
                <Input id="signup-person-email" type="email" value={details.email} maxLength={160}
                  disabled={detailsBusy || person.registered}
                  onChange={(e) => setDetails((v) => ({ ...v, email: e.target.value }))} />
                {person.registered && <p className="text-body-sm text-muted-foreground">Their sign-in email can only be changed through their account.</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-person-phone">Phone number</Label>
                <Input id="signup-person-phone" type="tel" value={details.phone} maxLength={40}
                  disabled={detailsBusy} onChange={(e) => setDetails((v) => ({ ...v, phone: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={detailsBusy || !details.name.trim()}>{detailsBusy ? "Saving…" : "Save details"}</Button>
                <Button type="button" variant="outline" disabled={detailsBusy} onClick={() => setEditingDetails(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { setDetails({ name: person.name || "", email: person.email || "", phone: person.phone || "" }); setEditingDetails(true); }}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit contact details
            </Button>
          )}
        </div>

        <div className="mt-3 rounded-xl bg-secondary px-3 py-2 text-body-sm" role="status">
          {claim.state === "mine" ? <span className="flex flex-wrap items-center justify-between gap-2">You're helping {first}.<Button variant="ghost" size="sm" onClick={letGo}>Let go</Button></span>
            : claim.state === "taken" ? <span className="flex flex-wrap items-center justify-between gap-2"><span><b>{claim.name || "Someone"}</b> is helping {first}.</span><Button variant="outline" size="sm" onClick={() => take(true)}>Take over</Button></span>
            : claim.state === "claiming" ? "Marking them as yours…" : <span className="flex flex-wrap items-center justify-between gap-2">Nobody is helping {first}.<Button variant="outline" size="sm" onClick={() => take(false)}>Help {first}</Button></span>}
        </div>
        {error && <p role="alert" className="mt-2 text-body-sm text-danger">{error}</p>}

        <ol className="mt-4 space-y-3">
          <Step n={1} icon={UserCheck} title="Join and sign in" done={steps.signed}
            status={steps.signed ? "Signed in and joined." : `Waiting for ${first} to sign in. This ticks by itself.`}>
            {!steps.signed && (
              <>
                {person.email && <SetupEmail person={person} call={call} onChanged={onChanged} />}
                <Button variant="outline" onClick={() => setShowQr((v) => !v)}><QrCode className="h-4 w-4" aria-hidden="true" /> {showQr ? "Hide the join QR" : "Show the join QR"}</Button>
                {showQr && (company?.join_code ? (
                  <div className="space-y-2">
                    <JoinQrImage code={company.join_code} hotel={company.name} className="h-56 w-56" />
                    <p className="text-body-sm text-muted-foreground">{first} opens the camera, scans this and taps the link. They create an account{person.email ? <> with <b>{person.email}</b></> : ""} (Google or Apple works too) and join {company.name} by themselves.</p>
                  </div>
                ) : <p className="text-body-sm text-warning">This hotel has no join code yet. Make one in Admin → Companies.</p>)}
              </>
            )}
          </Step>

          <Step n={2} icon={Smartphone} title="App on their phone" done={steps.app}
            status={person.app === "alerts" ? "The app is on their phone with alerts on." : person.app === "ticked" ? "Ticked: the app is on their phone." : "Not yet."}>
            {!steps.app && (
              <p className="text-body-sm text-muted-foreground">
                iPhone: after signing in, Safari shows how to add the app to the Home Screen. Then they open it from there straight away (it opens signed in and joined) and tap Allow all.
                Android: they tap Install the app, then Allow all.
              </p>
            )}
            {person.app !== "alerts" && (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                <span className="text-body-sm font-medium">{first} has the app on their phone</span>
                <Switch checked={person.app === "ticked"} disabled={appBusy} onCheckedChange={setApp} aria-label={`${first} has the app`} />
              </label>
            )}
          </Step>

          <Step n={3} icon={MapPin} title="Pickup spot" done={steps.pickup}
            status={[steps.pickup ? person.pickup_name || "Pickup spot set." : "Not set yet.", person.bus && `Rides ${person.bus}.`].filter(Boolean).join(" ")}>
            <Button variant={steps.pickup ? "outline" : "default"} onClick={() => setPickupOpen(true)}><MapPin className="h-4 w-4" aria-hidden="true" /> {steps.pickup ? "Change pickup spot" : "Set pickup spot"}</Button>
            {!steps.pickup && <p className="text-body-sm text-muted-foreground">Or {first} sets it in the app: More → My home pickup spot.</p>}
            <BusChoice person={person} buses={buses} onChanged={onChanged} />
          </Step>

          <Step n={4} icon={Nfc} title="NFC card" done={steps.card}
            status={steps.card ? `Card ending ${person.card_tail || "…"}${person.bus ? `, rides ${person.bus}` : ""}.` : person.card === "stopped" ? "Their old card was stopped. Give them a new one." : person.card === "expired" ? "Their card has expired. Give them a new one." : "No card yet."}>
            <GiveCard person={person} onChanged={onChanged} />
          </Step>
        </ol>

        {isReady(person) && (
          <div className="mt-4 rounded-2xl border border-success/40 bg-success/10 p-4" role="status">
            <p className="font-semibold text-success">{first} is all set.</p>
            <Button className="mt-2" onClick={letGo}>Next person</Button>
          </div>
        )}

        <div className="mt-6 border-t pt-4">
          <Button variant="outline" className="text-danger" disabled={removing || claim.state !== "mine"} onClick={remove}>{removing ? "Removing…" : "Remove passenger"}</Button>
        </div>
        {pickupOpen && <PassengerPickupDialog person={person} routes={relevantPickupRoutes} selectedRouteId={selectedPickupRouteId} onClose={() => setPickupOpen(false)} onSaved={async () => onChanged()} />}
      </SheetContent>
    </Sheet>
  );
}
