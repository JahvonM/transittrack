import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CloudUpload, RefreshCw, Box, AlertTriangle } from "lucide-react";
import { getAsset, putAsset } from "@/lib/vehicle3dDrafts";
import {
  confirmCloudPhoto, createCloudScan, getCloudModelLink,
  getReconstructionStatus, listCloudScans, requestReconstruction, uploadCloudPhoto,
} from "@/lib/vehicle3dCloud";

// This component is compiled only in staging builds where
// VITE_VEHICLE_3D_CLOUD_ENABLED=true is explicitly set.
// No automatic network writes or reconstruction requests.
export default function Bus3DCloudPanel({ vehicle, localKey, photos, onModelReady }) {
  const [scanId, setScanId] = useState("");
  const [scans, setScans] = useState([]);
  const [job, setJob] = useState(null);
  const [progress, setProgress] = useState({ uploaded: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!vehicle?.id) return;
    const [list, saved] = await Promise.all([
      listCloudScans(vehicle.id),
      getAsset(localKey, "cloud", "scan"),
    ]);
    setScans(list.scans || []);
    if (saved?.scanId && list.scans?.some((s) => s.id === saved.scanId)) {
      setScanId(saved.scanId);
    } else {
      setScanId("");
    }
  }, [vehicle?.id, localKey]);

  useEffect(() => {
    let valid = true;
    refresh().catch((err) => { if (valid) setError(err.message || "Cloud scans unavailable."); });
    return () => { valid = false; };
  }, [refresh]);

  const startUpload = async () => {
    if (busy || !photos.length) return;
    setError(""); setBusy(true); setNotice("");
    try {
      const saved = await getAsset(localKey, "cloud", "scan");
      let current = scanId || saved?.scanId;
      if (!current) {
        const created = await createCloudScan(vehicle.id);
        current = created.scan?.id;
        if (!current) throw new Error("Unable to create cloud scan.");
        await putAsset(localKey, "cloud", "scan", { scanId: current });
        setScanId(current);
      }
      let uploaded = 0;
      setProgress({ uploaded: 0, total: photos.length });
      for (const photo of photos) {
        const record = await getAsset(localKey, "cloud-photo", photo.id);
        if (record?.scanId === current && record.confirmed) {
          uploaded++;
          setProgress({ uploaded, total: photos.length });
          continue;
        }
        const fileId = record?.scanId === current ? record.fileId : crypto.randomUUID();
        // Save the generated id BEFORE uploading to make a failed confirmation
        // recoverable and prevent creating duplicate photo objects on retry.
        await putAsset(localKey, "cloud-photo", photo.id, {
          scanId: current, fileId, confirmed: false,
        });
        let result = null;
        if (record?.scanId === current) {
          try {
            result = await confirmCloudPhoto({ scanId: current, fileId, photo: photo.blob, pass: photo.pass });
          } catch {
            // May not have uploaded successfully. Try signed upload next.
          }
        }
        if (!result) {
          result = await uploadCloudPhoto({
            scanId: current, fileId, photo: photo.blob, pass: photo.pass,
          });
        }
        if (!result.confirmed) throw new Error("Cloud did not confirm the uploaded photograph.");
        await putAsset(localKey, "cloud-photo", photo.id, {
          scanId: current, fileId, confirmed: true,
        });
        uploaded++;
        setProgress({ uploaded, total: photos.length });
      }
      setNotice("All selected photographs uploaded and confirmed.");
      await refresh();
    } catch (err) {
      setError((err?.message || "Upload interrupted.") + " Local photos are still on this device. Select Resume upload to retry.");
    } finally {
      setBusy(false);
    }
  };

  const checkStatus = async (id = scanId) => {
    if (!id || busy) return;
    setBusy(true); setError("");
    try {
      const result = await getReconstructionStatus(id);
      setJob(result.job || { status: result.scanStatus || "draft" });
      if (result.scanStatus === "ready") setNotice("Model is ready. Select View cloud model.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const startJob = async () => {
    if (!scanId || busy) return;
    setBusy(true); setError("");
    try {
      const current = await getAsset(localKey, "cloud", "job-key");
      const key = current?.scanId === scanId ? current.key : crypto.randomUUID();
      await putAsset(localKey, "cloud", "job-key", { scanId, key });
      const result = await requestReconstruction(scanId, key);
      setJob(result.job);
      setNotice("Reconstruction queued for processing.");
    } catch (err) { setError(err.message || "Could not queue reconstruction."); }
    finally { setBusy(false); }
  };

  const openModel = async (selectedId) => {
    if (!selectedId || busy) return;
    setBusy(true); setError("");
    try {
      const link = await getCloudModelLink(selectedId);
      const response = await fetch(link.url, { credentials: "omit" });
      if (!response.ok) throw new Error("Could not download the finished model.");
      const blob = await response.blob();
      const model = new File([blob], "vehicle-" + selectedId + ".glb", { type: "model/gltf-binary" });
      onModelReady(model);
      setNotice("3D model loaded in the viewer below.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3" aria-label="Cloud 3D scans">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold"><CloudUpload className="mr-2 inline h-4 w-4" />Cloud scanning</h3>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs">Staging configuration</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload a local photo draft to this vehicle. Nothing is uploaded automatically.
        Models are generated only after you explicitly request reconstruction.
      </p>
      {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">{notice}</p>}
      {progress.total > 0 && <p role="status" className="text-sm">Uploaded {progress.uploaded} of {progress.total} photos</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || photos.length === 0} onClick={startUpload}>
          <CloudUpload className="mr-2 h-4 w-4" />{scanId ? "Resume upload" : "Create scan & upload"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => refresh().catch((err) => setError(err.message))}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh scans
        </Button>
        {scanId && <>
          <Button variant="outline" disabled={busy} onClick={() => checkStatus()} >Check status</Button>
          <Button variant="outline" disabled={busy || progress.total === 0 || progress.uploaded !== progress.total}
            onClick={startJob}>Request 3D reconstruction</Button>
        </>}
      </div>
      {job && <p className="text-sm">Current job: <strong>{job.status}</strong>{job.error_message ? " · " + job.error_message : ""}</p>}
      {scans.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Previous cloud scans</h4>
          {scans.map((scan) => (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-2 text-sm" key={scan.id}>
              <span className="min-w-0 truncate">{new Date(scan.created_at).toLocaleDateString()} · {scan.photo_count || 0} photos · {scan.status}</span>
              <Button size="sm" variant="outline" disabled={busy || scan.status !== "ready"} onClick={() => openModel(scan.id)}>
                <Box className="mr-1 h-3.5 w-3.5" />View 3D
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
