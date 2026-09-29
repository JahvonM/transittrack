f = "src/components/admin/PartsTab.jsx"
s = open(f).read()

def sub(old, new):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new, 1)

sub('''import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Plus, Trash2, Search, Minus } from "lucide-react";

const empty = {
  company_id: "", part_name: "", oem_number: "", aftermarket_number: "",
  vehicle_compatibility: "", category: "", quantity_in_stock: 0, unit_price: 0, supplier: "",
};''', '''import { Camera, ImagePlus, Loader2, Package, Plus, Trash2, Search, Minus, X } from "lucide-react";

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
}''')

sub('''  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.part_name.trim() || !form.company_id) return;
    setSaving(true);
    try {
      const company = companies.find((c) => c.id === form.company_id);
      await base44.entities.Part.create({ ...form, company_name: company?.name || "" });''', '''  const [uploading, setUploading] = useState(false);
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
      await base44.entities.Part.create({ ...form, part_name: form.part_name.trim() });''')

sub('''              <CardContent className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">''', '''              <CardContent className="py-3 flex items-center gap-3">
                <PartPhoto part={p} onChanged={onChange} />
                <div className="flex-1 min-w-0">''')
sub('''{[p.oem_number, p.vehicle_compatibility, p.supplier].filter(Boolean).join(" · ") || p.company_name}''',
    '''{[p.oem_number, p.vehicle_compatibility, p.supplier].filter(Boolean).join(" · ") || p.category || "—"}''')

sub('''            <div className="space-y-1.5">
              <Label>Company</Label>
              <Select value={form.company_id} onValueChange={(v) => set("company_id", v)}>
                <SelectTrigger><SelectValue placeholder="Choose company" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
''', '''            <div className="space-y-1.5">
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
''')
sub('''disabled={saving || !form.part_name.trim() || !form.company_id}''', '''disabled={saving || uploading || !form.part_name.trim()}''')
s = s.replace("export default function PartsTab({ parts = [], companies = [], onChange }) {", "export default function PartsTab({ parts = [], onChange }) {")
open(f, "w").write(s)
print("parts ok")
