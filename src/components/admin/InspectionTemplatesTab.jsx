import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Plus, Trash2, Save } from "lucide-react";

const CRITICALITY = ["Low", "Medium", "High", "Critical"];

function emptyTemplate() {
  return { name: "", company_id: "" };
}

// Admin-configurable inspection builder — unlike FleetPilot's original
// InspectionForm (which read from a hardcoded catalog file and never
// actually used its own InspectionTemplate entity), templates here are
// real, editable records: add/rename/delete sections and items, per-item
// criticality and photo requirement. Seeded once with 4 defaults
// (Daily/Weekly/Monthly/Service) built from that same catalog data so
// admins start with real content instead of a blank builder.
export default function InspectionTemplatesTab({ templates = [], companies = [], onChange }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState(emptyTemplate());

  const selected = templates.find((t) => t.id === selectedId) || null;

  useEffect(() => {
    if (selected) {
      setDraft(JSON.parse(JSON.stringify(selected.sections || [])));
      setDirty(false);
    } else {
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const select = (id) => setSelectedId(id === selectedId ? null : id);

  const updateSections = (fn) => {
    setDraft((prev) => fn(JSON.parse(JSON.stringify(prev || []))));
    setDirty(true);
  };

  const addSection = () => {
    if (!newSectionName.trim()) return;
    updateSections((s) => [...s, { section_name: newSectionName.trim(), items: [] }]);
    setNewSectionName("");
  };

  const removeSection = (idx) => {
    if (!window.confirm("Delete this whole section and its items?")) return;
    updateSections((s) => s.filter((_, i) => i !== idx));
  };

  const renameSection = (idx, name) => {
    updateSections((s) => s.map((sec, i) => (i === idx ? { ...sec, section_name: name } : sec)));
  };

  const addItem = (sectionIdx) => {
    updateSections((s) =>
      s.map((sec, i) =>
        i === sectionIdx
          ? { ...sec, items: [...sec.items, { item_name: "New item", critical: "Medium", requires_photo: false }] }
          : sec
      )
    );
  };

  const updateItem = (sectionIdx, itemIdx, patch) => {
    updateSections((s) =>
      s.map((sec, i) =>
        i !== sectionIdx ? sec : { ...sec, items: sec.items.map((it, j) => (j === itemIdx ? { ...it, ...patch } : it)) }
      )
    );
  };

  const removeItem = (sectionIdx, itemIdx) => {
    updateSections((s) =>
      s.map((sec, i) => (i !== sectionIdx ? sec : { ...sec, items: sec.items.filter((_, j) => j !== itemIdx) }))
    );
  };

  const saveDraft = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await base44.entities.InspectionTemplate.update(selected.id, { sections: draft });
      setDirty(false);
      onChange();
      toast({ title: "Template saved" });
    } catch (e) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createTemplate = async () => {
    if (!newTemplate.name.trim()) return;
    setCreating(true);
    try {
      const company = companies.find((c) => c.id === newTemplate.company_id);
      const record = await base44.entities.InspectionTemplate.create({
        name: newTemplate.name.trim(),
        category: "Vehicle Inspection",
        company_id: newTemplate.company_id || undefined,
        company_name: company?.name || undefined,
        sections: [],
      });
      setNewTemplate(emptyTemplate());
      // Await the reload before selecting the new template — otherwise the
      // parent's `templates` prop is still the pre-create array when
      // selectedId changes, the sync effect below finds no matching record,
      // sets draft to null, and never gets a second chance to re-sync
      // (its dependency, selectedId, doesn't change again) — leaving the
      // editor panel blank instead of showing the new template.
      await onChange();
      setSelectedId(record.id);
    } catch (e) {
      toast({ title: "Couldn't create template", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const removeTemplate = async (id) => {
    if (!window.confirm("Delete this template? This can't be undone.")) return;
    await base44.entities.InspectionTemplate.delete(id);
    if (selectedId === id) setSelectedId(null);
    onChange();
  };

  const itemCount = (t) => (t.sections || []).reduce((n, s) => n + (s.items?.length || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Inspection templates</h2>
      </div>
      <div className="grid lg:grid-cols-[300px_1fr] gap-4">
        <div className="space-y-2">
          {templates.map((t) => (
            <Card
              key={t.id}
              className={`cursor-pointer transition-colors ${selectedId === t.id ? "border-primary" : ""}`}
              onClick={() => select(t.id)}
            >
              <CardContent className="py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.company_name || "All companies"} · {itemCount(t)} items
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); removeTemplate(t.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> New template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={newTemplate.name}
                onChange={(e) => setNewTemplate((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Pre-trip"
              />
              <Select
                value={newTemplate.company_id || "__all__"}
                onValueChange={(v) => setNewTemplate((f) => ({ ...f, company_id: v === "__all__" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="All companies" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All companies</SelectItem>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="w-full" size="sm" onClick={createTemplate} disabled={creating || !newTemplate.name.trim()}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div>
          {!selected && (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Select a template to edit its sections and items.</CardContent></Card>
          )}
          {selected && draft && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>{selected.name}</CardTitle>
                <Button size="sm" onClick={saveDraft} disabled={!dirty || saving}>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Saving…" : "Save changes"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {draft.map((section, sIdx) => (
                  <div key={sIdx} className="border rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={section.section_name}
                        onChange={(e) => renameSection(sIdx, e.target.value)}
                        className="h-8 font-medium"
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeSection(sIdx)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {section.items.map((item, iIdx) => (
                        <div key={iIdx} className="flex items-center gap-2 text-sm">
                          <Input
                            value={item.item_name}
                            onChange={(e) => updateItem(sIdx, iIdx, { item_name: e.target.value })}
                            className="h-8 flex-1"
                          />
                          <Select value={item.critical} onValueChange={(v) => updateItem(sIdx, iIdx, { critical: v })}>
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CRITICALITY.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Switch checked={!!item.requires_photo} onCheckedChange={(v) => updateItem(sIdx, iIdx, { requires_photo: v })} />
                            <span className="text-xs text-muted-foreground hidden sm:inline">Photo</span>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(sIdx, iIdx)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => addItem(sIdx)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Add item
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="New section name"
                    className="h-9"
                  />
                  <Button variant="outline" onClick={addSection} disabled={!newSectionName.trim()}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add section
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
