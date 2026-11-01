import React, { useEffect, useState } from "react";
import { ChevronRight, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";
import { errorData } from "@/lib/requestError";
import { BottomSheet } from "@/components/staff/StaffSheets";
import { CASE_KIND_TEXT, caseStatusText, isOpen, readCaseRequest } from "../../../base44/shared/passengerCases.ts";

// Passenger requests and support cases: ask for a change or report a problem,
// see its reference and status, and talk to the office about it.

const TZ = "America/Grenada";
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const day = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "");
const LOST_ITEM_TEXT = "Lost item";
const kindText = (k) => (k === "lost_item" ? LOST_ITEM_TEXT : CASE_KIND_TEXT[k] || "Request");

const HINT = {
  time_change: "Ask for a different pickup time on one day. Your driver keeps the usual time until the office confirms.",
  pickup_change: "Ask to be picked up somewhere else on one day. To change your usual pickup, use My home pickup spot.",
  cancel_ride: "Tell the office you won't need the bus on a later day. For today, use Skip today.",
  missed_pickup: "We'll tell your bus team straight away. Say where you are and what happened.",
  card_issue: "Card not working, damaged or not received? If it's lost, use Report lost card on My pass.",
  booking_issue: "A booked ride that is wrong or missing.",
  other: "Anything else about your transport.",
};

