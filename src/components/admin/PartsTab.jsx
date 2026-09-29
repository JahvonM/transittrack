import React, { useState } from "react";
import { confirmAction } from "@/components/ConfirmHost";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, ImagePlus, Loader2, Package, Plus, Trash2, Search, Minus, X } from "lucide-react";

const empty = {
  part_name: "", oem_number: "", aftermarket_number: "",
  vehicle_compatibility: "", category: "", quantity_in_stock: 0, unit_price: 0, supplier: "", photo_url: "",
};

async function uploadPhoto(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}

// Square part photo; tap to add or replace it.
function PartPhoto({ part, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadPhoto(file);
      await base44.entities.Part.update(part.id, { photo_url: url });
      onChanged();
    } catch (err) {
      toast({ title: "Couldn't upload photo", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="relative w-14 h-14 rounded-xl overflow-hidden border bg-muted/50 grid place-items-center shrink-0 cursor-pointer hover:border-primary transition-colors" title={part.photo_url ? "Change photo" : "Add photo"}>
      {part.photo_url ? <img src={part.photo_url} alt={part.part_name} className="w-full h-full object-cover" /> : <Camera className="w-5 h-5 text-muted-foreground" />}
      {busy && <span className="absolute inset-0 bg-background/70 grid place-items-center"><Loader2 className="w-4 h-4 animate-spin" /></span>}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} aria-label={`Photo of ${part.part_name}`} />
    </label>
  );
}

export default function PartsTab({ parts = [], onChange }) {
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickNewPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      set("photo_url", await uploadPhoto(file));
    } catch (err) {
      toast({ title: "Couldn't upload photo", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (!form.part_name.trim()) return;
    setSaving(true);
    try {
      await base44.entities.Part.create({ ...form, part_name: form.part_name.trim() });
      setForm(empty);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't add part", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!(await confirmAction({ title: "Delete this part?", description: "It will be removed from your parts inventory." }))) return;
    try {
      await base44.entities.Part.delete(id);
      onChange();
    } catch (e) {
      // Delete is admin/company-only — a mechanic clicking this needs to see
      // why nothing happened, not a silent no-op.
      toast({ title: "Couldn't delete part", description: e.message, variant: "destructive" });
    }
  };

  const adjustStock = async (part, delta) => {
    const next = Math.max(0, (part.quantity_in_stock || 0) + delta);
    try {
      await base44.entities.Part.update(part.id, { quantity_in_stock: next });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't update stock", description: e.message, variant: "destructive" });
    }
  };

  const filtered = parts.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return p.part_name?.toLowerCase().includes(q) || p.oem_number?.toLowerCase().includes(q) || p.vehicle_compatibility?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Parts inventory</h2>
      </div>
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search parts…" className="pl-9" />
          </div>
          {filtered.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No parts yet.</CardContent></Card>
          )}
          {filtered.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-3 flex items-center gap-3">
                <PartPhoto part={p} onChanged={onChange} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.part_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[p.oem_number, p.vehicle_compatibility, p.supplier].filter(Boolean).join(" · ") || p.category || "—"}
                  </div>
                </div>
                <Badge variant={p.quantity_in_stock > 0 ? "secondary" : "destructive"} className="shrink-0">{p.quantity_in_stock} in stock</Badge>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustStock(p, -1)}><Minus className="w-3 h-3" /></Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustStock(p, 1)}><Plus className="w-3 h-3" /></Button>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => remove(p.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Add a part</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Photo</Label>
              {form.photo_url ? (
                <div className="relative w-full h-36 rounded-xl overflow-hidden border">
                  <img src={form.photo_url} alt="Part" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => set("photo_url", "")} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/90 grid place-items-center" aria-label="Remove photo">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-24 rounded-xl border border-dashed cursor-pointer text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {uploading ? "Uploading…" : "Take or choose a photo"}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickNewPhoto} />
                </label>
              )}
            </div>
            <div className="space-y-1.5"><Label>Part name</Label><Input value={form.part_name} onChange={(e) => set("part_name", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>OEM #</Label><Input value={form.oem_number} onChange={(e) => set("oem_number", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Aftermarket #</Label><Input value={form.aftermarket_number} onChange={(e) => set("aftermarket_number", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Compatible vehicle</Label><Input value={form.vehicle_compatibility} onChange={(e) => set("vehicle_compatibility", e.target.value)} placeholder="e.g. Toyota Hiace" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Supplier</Label><Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Qty in stock</Label><Input type="number" value={form.quantity_in_stock} onChange={(e) => set("quantity_in_stock", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Unit price</Label><Input type="number" value={form.unit_price} onChange={(e) => set("unit_price", Number(e.target.value))} /></div>
            </div>
            <Button className="w-full" onClick={create} disabled={saving || uploading || !form.part_name.trim()}>
              {saving ? "Adding…" : "Add part"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
