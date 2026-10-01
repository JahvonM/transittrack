import React, { useState, useEffect } from "react";
import { confirmAction } from "@/components/ConfirmHost";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Plus, Trash2, Save } from "lucide-react";
import InspectionTemplateSettings, { AUDIENCES, audienceSummary, metaFrom } from "@/components/admin/InspectionTemplateSettings";
import XrayBus from "@/components/inspection/XrayBus";
import { BUS_LAYOUTS, layoutZones, zoneById, flattenTemplate, zoneFor, zoneStatus } from "@/lib/busZones";

const CRITICALITY = ["Low", "Medium", "High", "Critical"];

function emptyTemplate() {
  return { name: "", company_id: "", frequency_days: "", audience: "mechanic" };
}

// Admin-configurable inspection builder — unlike FleetPilot's original
// InspectionForm (which read from a hardcoded catalog file and never
// actually used its own InspectionTemplate entity), templates here are
// real, editable records: add/rename/delete sections and items, per-item
// criticality and photo requirement. Seeded once with 4 defaults
// (Daily/Weekly/Monthly/Service) built from that same catalog data so
// admins start with real content instead of a blank builder.
export default function InspectionTemplatesTab({ templates = [], companies = [], vehicles = [], onChange }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState(emptyTemplate());
  const [frequencyDays, setFrequencyDays] = useState("");
  const [savingFrequency, setSavingFrequency] = useState(false);
  const [meta, setMeta] = useState(metaFrom(null));
  const [sending, setSending] = useState(false);
  const [focusZone, setFocusZone] = useState(null);

  const selected = templates.find((t) => t.id === selectedId) || null;

  useEffect(() => {
    if (selected) {
      setDraft(JSON.parse(JSON.stringify(selected.sections || [])));
      setDirty(false);
      setFrequencyDays(selected.frequency_days ? String(selected.frequency_days) : "");
      setMeta(metaFrom(selected));
      setFocusZone(null);
    } else {
      setDraft(null);
      setFrequencyDays("");
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

  const removeSection = async (idx) => {
    if (!(await confirmAction({ title: "Delete this section?", description: "The section and all of its items will be removed from this template." }))) return;
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
      await base44.entities.InspectionTemplate.update(selected.id, { sections: draft, ...meta });
      setDirty(false);
      await onChange();
      toast({ title: "Template saved" });
      return true;
    } catch (e) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const changeMeta = (m) => { setMeta(m); setDirty(true); };

  const sendNow = async () => {
    if (!selected) return;
    const picked = (meta.driver_vehicle_ids || []).length;
    const where = picked ? `the ${picked} chosen bus${picked === 1 ? "'s" : "es'"}` : selected.company_name ? `${selected.company_name}'s` : "every";
    if (!(await confirmAction({
      title: "Send to drivers now?",
      description: `“${selected.name}” will pop up on ${where} driver tablet straight away, until each driver has done it.`,
      confirmLabel: "Send",
    }))) return;
    if (dirty && !(await saveDraft())) return;
    setSending(true);
    try {
      await base44.entities.InspectionTemplate.update(selected.id, { driver_sent_at: new Date().toISOString() });
      await onChange();
      toast({ title: "Sent to drivers", description: "It will appear on the tablets within a minute." });
    } catch (e) {
      toast({ title: "Couldn't send", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const layout = meta.xray_layout;
  const layoutZoneList = layoutZones(layout);
  const ZONE_BY_ID = zoneById(layout);
  const draftItems = draft ? flattenTemplate({ sections: draft, xray_layout: layout }) : [];
  const previewStatus = zoneStatus(draftItems, {});

  const saveFrequency = async () => {
    if (!selected) return;
    setSavingFrequency(true);
    try {
      await base44.entities.InspectionTemplate.update(selected.id, { frequency_days: Number(frequencyDays) || 0 });
      onChange();
      toast({ title: "Reminder schedule saved" });
    } catch (e) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSavingFrequency(false);
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
        frequency_days: Number(newTemplate.frequency_days) || 0,
        audience: newTemplate.audience || "mechanic",
        ...(newTemplate.audience !== "mechanic" ? { driver_trigger: "start_of_day", driver_required: true } : {}),
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
    if (!(await confirmAction({ title: "Delete this template?", description: "This can't be undone." }))) return;
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
                  <div className="text-xs text-primary truncate">
                    {audienceSummary(t)}
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
              <Select value={newTemplate.audience} onValueChange={(v) => setNewTemplate((f) => ({ ...f, audience: v }))}>
                <SelectTrigger aria-label="Who does this inspection"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => <SelectItem key={a.id} value={a.id}>For {a.label.toLowerCase()}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                value={newTemplate.frequency_days}
                onChange={(e) => setNewTemplate((f) => ({ ...f, frequency_days: e.target.value }))}
                placeholder="Remind every N days (optional)"
              />
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
                <div className="flex items-end gap-2 border rounded-xl p-3">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Remind every N days (blank = no reminders)</label>
                    <Input
                      type="number"
                      min={0}
                      value={frequencyDays}
                      onChange={(e) => setFrequencyDays(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={saveFrequency} disabled={savingFrequency}>
                    {savingFrequency ? "Saving…" : "Save"}
                  </Button>
                </div>
                <InspectionTemplateSettings meta={meta} onChange={changeMeta} sentAt={selected.driver_sent_at} onSendNow={sendNow} sending={sending} vehicles={vehicles.filter((v) => !selected.company_id || v.company_id === selected.company_id)} />
                <div className="border rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold">Bus type for the X-ray</p>
                  <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Bus type for the X-ray">
                    {BUS_LAYOUTS.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={layout === l.id}
                        onClick={() => changeMeta({ ...meta, xray_layout: l.id })}
                        className={`text-left rounded-lg border p-2 transition-colors ${layout === l.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
                      >
                        <XrayBus view="outside" layout={l.id} scanning={false} className="pointer-events-none" label={l.label} />
                        <span className="block text-sm font-medium mt-1.5">{l.short}</span>
                        <span className="block text-xs text-muted-foreground">{l.label.split(" · ")[1]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {draftItems.length > 0 && (
                  <div className="border rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">X-ray preview</p>
                      <p className="text-xs text-muted-foreground">{focusZone ? `Showing ${ZONE_BY_ID[focusZone]?.label}. Tap it again to show all.` : "Tap a part to find its items."}</p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <XrayBus view="outside" layout={layout} statuses={previewStatus} activeZone={focusZone} scanning={false} onZoneClick={(z) => setFocusZone((f) => (f === z ? null : z))} />
                      <XrayBus view="inside" layout={layout} statuses={previewStatus} activeZone={focusZone} scanning={false} onZoneClick={(z) => setFocusZone((f) => (f === z ? null : z))} />
                    </div>
                  </div>
                )}
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
                      {section.items.map((item, iIdx) => {
                        const autoZone = zoneFor({ item_name: item.item_name }, section.section_name, layout);
                        const zone = (item.zone && ZONE_BY_ID[item.zone]) ? item.zone : autoZone;
                        if (focusZone && zone !== focusZone) return null;
                        return (
                        <div key={iIdx} className="flex flex-wrap sm:flex-nowrap items-center gap-2 text-sm">
                          <Input
                            value={item.item_name}
                            onChange={(e) => updateItem(sIdx, iIdx, { item_name: e.target.value })}
                            className="h-8 flex-1 min-w-[160px]"
                          />
                          <Select value={(item.zone && ZONE_BY_ID[item.zone]) ? item.zone : "__auto__"} onValueChange={(v) => updateItem(sIdx, iIdx, { zone: v === "__auto__" ? "" : v })}>
                            <SelectTrigger className="h-8 w-44" aria-label="Bus part"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__auto__">Auto: {ZONE_BY_ID[autoZone]?.label}</SelectItem>
                              {layoutZoneList.map((z) => <SelectItem key={z.id} value={z.id}>{z.label}{z.view === "inside" ? " (inside)" : ""}</SelectItem>)}
                            </SelectContent>
                          </Select>
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
                        );
                      })}
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
