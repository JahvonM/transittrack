import React, { useEffect, useState } from "react";
import { AlertTriangle, Ban, CheckCheck, FileDown, Plus, Receipt, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState, Panel, StatusChip, tableClass } from "@/components/admin/kit";
import { formatMoney } from "@/lib/jobs";
import { invoicePdf } from "@/lib/jobDocuments";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { errorData } from "@/lib/requestError";

const STATUS = { draft: { label: "Draft", tone: "neutral" }, sent: { label: "Sent", tone: "info" }, paid: { label: "Paid", tone: "success" }, void: { label: "Void", tone: "danger" } };
const day = (date) => (date ? new Date(`${date}T12:00:00Z`).toLocaleDateString([], { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—");
const pad = (n) => String(n).padStart(2, "0");
// Last month, in the transit time zone: the usual period to invoice.
function lastMonth() {
  const [y, m] = new Date().toLocaleDateString("en-CA", { timeZone: TRANSIT_TIME_ZONE }).split("-").map(Number);
  const year = m === 1 ? y - 1 : y, month = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}
const billing = (action, body) => base44.functions.invoke("jobBilling", { action, time_zone: TRANSIT_TIME_ZONE, ...body }).then((r) => r.data);

function NewInvoiceDialog({ open, onOpenChange, clients, onCreated }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => ({ client_id: "", ...lastMonth(), due_days: "30", notes: "" }));
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setForm({ client_id: "", ...lastMonth(), due_days: "30", notes: "" }); setPreview(null); } }, [open]);
  // A fresh preview whenever the client or the period changes.
  useEffect(() => {
    if (!open || !form.client_id || !form.from || !form.to) { setPreview(null); return undefined; }
    let live = true;
    setPreview({ loading: true });
    billing("preview_invoice", { client_id: form.client_id, from: form.from, to: form.to })
      .then((data) => { if (live) setPreview(data); })
      .catch((e) => { if (live) setPreview({ error: errorData(e).error || "Couldn't check the jobs. Try again." }); });
    return () => { live = false; };
  }, [open, form.client_id, form.from, form.to]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const count = (preview?.invoices || []).reduce((n, i) => n + i.lines.length, 0);
  const create = async () => {
    setBusy(true);
    try {
      const data = await billing("create_invoice", { client_id: form.client_id, from: form.from, to: form.to, due_days: Number(form.due_days), notes: form.notes });
      toast({ title: data.invoices.length === 1 ? `Invoice ${data.invoices[0].number} created` : `${data.invoices.length} invoices created` });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't create the invoice", description: errorData(e).error || "Check the connection and try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>Puts a client's finished, priced jobs for the period on one invoice. A job is only ever on one invoice.</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-client">Client</Label>
            <Select value={form.client_id} onValueChange={(client_id) => set({ client_id })}>
              <SelectTrigger id="invoice-client"><SelectValue placeholder="Choose a client" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-from">Jobs from</Label>
              <Input id="invoice-from" type="date" value={form.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-to">To</Label>
              <Input id="invoice-to" type="date" value={form.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          </div>

          {preview?.loading && <p className="text-body-sm text-muted-foreground">Checking the jobs…</p>}
          {preview?.error && <p className="text-body-sm text-danger">{preview.error}</p>}
          {preview?.invoices && (
            <div className="min-w-0 space-y-2 rounded-xl border border-border p-3">
              {count === 0 ? <p className="text-body-sm text-muted-foreground">No finished, priced jobs for this client in this period that aren't on an invoice already.</p> : (
                preview.invoices.map((group) => (
                  <div key={`${group.company_id}-${group.currency}`} className="min-w-0">
                    <p className="text-body-sm font-semibold">{group.lines.length} job{group.lines.length === 1 ? "" : "s"} · {formatMoney(group.total, group.currency)}</p>
                    <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-caption text-muted-foreground">
                      {group.lines.map((l) => <li key={l.trip_id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{day(l.date)} · {l.description}</span><span className="shrink-0 tabular-nums">{formatMoney(l.amount, group.currency)}</span></li>)}
                    </ul>
                  </div>
                ))
              )}
              {preview.unpriced > 0 && (
                <p className="flex items-start gap-1.5 text-caption text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {preview.unpriced} finished job{preview.unpriced === 1 ? " has" : "s have"} no price and {preview.unpriced === 1 ? "is" : "are"} left off. Open {preview.unpriced === 1 ? "it" : "them"} in the job list to add a price.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-due">Due in (days)</Label>
              <Input id="invoice-due" type="number" min={0} max={365} value={form.due_days} onChange={(e) => set({ due_days: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-notes">Notes on the invoice</Label>
              <Textarea id="invoice-notes" rows={2} maxLength={2000} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Bank details or payment terms" />
            </div>
          </div>
          <Button className="w-full" onClick={create} disabled={busy || !count}>{busy ? "Creating…" : "Create invoice"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Client invoices: create from finished jobs, download, mark sent or paid,
// or void (its jobs can then go on a new invoice).
export default function InvoicesPanel({ invoices = [], clients = [], companies = [], onChange }) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const act = async (invoice, action, body, done) => {
    if (action === "void_invoice" && !window.confirm(`Void invoice ${invoice.number}? Its jobs can then go on a new invoice.`)) return;
    setBusyId(invoice.id);
    try {
      await billing(action, { invoice_id: invoice.id, ...body });
      toast({ title: done });
      onChange?.();
    } catch (e) {
      toast({ title: "Couldn't change the invoice", description: errorData(e).error || "Try again.", variant: "destructive" });
    } finally {
      setBusyId("");
    }
  };
  const sorted = [...invoices].sort((a, b) => String(b.issued_at || "").localeCompare(String(a.issued_at || "")));
  const owed = sorted.filter((i) => i.status === "sent" || i.status === "draft");

  return (
    <Panel
      title="Invoices"
      icon={Receipt}
      description={owed.length ? `${owed.length} not paid yet` : undefined}
      actions={<Button onClick={() => setCreating(true)} disabled={!clients.length}><Plus className="h-4 w-4" /> New invoice</Button>}
    >
      {!clients.length && <p className="mb-3 text-body-sm text-muted-foreground">Add clients on the Jobs page (Clients) and give jobs a client and price to invoice them.</p>}
      {sorted.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices yet" className="border-0">Invoices you create from finished jobs show here.</EmptyState>
      ) : (
        <div className={tableClass.wrap}>
          <table className={tableClass.table}>
            <thead><tr>
              <th className={tableClass.th}>Invoice</th><th className={tableClass.th}>Client</th><th className={tableClass.th}>Jobs from</th>
              <th className={tableClass.th}>Total</th><th className={tableClass.th}>Status</th><th className={tableClass.th}><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {sorted.map((inv) => {
                const st = STATUS[inv.status] || STATUS.draft;
                const busy = busyId === inv.id;
                const company = companies.find((c) => c.id === inv.company_id) || {};
                return (
                  <tr key={inv.id} className={tableClass.tr}>
                    <td className={tableClass.td}><span className="font-semibold">{inv.number}</span><span className="block text-caption text-muted-foreground">Issued {day(String(inv.issued_at || "").slice(0, 10))} · due {day(inv.due_date)}</span></td>
                    <td className={tableClass.td}>{inv.client_name}</td>
                    <td className={`${tableClass.td} whitespace-nowrap`}>{day(inv.period_start)} – {day(inv.period_end)}</td>
                    <td className={`${tableClass.td} tabular-nums`}>{formatMoney(inv.total, inv.currency)}<span className="block text-caption text-muted-foreground">{(inv.lines || []).length} jobs</span></td>
                    <td className={tableClass.td}><StatusChip tone={st.tone}>{st.label}</StatusChip></td>
                    <td className={tableClass.td}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => invoicePdf(inv, company)} aria-label={`Download ${inv.number}`} title="Download PDF"><FileDown className="h-4 w-4" /></Button>
                        {inv.status === "draft" && <Button variant="ghost" size="icon" disabled={busy} onClick={() => act(inv, "set_invoice_status", { status: "sent" }, `${inv.number} marked as sent`)} aria-label={`Mark ${inv.number} as sent`} title="Mark as sent"><Send className="h-4 w-4" /></Button>}
                        {(inv.status === "draft" || inv.status === "sent") && <Button variant="ghost" size="icon" disabled={busy} onClick={() => act(inv, "set_invoice_status", { status: "paid" }, `${inv.number} marked as paid`)} aria-label={`Mark ${inv.number} as paid`} title="Mark as paid"><CheckCheck className="h-4 w-4" /></Button>}
                        {inv.status !== "void" && inv.status !== "paid" && <Button variant="ghost" size="icon" className="text-danger hover:text-danger" disabled={busy} onClick={() => act(inv, "void_invoice", {}, `${inv.number} voided`)} aria-label={`Void ${inv.number}`} title="Void"><Ban className="h-4 w-4" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <NewInvoiceDialog open={creating} onOpenChange={setCreating} clients={clients} onCreated={onChange} />
    </Panel>
  );
}
