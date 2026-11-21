import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_KINDS, documentKindLabel, guideTitle } from "@/lib/busLibrary";
import { openGuideDocument, uploadGuideDocument } from "@/lib/guideDocuments";
import { documentProblem } from "@/lib/workshop";
import { EditSheet, FIELD, Field, Notice, pluralize, useWorkshop } from "@/components/workshop/kit";
import { FileText, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

// Manuals: the model page's owner's and workshop manuals, parts lists and
// bulletins, moved here from the Bus library. They are private files: only
// administrators and mechanics can open them, through a link that lasts five
// minutes.

function ManualSheet({ guide, onClose }) {
  const { toast } = useToast();
  const { put } = useWorkshop();
  const [form, setForm] = useState({ title: "", kind: "owners_manual", notes: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const problem = documentProblem({ ...form, file });

  const save = async () => {
    setSaving(true);
    try {
      put("documents", await uploadGuideDocument({ guideId: guide.id, ...form, file }));
      onClose();
    } catch (e) {
      toast({ title: "Couldn't add the manual", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheet open onClose={onClose} saving={saving} problem={problem} onSave={save} saveLabel="Add" title="Add a manual" description={guideTitle(guide)}>
      <p className="text-body-sm text-muted-foreground">A PDF or photos you own, up to 25 MB. Kept private: only administrators and mechanics can open it.</p>
      <Field id="doc-file" label="File">
        <Input id="doc-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" className="h-12 text-body md:text-body" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      <Field id="doc-title" label="Title">
        <Input id="doc-title" className="h-12 text-body md:text-body" value={form.title} onChange={set("title")} maxLength={200} placeholder="Owner's manual 2017" />
      </Field>
      <Field id="doc-kind" label="Kind">
        <select id="doc-kind" className={FIELD} value={form.kind} onChange={set("kind")}>
          {DOCUMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </Field>
      <Field id="doc-notes" label="What's in it (optional)" hint="Helps the next person find the right one.">
        <Textarea id="doc-notes" rows={3} className="text-body md:text-body" value={form.notes} onChange={set("notes")} maxLength={4000} placeholder="Maintenance schedule, fuses, tyre pressures" />
      </Field>
    </EditSheet>
  );
}

export default function ManualsSection({ guide }) {
  const { toast } = useToast();
  const { documents, drop, missing, reload, isAdmin } = useWorkshop();
  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState("");
  const [deleting, setDeleting] = useState("");
  const [confirming, setConfirming] = useState("");
  const mine = useMemo(() => documents.filter((d) => d.guide_id === guide.id), [documents, guide]);

  const open = async (doc) => {
    setOpening(doc.id);
    try {
      await openGuideDocument(doc);
    } catch (e) {
      toast({ title: "Couldn't open the manual", description: e?.message, variant: "destructive" });
    } finally {
      setOpening("");
    }
  };
  // Delete asks once more on the button itself, like the edit sheets.
  const remove = async (doc) => {
    if (confirming !== doc.id) { setConfirming(doc.id); return; }
    setConfirming("");
    setDeleting(doc.id);
    try {
      await base44.entities.GuideDocument.delete(doc.id);
      drop("documents", doc.id);
    } catch (e) {
      toast({ title: "Couldn't delete the manual", description: e?.message, variant: "destructive" });
    } finally {
      setDeleting("");
    }
  };

  return (
    <section aria-labelledby="manuals-title">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="manuals-title" className="text-title-sm font-semibold">Manuals</h3>
          <p className="text-body-sm text-muted-foreground">{pluralize(mine.length, "manual")} for the {guideTitle(guide)}</p>
        </div>
        <Button className="h-12 rounded-lg text-body" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add a manual</Button>
      </div>

      {missing.documents && (
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the manuals. Check the connection.
        </Notice>
      )}

      {mine.length === 0 && !missing.documents ? (
        <Notice>
          <p className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" aria-hidden="true" />No manuals for the {guideTitle(guide)} yet.</p>
          <p className="text-muted-foreground">Add the owner's manual or a workshop manual you have as a PDF, or photos of its pages.</p>
        </Notice>
      ) : mine.length > 0 && (
        <ul aria-label="Manuals" className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {mine.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-[12rem] flex-1">
                <p className="text-body font-semibold">{doc.title}</p>
                <p className="text-body-sm text-muted-foreground">{documentKindLabel(doc.kind)}{doc.file_name ? ` · ${doc.file_name}` : ""}</p>
                {doc.notes && <p className="text-body-sm text-muted-foreground">{doc.notes}</p>}
              </div>
              <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => open(doc)} disabled={opening === doc.id} aria-label={`Open ${doc.title}`}>
                {opening === doc.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Open
              </Button>
              {isAdmin && (
                <Button
                  variant={confirming === doc.id ? "destructive" : "ghost"} className="h-12 rounded-lg text-body"
                  onClick={() => remove(doc)} disabled={deleting === doc.id}
                  aria-label={confirming === doc.id ? `Tap again to delete ${doc.title}` : `Delete ${doc.title}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />{confirming === doc.id && <span className="ml-1.5">Tap again to delete</span>}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && <ManualSheet guide={guide} onClose={() => setAdding(false)} />}
    </section>
  );
}
