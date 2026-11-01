import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageIntro, Row, Segmented, StatusChip, Toolbar, LeadIcon } from "@/components/admin/kit";
import { errorData } from "@/lib/requestError";
import { Inbox, Loader2, RefreshCw, Star } from "lucide-react";
import { CASE_KIND_TEXT, isChange, isOpen, officeStatuses } from "../../../base44/shared/passengerCases.ts";

// Admin → Passenger support: requests and problems passengers send from the
// app (time or pickup changes, cancelling a ride, missed pickups, card and
// booking problems, ride feedback). Answer them, and confirm or turn down
// changes; the passenger sees each reply and status on their phone.

const TZ = "America/Grenada";
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const day = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "");
const STATUS_TEXT = { requested: "New", pending: "In progress", confirmed: "Confirmed", rejected: "Turned down", resolved: "Resolved", closed: "Closed" };
const STATUS_TONE = { requested: "warning", pending: "info", confirmed: "success", rejected: "danger", resolved: "success", closed: "neutral" };
const ACTION_TEXT = { pending: "Mark in progress", confirmed: "Confirm", rejected: "Turn down", resolved: "Mark resolved", closed: "Close" };

function CaseDialog({ item, onClose, onChanged }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  useEffect(() => { setText(""); setProblem(""); }, [item?.id]);
  if (!item) return null;
  const act = async (body, label) => {
    setBusy(label); setProblem("");
    try {
      const { data } = await base44.functions.invoke("passengerCases", { id: item.id, ...body });
      toast({ title: label === "reply" ? "Reply sent" : `Request ${STATUS_TEXT[body.status]?.toLowerCase() || "updated"}` });
      setText("");
      onChanged(data.case);
    } catch (e) { setProblem(errorData(e).error || "Couldn't save. Try again."); }
    finally { setBusy(""); }
  };
  const statuses = officeStatuses(item.kind).filter((s) => s !== item.status);
  const rejecting = !text.trim() ? "Say why in the message box first, so the passenger knows." : "";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{CASE_KIND_TEXT[item.kind] || "Request"} · {item.reference}</DialogTitle>
          <DialogDescription>{item.user_name || "Passenger"}{item.company_name ? ` · ${item.company_name}` : ""} · sent {when(item.created_date)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-body-sm">
          <StatusChip tone={STATUS_TONE[item.status]}>{STATUS_TEXT[item.status]}</StatusChip>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {item.requested_date && <><dt className="text-muted-foreground">Day</dt><dd>{day(item.requested_date)}</dd></>}
            {item.requested_time && <><dt className="text-muted-foreground">Time asked for</dt><dd>{item.requested_time}</dd></>}
            {item.requested_pickup && <><dt className="text-muted-foreground">Pickup asked for</dt><dd>{item.requested_pickup}</dd></>}
            {item.rating && <><dt className="text-muted-foreground">Rating</dt><dd>{item.rating} of 5</dd></>}
            <dt className="text-muted-foreground">Bus</dt><dd>{item.vehicle_name || "None assigned"}{item.leg ? ` · ${item.leg === "to_home" ? "going home" : "going to work"}` : ""}</dd>
            {item.pickup_name && <><dt className="text-muted-foreground">Usual pickup</dt><dd>{item.pickup_name}</dd></>}
            {item.ride_boarded_at && <><dt className="text-muted-foreground">Boarded that day</dt><dd>{when(item.ride_boarded_at)}</dd></>}
            {item.user_email && <><dt className="text-muted-foreground">Email</dt><dd className="break-all">{item.user_email}</dd></>}
          </dl>
          {item.details && <p className="whitespace-pre-wrap rounded-xl bg-secondary p-3">{item.details}</p>}
          {(item.replies || []).length > 0 && (
            <ol className="space-y-2" aria-label="Replies">
              {item.replies.map((r, i) => (
                <li key={i} className={`rounded-xl p-3 ${r.from === "office" ? "bg-primary/10" : "bg-secondary"}`}>
                  <p className="text-caption font-semibold">{r.from === "office" ? r.name || "Office" : item.user_name || "Passenger"} · {when(r.at)}</p>
                  <p className="whitespace-pre-wrap">{r.text}</p>
                </li>
              ))}
            </ol>
          )}
          {isOpen(item.status) ? (
            <div className="space-y-2">
              <Label htmlFor="case-reply">Message to the passenger</Label>
              <Textarea id="case-reply" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
              {problem && <p role="alert" className="text-danger">{problem}</p>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={!!busy || !text.trim()} onClick={() => act({ action: "reply", text }, "reply")}>{busy === "reply" && <Loader2 className="h-4 w-4 animate-spin" />}Send reply</Button>
                {statuses.map((s) => (
                  <Button key={s} variant={s === "rejected" ? "outline" : "secondary"} className={s === "rejected" ? "text-destructive" : ""} disabled={!!busy || (s === "rejected" && !!rejecting)}
                    title={s === "rejected" ? rejecting : undefined} onClick={() => act({ action: "set_status", status: s, note: text }, s)}>
                    {busy === s && <Loader2 className="h-4 w-4 animate-spin" />}{ACTION_TEXT[s]}{text.trim() && s !== "pending" ? " with message" : ""}
                  </Button>
                ))}
              </div>
              {isChange(item.kind) && <p className="text-caption text-muted-foreground">Confirming tells the passenger it's arranged. Make the change itself (driver, pickup or job) as you normally do.</p>}
            </div>
          ) : (
            <p className="text-muted-foreground">Finished{item.closed_by ? ` by ${item.closed_by}` : ""}{item.closed_at ? ` on ${when(item.closed_at)}` : ""}.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PassengerCasesTab() {
  const [show, setShow] = useState("open");
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const load = useCallback(async () => {
    setState((s) => (s === "ready" ? "refreshing" : "loading"));
    try {
      const { data } = await base44.functions.invoke("passengerCases", { action: "list", show });
      setRows(data.cases || []); setState("ready"); setError("");
    } catch (e) { setError(errorData(e).error || "Couldn't load passenger requests."); setState("error"); }
  }, [show]);
  useEffect(() => { load(); }, [load]);
  const open = rows.find((r) => r.id === openId) || null;
  const changed = (c) => { setRows((prev) => prev.map((r) => (r.id === c.id ? c : r)).filter((r) => show === "all" || isOpen(r.status))); if (!isOpen(c.status) && show !== "all") setOpenId(null); };
  return (
    <div>
      <PageIntro>Requests and problems passengers send from the app, each with a reference number. Replies and status changes reach the passenger in the app.</PageIntro>
      <Toolbar actions={<Button variant="outline" size="sm" onClick={load} disabled={state === "loading" || state === "refreshing"}><RefreshCw className={`h-4 w-4 ${state === "refreshing" ? "animate-spin" : ""}`} />Refresh</Button>}>
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} />
      </Toolbar>
      {state === "loading" ? <p role="status" className="text-muted-foreground">Loading passenger requests…</p>
        : state === "error" ? <EmptyState icon={Inbox} title="Couldn't load requests" action={<Button onClick={load}>Try again</Button>}>{error}</EmptyState>
        : rows.length === 0 ? <EmptyState icon={Inbox} title={show === "open" ? "Nothing waiting" : "No requests yet"}>When a passenger asks for a change or reports a problem, it shows here.</EmptyState>
        : (
          <ul className="space-y-1 rounded-2xl border border-border bg-card p-2" aria-label="Passenger requests">
            {rows.map((r) => (
              <li key={r.id}>
                <Row onClick={() => setOpenId(r.id)}
                  lead={<LeadIcon icon={r.kind === "feedback" ? Star : Inbox} tone={r.office_unread ? "warning" : "neutral"} />}
                  title={`${CASE_KIND_TEXT[r.kind] || "Request"} · ${r.user_name || "Passenger"}`}
                  subtitle={`${r.reference} · ${r.vehicle_name || "No bus"} · ${when(r.created_date)}${r.requested_date ? ` · for ${day(r.requested_date)}` : ""}${r.rating ? ` · ${r.rating}/5` : ""}`}
                  meta={<><StatusChip tone={STATUS_TONE[r.status]}>{STATUS_TEXT[r.status]}</StatusChip>{r.office_unread && <span className="text-caption font-semibold text-warning">New message</span>}</>} />
              </li>
            ))}
          </ul>
        )}
      <CaseDialog item={open} onClose={() => setOpenId(null)} onChanged={changed} />
    </div>
  );
}
