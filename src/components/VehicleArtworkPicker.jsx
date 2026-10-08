import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import BusArtwork from "@/components/BusArtwork";
import { Button } from "@/components/ui/button";
export default function VehicleArtworkPicker({ value, onChange, onBusyChange, disabled, name }) {
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const upload = async event => {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file) return;
  if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 5*1024*1024) {
   setError("Choose a PNG, JPG or WebP under 5 MB."); return;
  }
  setError(""); setBusy(true); onBusyChange(true);
  try {
   const { file_url } = await base44.integrations.Core.UploadFile({ file });
   if (!file_url) throw new Error("Missing image");
   onChange(file_url);
  } catch { setError("Couldn't upload the bus image. Try again."); }
  finally { setBusy(false); onBusyChange(false); }
 };
 return <div className="space-y-3 rounded-xl border p-3">
  <label className="block text-sm font-semibold">Bus photo or 3D render
   <input aria-label="Bus photo or 3D render" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy} onChange={upload} className="block mt-2 w-full text-sm" />
  </label>
  <div className="rounded-xl bg-secondary p-3 flex justify-center"><BusArtwork imageUrl={value} width={200} className="h-32" alt={`${name || "Bus"} artwork preview`} /></div>
  <p className="text-xs text-muted-foreground">Used on passenger cards, driver screens and boarding kiosks. Upload your actual bus photo or a prepared 3D render. Transparent PNG/WebP works best. Photos do not become rotatable 3D models; choose the map model below.</p>
  {busy && <p role="status" className="text-sm">Uploading bus image…</p>}
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  {value && <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={()=>onChange("")}>Use default bus artwork</Button>}
 </div>;
}