// Ask for a change or report a problem. `kinds` limits the choices.
export function RequestForm({ kinds, send, sending, onSent, bookedTrips = [] }) {
  const { toast } = useToast();
  const [kind, setKind] = useState(kinds[0]);
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [details, setDetails] = useState("");
  const [tripId, setTripId] = useState("");
  const [problem, setProblem] = useState("");
  useEffect(() => setProblem(""), [kind, date, time, place, details]);
  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    const body = { kind, details, requested_date: date, requested_time: time, requested_pickup: place, trip_id: tripId || undefined };
    const checked = readCaseRequest(body, todayIso());
    if (checked.error) { setProblem(checked.error); return; }
    try {
      const res = await send({ action: "create", ...body });
      toast({ title: "Request sent", description: `Reference ${res.case.reference}. You'll see the answer here.` });
      setTime(""); setPlace(""); setDetails(""); setTripId("");
      onSent?.(res.case);
    } catch (err) {
      setProblem(errorData(err).error || "Couldn't send your request. Check your connection and try again.");
    }
  };
  const idBase = "px-req-" + kinds.join("-");
  return (
    <form className="px-request-form" onSubmit={submit} noValidate>
      <fieldset>
        <legend className="sr-only">What do you need?</legend>
        <div className="px-choice-list">
          {kinds.map((k) => (
            <label key={k} className="px-choice">
              <input type="radio" name={idBase} value={k} checked={kind === k} onChange={() => setKind(k)} />
              <span>{CASE_KIND_TEXT[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="px-ride-note">{HINT[kind]}</p>
      {["time_change", "pickup_change", "cancel_ride"].includes(kind) && (
        <label className="px-field"><span>Day</span><input type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      )}
      {kind === "time_change" && <label className="px-field"><span>Pickup time you would like</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label>}
      {kind === "pickup_change" && <label className="px-field"><span>Where to pick you up</span><input type="text" value={place} maxLength={160} placeholder="e.g. Grand Anse, opposite the bank" onChange={(e) => setPlace(e.target.value)} required /></label>}
      {kind === "cancel_ride" && bookedTrips.length > 0 && (
        <label className="px-field"><span>Booked ride (optional)</span>
          <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">My usual ride</option>
            {bookedTrips.map((t) => <option key={t.id} value={t.id}>{when(t.scheduled_time)} · {t.pickup_name || "Pickup"}</option>)}
          </select>
        </label>
      )}
      <label className="px-field"><span>{["time_change", "pickup_change", "cancel_ride"].includes(kind) ? "Note (optional)" : "What happened"}</span>
        <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      {problem && <p role="alert" className="px-form-error">{problem}</p>}
      <Button type="submit" className="w-full" disabled={sending}><Send aria-hidden="true" />{sending ? "Sending…" : "Send request"}</Button>
    </form>
  );
}

// The passenger's own requests, newest first, with their status.
export function CaseList({ cases, loading, error, retry, onOpen, empty = "Nothing sent yet." }) {
  if (loading) return <p role="status">Loading your requests…</p>;
  if (error) return <><p role="alert">{error}</p><Button variant="outline" onClick={() => retry()}>Try again</Button></>;
  if (!cases.length) return <p>{empty}</p>;
  return (
    <ul className="px-case-list">
      {cases.map((c) => (
        <li key={c.id}>
          <button type="button" className="px-row" onClick={() => onOpen(c)} aria-label={`${kindText(c.kind)}, ${c.reference}, ${caseStatusText(c.kind, c.status)}${c.unread ? ", new reply" : ""}`}>
            <span><strong>{kindText(c.kind)}</strong><small>{c.reference} · {when(c.created_date)}</small></span>
            <b className={`px-case-state ${c.status}`}>{caseStatusText(c.kind, c.status)}</b>
            {c.unread && <b className="px-count" aria-hidden="true">1</b>}
            <ChevronRight aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// One request: what was asked, the replies, and answering or withdrawing it.
export function CaseSheet({ item, onClose, send, sending }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const open = !!item;
  useEffect(() => {
    setText(""); setProblem("");
    if (item?.unread && item.source === "case") send({ action: "seen", id: item.id }).catch(() => {});
  }, [item?.id]);
  if (!item) return <BottomSheet open={false} onOpenChange={() => {}} title="Request" />;
  const canAnswer = item.source === "case" && isOpen(item.status);
  const reply = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    try { await send({ action: "reply", id: item.id, text }); setText(""); toast({ title: "Message sent" }); onClose(); }
    catch (err) { setProblem(errorData(err).error || "Couldn't send. Try again."); }
  };
  const withdraw = async () => {
    if (!(await confirmAction({ title: "Withdraw this request?", description: `${item.reference} will be closed. You can send a new one any time.`, confirmLabel: "Withdraw" }))) return;
    try { await send({ action: "withdraw", id: item.id }); toast({ title: "Request withdrawn" }); onClose(); }
    catch (err) { setProblem(errorData(err).error || "Couldn't withdraw. Try again."); }
  };
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={`${kindText(item.kind)} · ${item.reference}`} description={caseStatusText(item.kind, item.status)}>
      <div className="px-case-detail space-y-3 pb-4">
        <dl>
          {item.requested_date && <><dt>Day</dt><dd>{day(item.requested_date)}</dd></>}
          {item.requested_time && <><dt>Time asked for</dt><dd>{item.requested_time}</dd></>}
          {item.requested_pickup && <><dt>Pickup asked for</dt><dd>{item.requested_pickup}</dd></>}
          {item.rating && <><dt>Rating</dt><dd>{item.rating} of 5</dd></>}
          {item.vehicle_name && <><dt>Bus</dt><dd>{item.vehicle_name}</dd></>}
          <dt>Sent on</dt><dd>{when(item.created_date)}</dd>
        </dl>
        {item.details && <p className="px-case-text">{item.details}</p>}
        {item.replies?.length > 0 && (
          <ol className="px-case-thread" aria-label="Replies">
            {item.replies.map((r, i) => <li key={i} className={r.from}><strong>{r.name}</strong><small>{when(r.at)}</small><p>{r.text}</p></li>)}
          </ol>
        )}
        {item.source === "lost_item" && <p className="px-ride-note">The office updates lost items here when they find or return them.</p>}
        {canAnswer && (
          <form onSubmit={reply} className="space-y-2">
            <label className="px-field"><span>Add a message</span><textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></label>
            {problem && <p role="alert" className="px-form-error">{problem}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={sending || !text.trim()}>{sending ? "Sending…" : "Send"}</Button>
              <Button type="button" variant="outline" onClick={withdraw} disabled={sending}>Withdraw</Button>
            </div>
          </form>
        )}
      </div>
    </BottomSheet>
  );
}

// After a ride: an optional rating, asked once per ride.
export function RideFeedback({ rideId, send, sending }) {
  const { toast } = useToast();
  const key = "tt_feedback_" + rideId;
  const [done, setDone] = useState(() => { try { return !!localStorage.getItem(key); } catch { return false; } });
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  if (done || !rideId) return null;
  const finish = () => { try { localStorage.setItem(key, "1"); } catch { /* once per visit */ } setDone(true); };
  const submit = async () => {
    if (!rating || sending) return;
    try { await send({ action: "create", kind: "feedback", rating, details: note }); toast({ title: "Thanks for your feedback" }); finish(); }
    catch (err) { setProblem(errorData(err).error || "Couldn't send. Try again."); }
  };
  return (
    <section className="px-panel px-feedback" aria-labelledby="px-feedback-title">
      <h2 id="px-feedback-title">How was your ride?</h2>
      <div className="px-stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} onClick={() => setRating(n)}>
            <Star aria-hidden="true" fill={n <= rating ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      {rating > 0 && <label className="px-field"><span>Anything to add? (optional)</span><textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
      {problem && <p role="alert" className="px-form-error">{problem}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!rating || sending} onClick={submit}>{sending ? "Sending…" : "Send"}</Button>
        <Button variant="ghost" onClick={finish}>Not now</Button>
      </div>
    </section>
  );
}
