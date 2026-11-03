import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, RotateCcw, Trash2, AlertTriangle, Cloud, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { deleteAsset, listPhotos, putAsset } from "@/lib/vehicle3dDrafts";
import { BUS_360_MAX_FRAMES, BUS_360_RECOMMENDED_FRAMES, sortedBus360Frames, validateBus360Photo, wrapBus360Frame, stepBus360FromSwipe } from "@/lib/vehicle360";

const CLOUD_ENABLED = import.meta.env.MODE === "supabase" && import.meta.env.VITE_VEHICLE_360_CLOUD_ENABLED === "true";
const Bus360CloudPanel = React.lazy(() => import("@/components/vehicle3d/Bus360CloudPanel"));

function usePhotoUrls(photos) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const next = {};
    photos.forEach((photo) => { next[photo.id] = URL.createObjectURL(photo.blob); });
    setUrls(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);
  return urls;
}

export default function Bus3DStudio({ vehicle }) {
  const { user } = useAuth();
  // Reuse the existing draft namespace so photos from the original Studio remain.
  const localKey = [user?.id, vehicle?.company_id, vehicle?.id].map((part) => String(part || "unknown")).join("/");
  const [photos, setPhotos] = useState([]);
  const [frame, setFrame] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cloudGallery, setCloudGallery] = useState(null);
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const dragX = useRef(null);
  const ordered = useMemo(() => sortedBus360Frames(photos), [photos]);
  const urls = usePhotoUrls(ordered);
  const current = ordered[wrapBus360Frame(frame, ordered.length)];
  const imageUrl = current ? urls[current.id] : "";
  const count = ordered.length;
  const angle = (cloudGallery?.frames?.length || count) ? Math.round(wrapBus360Frame(frame, cloudGallery?.frames?.length || count) * 360 / (cloudGallery?.frames?.length || count)) : 0;

  const reload = useCallback(async () => {
    setPhotos(await listPhotos(localKey));
  }, [localKey]);
  useEffect(() => {
    let active = true;
    setLoading(true); setPhotos([]); setFrame(0); setError(""); setCloudGallery(null);
    listPhotos(localKey)
      .then((saved) => { if (active) setPhotos(saved); })
      .catch((err) => { if (active) setError(err.message || "Cannot open locally saved photos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [localKey]);

  const addFiles = async (files) => {
    const items = Array.from(files || []);
    if (!items.length || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const existing = await listPhotos(localKey);
      let added = 0;
      for (const file of items) {
        const problem = validateBus360Photo(file, existing.length + added);
        if (problem) throw Error(problem);
        const id = crypto.randomUUID();
        await putAsset(localKey, "photo", id, {
          id, name: file.name || "bus-photo.jpg", blob: file, pass: "middle",
          createdAt: Date.now() + added,
        });
        added++;
      }
      await reload();
      setMessage(added + " view" + (added === 1 ? "" : "s") + " saved on this device.");
    } catch (err) {
      await reload().catch(() => {});
      setError(err.message || "Photos could not be saved. Check storage space.");
    } finally {
      setSaving(false);
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  };
  const removeFrame = async () => {
    if (!current || saving) return;
    setSaving(true); setError("");
    try {
      await deleteAsset(localKey, "photo", current.id);
      await reload();
      setFrame((old) => Math.max(0, old - 1));
      setMessage("Photo removed from this device. Previously uploaded cloud copies are not deleted.");
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const downloadPhoto = () => {
    if (!current || !imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl; a.download = current.name || "bus-view.jpg";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const step = (delta) => setFrame((old) => wrapBus360Frame(old + delta, cloudGallery?.frames?.length || ordered.length));
  const handlePointerDown = (event) => { dragX.current = event.clientX; };
  const handlePointerUp = (event) => {
    if (dragX.current === null) return;
    const delta = event.clientX - dragX.current;
    dragX.current = null;
    const steps = stepBus360FromSwipe(delta, displayedCount);
    if (steps) step(steps);
  };
  const cloudReady = cloudGallery?.frames?.length > 0;
  const cloudCurrent = cloudReady ? cloudGallery.frames[wrapBus360Frame(frame, cloudGallery.frames.length)] : null;
  const displayedUrl = cloudReady ? cloudCurrent?.url : imageUrl;
  const displayedCount = cloudReady ? cloudGallery.frames.length : count;

  return (
    <section className="space-y-4" aria-label="360 degree bus viewer">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">360° Bus Viewer</h2>
            <p className="text-sm text-muted-foreground">Exterior photos · {vehicle?.name || vehicle?.fleet_number || "Vehicle"}</p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">No GPU needed</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Take {BUS_360_RECOMMENDED_FRAMES} photos in order as you walk around the parked bus.
          The viewer switches between photos to simulate rotating the bus. It is not a true 3D scan.
        </p>
        {!CLOUD_ENABLED && <p className="mt-2 text-xs text-muted-foreground">
          Photos are saved locally on this device and linked to this bus. Clearing app data removes local copies.
          Sharing across devices requires cloud photo sync.
        </p>}
        {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
        {message && <p role="status" className="mt-2 text-sm text-primary">{message}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div
          tabIndex={0}
          role="group"
          aria-label="Bus rotation viewer. Use left and right arrow keys, or swipe to rotate."
          onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1); } }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragX.current = null; }}
          className="relative flex aspect-[16/10] max-h-[490px] items-center justify-center overflow-hidden bg-slate-950 touch-pan-y outline-offset-[-3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary select-none"
        >
          {displayedUrl ? (
            <img src={displayedUrl} draggable={false} alt={"Exterior bus view " + (wrapBus360Frame(frame, displayedCount) + 1) + " of " + displayedCount} className="max-h-full max-w-full object-contain pointer-events-none transition-transform duration-100" style={{ transform: `scale(${zoom})` }} />
          ) : (
            <div className="px-5 text-center text-slate-300">
              <RotateCcw className="mx-auto mb-3 h-11 w-11" />
              <p className="font-semibold">{loading ? "Loading saved views…" : "Start your bus photo tour"}</p>
              <p className="mt-1 text-sm text-slate-400">Park safely. Walk around the bus and photograph each angle.</p>
            </div>
          )}
          {displayedCount > 0 && <>
            <div className="absolute left-3 top-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white">{wrapBus360Frame(frame, displayedCount) + 1} / {displayedCount} views · {angle}°</div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">Swipe or use arrows to rotate</div>
          </>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-3 sm:px-5">
          <Button type="button" size="sm" variant="outline" disabled={displayedCount < 2} onClick={() => step(-1)} aria-label="Previous bus angle"><ChevronLeft className="h-4 w-4" /> Left</Button>
          <div className="text-center">
            <p className="text-sm font-semibold">{displayedCount} exterior views</p>
            <p className="text-xs text-muted-foreground">{displayedCount >= BUS_360_RECOMMENDED_FRAMES ? "Good rotation coverage" : BUS_360_RECOMMENDED_FRAMES - displayedCount + " more for recommended coverage"}</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={displayedCount < 2} onClick={() => step(1)}>Right <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {displayedCount > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>− Zoom out</Button>
          <span className="text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="outline" size="sm" disabled={zoom >= 2.5} onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}>+ Zoom in</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setZoom(1)}>Reset</Button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Add bus views</h3>
          <span className="text-sm text-muted-foreground">{count} / {BUS_360_MAX_FRAMES} local photos</span>
        </div>
        <p className="text-sm text-muted-foreground">Take photos in clockwise order at about the same height and distance. You can add up to 36 images. Existing photos are kept in their original capture order.</p>
        <input ref={cameraInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => addFiles(e.target.files)} />
        <input ref={fileInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => addFiles(e.target.files)} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={saving || count >= BUS_360_MAX_FRAMES} onClick={() => cameraInput.current?.click()}><Camera className="mr-2 h-4 w-4" />Take a photo</Button>
          <Button variant="outline" disabled={saving || count >= BUS_360_MAX_FRAMES} onClick={() => fileInput.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Add photos</Button>
          {count > 0 && <Button variant="outline" disabled={saving || cloudReady} onClick={removeFrame}><Trash2 className="mr-2 h-4 w-4" />Delete selected</Button>}
          {current && !cloudReady && <Button variant="ghost" onClick={downloadPhoto}><Download className="mr-2 h-4 w-4" />Save selected</Button>}
        </div>
        {count > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Bus photo thumbnails">
            {ordered.map((photo, index) => <button key={photo.id} type="button" onClick={() => { setCloudGallery(null); setFrame(index); }} aria-label={"View angle " + (index + 1)} aria-pressed={!cloudReady && index === wrapBus360Frame(frame, count)} className={"h-16 w-24 flex-none overflow-hidden rounded-lg border-2 " + (!cloudReady && index === wrapBus360Frame(frame, count) ? "border-primary" : "border-border")}>
              {urls[photo.id] && <img alt="" src={urls[photo.id]} className="h-full w-full object-cover" loading="lazy" />}
            </button>)}
          </div>
        )}
      </div>
      {CLOUD_ENABLED && (
        <React.Suspense fallback={<p className="text-sm text-muted-foreground">Loading photo sync…</p>}>
          <Bus360CloudPanel
            vehicle={vehicle}
            localKey={localKey}
            photos={ordered}
            onSelectGallery={(gallery) => { setCloudGallery(gallery); setFrame(0); }}
            onShowLocal={() => { setCloudGallery(null); setFrame(0); }}
          />
        </React.Suspense>
      )}
    </section>
  );
}
