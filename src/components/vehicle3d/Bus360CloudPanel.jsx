import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CloudUpload, RefreshCw, Images, AlertTriangle } from "lucide-react";
import { getAsset, putAsset } from "@/lib/vehicle3dDrafts";
import { confirmCloudPhoto, createCloudScan, listCloudScans, listCloudPhotos, uploadCloudPhoto } from "@/lib/vehicle3dCloud";

// Photo-only cloud sync: no GPU and no reconstruction jobs.
// The server validates company access before returning short-lived image links.
export default function Bus360CloudPanel({ vehicle, localKey, photos, onSelectGallery, onShowLocal }) {
  const [scans, setScans] = useState([]);
  const [scanId, setScanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [data, saved] = await Promise.all([
      listCloudScans(vehicle.id), getAsset(localKey, "cloud", "scan"),
    ]);
    setScans(data.scans || []);
    setScanId(data.scans?.some((s) => s.id === saved?.scanId) ? saved.scanId : "");
  }, [vehicle.id, localKey]);

  useEffect(() => {
    let active = true;
    refresh().catch((err) => { if (active) setError(err.message || "Cloud views unavailable."); });
    return () => { active = false; };
  }, [refresh]);

  const upload = async () => {
    if (busy || !photos.length) return;
    setBusy(true); setError(""); setProgress("");
    try {
      const previous = await getAsset(localKey, "cloud", "scan");
      let target = scanId || previous?.scanId;
      if (!target) {
        const created = await createCloudScan(vehicle.id);
        target = created.scan?.id;
        if (!target) throw Error("Could not create a new photo gallery.");
        await putAsset(localKey, "cloud", "scan", { scanId: target });
        setScanId(target);
      }
      let uploaded = 0;
      for (const photo of photos) {
        const prior = await getAsset(localKey, "cloud-photo", photo.id);
        if (prior?.scanId === target && prior.confirmed) {
          uploaded++; setProgress(uploaded + "/" + photos.length + " photos saved"); continue;
        }
        const fileId = prior?.scanId === target && prior.fileId ? prior.fileId : crypto.randomUUID();
        await putAsset(localKey, "cloud-photo", photo.id, { scanId: target, fileId, confirmed: false });
        if (prior?.scanId === target) {
          try {
            const confirmed = await confirmCloudPhoto({ scanId: target, fileId, photo: photo.blob, pass: photo.pass || "middle" });
            if (!confirmed?.confirmed) throw Error("Not yet uploaded");
          } catch {
            await uploadCloudPhoto({ scanId: target, fileId, photo: photo.blob, pass: photo.pass || "middle" });
          }
        } else {
          await uploadCloudPhoto({ scanId: target, fileId, photo: photo.blob, pass: photo.pass || "middle" });
        }
        await putAsset(localKey, "cloud-photo", photo.id, { scanId: target, fileId, confirmed: true });
        uploaded++;
        setProgress(uploaded + "/" + photos.length + " photos saved");
      }
      await refresh();
      setProgress("Photo gallery saved to this bus's cloud profile.");
    } catch (err) {
      setError((err.message || "Upload interrupted.") + " Your local views are safe; retry to resume.");
    } finally { setBusy(false); }
  };

  const view = async (scan) => {
    setBusy(true); setError("");
    try {
      const result = await listCloudPhotos(scan.id);
      const frames = result.frames || [];
      if (!frames.length) throw Error("This gallery has no uploaded photos yet.");
      onSelectGallery({ id: scan.id, frames });
    } catch (err) { setError(err.message || "Cannot open photo gallery."); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold"><CloudUpload className="mr-2 inline h-4 w-4" />Save to vehicle profile</h3>
        <span className="text-xs text-muted-foreground">Cloud photo storage · no GPU</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload your bus photos once to view the 360° photo gallery on other authorized devices.
        Nothing uploads automatically.
      </p>
      {error && <p className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
      {progress && <p role="status" className="text-sm">{progress}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !photos.length} onClick={upload}>
          <CloudUpload className="mr-2 h-4 w-4" />{scanId ? "Save / resume upload" : "Save photo tour"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => refresh().catch((err) => setError(err.message))}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        <Button variant="outline" disabled={busy} onClick={onShowLocal}>Local views</Button>
      </div>
      {scans.length > 0 && <div className="space-y-2">
        <h4 className="text-sm font-semibold">Saved tours</h4>
        {scans.map((scan) => <div key={scan.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-2">
          <span className="truncate text-sm">{new Date(scan.created_at).toLocaleDateString()} · {scan.photo_count || 0} views</span>
          <Button size="sm" variant="outline" disabled={busy || !scan.photo_count} onClick={() => view(scan)}><Images className="mr-1.5 h-4 w-4" />Open tour</Button>
        </div>)}
      </div>}
    </div>
  );
}
