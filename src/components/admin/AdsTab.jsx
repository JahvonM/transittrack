import React, { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image } from "@/components/ui/image";
import { Image as ImageIcon, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { loadFailed } from "@/lib/loadFailed";

export default function AdsTab() {
  const [ads, setAds] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", message: "", link: "", image_url: "", company_id: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const [list, companyList] = await Promise.all([base44.entities.Advertisement.list(), base44.entities.Company.list()]);
      setAds(list);setCompanies(companyList);
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const uploadImage = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((f) => ({ ...f, image_url: file_url }));
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      await base44.entities.Advertisement.create({ ...form, active: true, order: 0 });
      setForm({ title: "", message: "", link: "", image_url: "", company_id: "" });
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (ad) => {
    await base44.entities.Advertisement.update(ad.id, { active: !ad.active });
    load();
  };
  const remove = async (id) => {
    await base44.entities.Advertisement.delete(id);
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-semibold">Advertisements</h1>
        <p className="text-sm text-muted-foreground">Manage public promos for all companies.</p>
        <Label>Owner of new advertisement</Label>
        <select aria-label="Advertisement owner" value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} className="w-full h-9 border rounded-md px-3">
          <option value="">Global — admin managed</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-2">
          {ads.length === 0 && !loading && (
            <div className="border rounded-2xl"><EmptyState text="No ads yet." /></div>
          )}
          {ads.map((ad) => (
            <div key={ad.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <select aria-label={`Owner of ${ad.title}`} value={ad.company_id || ""} onChange={async e => { await base44.entities.Advertisement.update(ad.id, { company_id: e.target.value }); load(); }} className="max-w-40 border rounded-md text-xs">
                <option value="">Global</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {ad.image_url ? (
                <Image src={ad.image_url} className="w-12 h-12 rounded-lg shrink-0" fittingType="fill" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-muted grid place-items-center">
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{ad.title}</div>
                {ad.message && <div className="text-xs text-muted-foreground truncate">{ad.message}</div>}
              </div>
              <Badge variant={ad.active ? "default" : "secondary"}>{ad.active ? "Live" : "Hidden"}</Badge>
              <Button variant="outline" size="sm" onClick={() => toggle(ad)}>
                {ad.active ? "Hide" : "Show"}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(ad.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> New advertisement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Summer routes sale" />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="20% off airport pickups" />
            </div>
            <div className="space-y-1.5">
              <Label>Link (optional)</Label>
              <Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Image (optional)</Label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 h-9 rounded-lg border cursor-pointer text-sm hover:bg-accent">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
                  />
                </label>
                {form.image_url && <Image src={form.image_url} className="w-10 h-10 rounded-lg" fittingType="fill" />}
              </div>
            </div>
            <Button className="w-full" onClick={create} disabled={saving || !form.title}>
              {saving ? "Saving…" : "Create ad"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}