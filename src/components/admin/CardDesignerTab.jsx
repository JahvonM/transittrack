import AvatarPicker from "@/components/AvatarPicker";
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { cardArtwork, artworkPng, localCardImage, DEFAULT_CARD_DESIGN } from "@/lib/cardArtwork";

export default function CardDesignerTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [people, setPeople] = useState([]);
  const [personKey, setPersonKey] = useState("");
  const [design, setDesign] = useState(DEFAULT_CARD_DESIGN);
  const [side, setSide] = useState("front");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const person = people.find(p => p.key === personKey);
  const templateKey = "tt-card-artwork:" + (user?.id || "anonymous");
  useEffect(() => {
    base44.functions.invoke("nfcCards", { action: "people" }).then(r => setPeople(r.data?.people || [])).catch(() => toast({ title: "Couldn't load card holders", variant: "destructive" }));
    try { const saved = JSON.parse(localStorage.getItem(templateKey) || "null"); if (saved) setDesign({ ...DEFAULT_CARD_DESIGN, ...saved }); } catch { /* default */ }
  }, [templateKey, toast]);
  const change = patch => setDesign(d => ({ ...d, ...patch }));
  const upload = async (file, target) => {
    try { const data = await localCardImage(file); if (target === "photo") setPhoto(data); else change({ [target]: data }); }
    catch (e) { toast({ title: e.message, variant: "destructive" }); }
  };
  const svg = cardArtwork(design, person, side, photo);
  const exportPng = async () => {
    setBusy(true);
    try {
      const png = await artworkPng(svg);
      const a = document.createElement("a"); a.href = png;
      a.download = (person?.name || "passenger").replace(/[^a-z0-9_-]/gi,"-") + "-" + side + "-card.png"; a.click();
    } catch { toast({ title: "Couldn't export card image", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const printCard = async () => {
    const popup = window.open("", "_blank");
    if (!popup) { toast({ title: "Allow popups to print your card" }); return; }
    setBusy(true);
    try {
      const png = await artworkPng(svg);
      popup.document.write('<!doctype html><html><head><title>TransitTrack card print</title><style>@page{size:A4;margin:10mm}body{margin:0}img{width:85.6mm;height:53.98mm;display:block;print-color-adjust:exact;-webkit-print-color-adjust:exact}p{font-family:sans-serif}@media print{p{display:none}}</style></head><body><p>Print at 100% / actual size. Card: 85.6 × 53.98 mm. Check a sample before cutting.</p><img src="' + png + '" alt="Card artwork"></body></html>');
      popup.document.close();
      const image = popup.document.querySelector("img");
      await image.decode();
      popup.focus(); popup.print();
    } catch { popup.close(); toast({ title: "Couldn't print card", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      <div><h2 className="text-xl font-semibold">NFC card designer</h2><p className="text-sm text-muted-foreground">Design the label you print and place on a card. Card issuing registers its NFC chip separately.</p></div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="space-y-3 rounded-2xl border p-4">
          <Label htmlFor="card-person">Card holder</Label>
          <select id="card-person" className="w-full rounded-md border bg-background p-2" value={personKey} onChange={e => { setPersonKey(e.target.value); setPhoto(""); }}>
            <option value="">Sample passenger</option>{people.map(p => <option key={p.key} value={p.key}>{p.name} · {p.company_name || "No company"}</option>)}
          </select>
          {["title","subtitle","footer"].map(k => <div key={k}><Label htmlFor={"card-"+k}>{k === "title" ? "Heading" : k === "subtitle" ? "Card type" : "Footer"}</Label><Input id={"card-"+k} maxLength={70} value={design[k]} onChange={e => change({[k]:e.target.value})} /></div>)}
          <Label htmlFor="card-back">Back text</Label><textarea id="card-back" maxLength={400} className="w-full rounded-md border bg-background p-2" value={design.backText} onChange={e => change({backText:e.target.value})} />
          <div className="flex gap-4">{[["color","Accent"],["background","Background"],["text","Text"]].map(([k,label]) => <label key={k} className="text-sm">{label}<input type="color" className="block mt-1" value={design[k]} onChange={e => change({[k]:e.target.value})}/></label>)}</div>
          {[["logo","Logo"],["backgroundImage","Background image"],["photo","Passenger photo"]].map(([k,label]) => <div key={k}><Label htmlFor={"card-image-"+k}>{label}</Label><Input id={"card-image-"+k} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e.target.files?.[0],k)} /></div>)}
          <AvatarPicker onChange={setPhoto} disabled={busy} />
          <Button variant="outline" onClick={() => { try { localStorage.setItem(templateKey,JSON.stringify(design)); toast({title:"Template saved on this computer"}); } catch { toast({title:"Template storage is full",variant:"destructive"}); } }}>Save template on this computer</Button>
          <Button variant="ghost" onClick={() => { setDesign(DEFAULT_CARD_DESIGN); setPhoto(""); }}>Reset design</Button>
        </div>
        <div className="space-y-4">
          <div className="flex gap-2"><Button variant={side === "front" ? "default" : "outline"} onClick={() => setSide("front")}>Front</Button><Button variant={side === "back" ? "default" : "outline"} onClick={() => setSide("back")}>Back</Button></div>
          <div className="rounded-xl overflow-hidden shadow-lg [&_svg]:w-full [&_svg]:h-auto" data-testid="card-artwork-preview" dangerouslySetInnerHTML={{__html:svg}} />
          <p className="text-sm text-muted-foreground">85.6 × 53.98 mm · 1011 × 638 pixels. No card UIDs, PINs or access codes are printed.</p>
          <div className="flex gap-2"><Button onClick={exportPng} disabled={busy}>Download PNG</Button><Button variant="outline" onClick={printCard} disabled={busy}>Print actual size</Button></div>
        </div>
      </div>
    </div>
  );
}
