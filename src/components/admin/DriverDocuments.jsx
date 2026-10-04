import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, IdCard, Loader2, ShieldCheck, Upload } from "lucide-react";

export const DOC_KINDS = [
  { id: "license", label: "Driver's licence", short: "Licence", icon: IdCard, numberLabel: "Licence number" },
  { id: "insurance", label: "Insurance", short: "Insurance", icon: ShieldCheck, numberLabel: "Policy number" },
];

const DAY = 24 * 60 * 60 * 1000;

// missing | expired | expiring (within 30 days) | valid | no_expiry
export function docStatus(doc) {
  if (!doc?.file_uri) return "missing";
  if (!doc.expiry_date) return "no_expiry";
  const t = new Date(doc.expiry_date + "T23:59:59").getTime();
  if (t < Date.now()) return "expired";
  if (t - Date.now() < 30 * DAY) return "expiring";
  return "valid";
}

const fmtDate = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "");

const TONE = {
  missing: "bg-muted text-muted-foreground",
  expired: "bg-danger/15 text-danger",
  expiring: "bg-warning/15 text-warning",
  valid: "bg-success/15 text-success",
  no_expiry: "bg-success/15 text-success",
};

function statusText(doc) {
  const s = docStatus(doc);
  if (s === "missing") return "Missing";
  if (s === "expired") return `Expired ${fmtDate(doc.expiry_date)}`;
  if (s === "expiring") return `Expires ${fmtDate(doc.expiry_date)}`;
  if (s === "valid") return `Valid to ${fmtDate(doc.expiry_date)}`;
  return "On file";
}

// Compact status chips for a driver card; click to manage.
export function DocChips({ docs, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="w-full flex flex-wrap items-center gap-1.5 text-left rounded-xl border px-2.5 py-2 hover:bg-accent transition-colors">
      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-xs font-medium mr-1">Documents</span>
      {DOC_KINDS.map((k) => {
        const doc = docs.find((d) => d.kind === k.id);
        const s = docStatus(doc);
        const Icon = s === "valid" || s === "no_expiry" ? CheckCircle2 : s === "missing" ? k.icon : AlertTriangle;
        return (
          <span key={k.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium ${TONE[s]}`}>
            <Icon className="w-3 h-3" /> {k.short}: {statusText(doc)}
          </span>
        );
      })}
    </button>
  );
}

function DocSection({ kind, driver, doc, onSaved }) {
  const { toast } = useToast();
  const [number, setNumber] = useState(doc?.document_number || "");
  const [expiry, setExpiry] = useState(doc?.expiry_date || "");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);

  useEffect(() => { setNumber(doc?.document_number || ""); setExpiry(doc?.expiry_date || ""); }, [doc?.id, doc?.document_number, doc?.expiry_date]);

  const upsert = async (patch) => {
    const data = { driver_id: driver.id, driver_name: driver.full_name || driver.email || "", company_id: driver.company_id || "", kind: kind.id, ...patch };
    if (doc?.id) await base44.entities.DriverDocument.update(doc.id, data);
    else await base44.entities.DriverDocument.create(data);
    onSaved();
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      // Private upload: the file is only reachable through a short-lived signed link.
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      await upsert({ file_uri, file_name: file.name, document_number: number.trim(), expiry_date: expiry || null });
      toast({ title: `${kind.label} saved` });
    } catch (err) {
      toast({ title: "Couldn't upload", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async () => {
    setBusy(true);
    try {
      await upsert({ document_number: number.trim(), expiry_date: expiry || null });
      toast({ title: "Details saved" });
    } catch (err) {
      toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const view = async () => {
    setViewing(true);
    // Open the tab first (in the click) so pop-up blockers allow it.
    const win = window.open("", "_blank");
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri, expires_in: 300 });
      if (win) win.location.href = signed_url;
      else window.location.href = signed_url;
    } catch (err) {
      win?.close();
      toast({ title: "Couldn't open the document", description: err.message, variant: "destructive" });
    } finally {
      setViewing(false);
    }
  };

  const Icon = kind.icon;
  const s = docStatus(doc);
  const dirty = (number || "") !== (doc?.document_number || "") || (expiry || "") !== (doc?.expiry_date || "");

  return (
    <section className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold flex-1">{kind.label}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[s]}`}>{statusText(doc)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{kind.numberLabel}</Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expiry date</Label>
          <Input type="date" value={expiry || ""} onChange={(e) => setExpiry(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant={doc?.file_uri ? "outline" : "default"} size="sm" disabled={busy}>
          <label className="cursor-pointer">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {doc?.file_uri ? "Replace photo" : "Add photo"}
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={upload} disabled={busy} />
          </label>
        </Button>
        {doc?.file_uri && (
          <Button variant="outline" size="sm" onClick={view} disabled={viewing}>
            <ExternalLink className="w-4 h-4" /> View{doc.file_name ? "" : ""}
          </Button>
        )}
        {doc && dirty && (
          <Button size="sm" variant="secondary" onClick={saveDetails} disabled={busy}>Save details</Button>
        )}
      </div>
      {!doc?.file_uri && <p className="text-xs text-muted-foreground">Photograph the front of the {kind.short.toLowerCase()}, or upload a PDF. Add the number and expiry first so they're saved with it.</p>}
    </section>
  );
}

// Licence + insurance for one driver. Stored in DriverDocument (admins and
// the driver's own company only) with the files uploaded privately.
export default function DriverDocumentsDialog({ driver, docs, open, onOpenChange, onChanged }) {
  if (!driver) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{driver.full_name || driver.email} · documents</DialogTitle>
          <DialogDescription>Only admins and this driver's company can see these. Files open through a link that expires after 5 minutes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          {DOC_KINDS.map((k) => (
            <DocSection key={k.id} kind={k} driver={driver} doc={docs.find((d) => d.kind === k.id)} onSaved={onChanged} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
