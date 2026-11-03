import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload, Rotate3D, Trash2, Download, AlertTriangle, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteAsset, getAsset, listPhotos, putAsset } from "@/lib/vehicle3dDrafts";

const PASSES = [
  { id: "lower", label: "Lower body", hint: "Walk around the bus with the wheels and lower panels visible." },
  { id: "middle", label: "Mid body", hint: "Capture the doors, windows, front, rear and sides." },
  { id: "upper", label: "Upper body", hint: "Raise the camera to capture the roof edges and upper panels safely." },
];
const MAX_PHOTOS = 200;
const MAX_FILE = 20 * 1024 * 1024;
const MAX_MODEL = 150 * 1024 * 1024;

function ModelViewer({ file, onError }) {
  const host = useRef(null);
  useEffect(() => {
    if (!file || !host.current) return undefined;
    let disposed = false;
    let renderer;
    let controls;
    let model;
    let frame;
    let resize;
    const url = URL.createObjectURL(file);
    const parent = host.current;
    (async () => {
      try {
        const [THREE, { OrbitControls }, { GLTFLoader }] = await Promise.all([
          import("three"), import("three/addons/controls/OrbitControls.js"), import("three/addons/loaders/GLTFLoader.js"),
        ]);
        if (disposed) return;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x101d2e);
        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        parent.appendChild(renderer.domElement);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x50617b, 2.8));
        const sunlight = new THREE.DirectionalLight(0xffffff, 2.3);
        sunlight.position.set(5, 10, 8);
        scene.add(sunlight);
        const gltf = await new GLTFLoader().loadAsync(url);
        if (disposed) return;
        model = gltf.scene;
        scene.add(model);
        const bounds = new THREE.Box3().setFromObject(model);
        if (bounds.isEmpty()) throw new Error("The GLB has no visible geometry.");
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        model.position.sub(center);
        const span = Math.max(size.x, size.y, size.z, 0.1);
        camera.position.set(span * 1.5, span * 0.85, span * 1.6);
        camera.near = Math.max(span / 1000, 0.001);
        camera.far = Math.max(span * 100, 100);
        camera.updateProjectionMatrix();
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = span * 0.15;
        controls.maxDistance = span * 12;
        const redraw = () => {
          if (disposed) return;
          const width = Math.max(parent.clientWidth, 1), height = Math.max(parent.clientHeight, 1);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        resize = new ResizeObserver(redraw);
        resize.observe(parent);
        redraw();
        const animate = () => {
          if (disposed) return;
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(animate);
        };
        animate();
      } catch (error) {
        if (!disposed) onError(error?.message || "Could not load this 3D model.");
      }
    })();
    return () => {
      disposed = true;
      URL.revokeObjectURL(url);
      if (frame) cancelAnimationFrame(frame);
      resize?.disconnect();
      controls?.dispose();
      model?.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => {
          Object.values(material).forEach((value) => { if (value?.isTexture) value.dispose(); });
          material.dispose();
        });
      });
      renderer?.dispose();
      if (renderer?.domElement?.parentNode === parent) parent.removeChild(renderer.domElement);
    };
  }, [file, onError]);
  return <div ref={host} className="h-72 sm:h-[420px] w-full overflow-hidden rounded-xl" aria-label="Interactive 3D bus model; drag to rotate and scroll to zoom" />;
}

function PhotoThumb({ photo, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-muted">
      {url && <img alt={photo.name || "Bus scan photograph"} src={url} loading="lazy" className="aspect-square w-full object-cover" />}
      <div className="flex items-center justify-between gap-1 p-1.5 text-[11px]">
        <span className="truncate">{photo.pass}</span>
        <button type="button" onClick={() => onRemove(photo.id)} aria-label={"Remove " + photo.name} className="rounded p-1 hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export default function Bus3DStudio({ vehicle }) {
  const id = String(vehicle?.id || "");
  const [pass, setPass] = useState("middle");
  const [photos, setPhotos] = useState([]);
  const [model, setModel] = useState(null);
  const [status, setStatus] = useState("Loading saved local draft…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cameraInput = useRef(null);
  const uploadInput = useRef(null);
  const modelInput = useRef(null);
  const onViewerError = useCallback((message) => setError(message), []);

  useEffect(() => {
    let cancelled = false;
    setPhotos([]); setModel(null); setError("");
    Promise.all([listPhotos(id), getAsset(id, "model", "current")])
      .then(([saved, savedModel]) => {
        if (!cancelled) {
          setPhotos(saved);
          setModel(savedModel || null);
          setStatus("Saved on this device only · Not uploaded to TransitTrack");
        }
      })
      .catch((err) => { if (!cancelled) { setStatus("Local draft unavailable"); setError(err.message); } });
    return () => { cancelled = true; };
  }, [id]);

  const addFiles = async (files) => {
    const items = Array.from(files || []);
    if (!items.length) return;
    setBusy(true); setError("");
    try {
      let added = 0;
      const existing = await listPhotos(id);
      for (const file of items) {
        if (existing.length + added >= MAX_PHOTOS) throw new Error("Photo limit reached (200 per scan draft).");
        if (!file.type.startsWith("image/")) throw new Error("Only image files can be added.");
        if (file.size > MAX_FILE) throw new Error("Each photo must be 20 MB or smaller.");
        const photo = { id: crypto.randomUUID(), pass, blob: file, name: file.name, createdAt: Date.now() + added };
        await putAsset(id, "photo", photo.id, photo);
        added++;
      }
      setPhotos(await listPhotos(id));
      setStatus(added + " photo(s) stored locally on this device");
    } catch (err) {
      setPhotos(await listPhotos(id).catch(() => []));
      setError(err.message || "Unable to save photos; check available storage.");
    } finally {
      setBusy(false);
      if (cameraInput.current) cameraInput.current.value = "";
      if (uploadInput.current) uploadInput.current.value = "";
    }
  };

  const removePhoto = async (photoId) => {
    try { await deleteAsset(id, "photo", photoId); setPhotos(await listPhotos(id)); }
    catch (err) { setError(err.message); }
  };
  const openModel = async (file) => {
    if (!file) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".glb") || file.size > MAX_MODEL) {
      setError("Choose a GLB model no larger than 150 MB."); return;
    }
    try {
      await putAsset(id, "model", "current", file);
      setModel(file);
      setStatus("GLB saved on this device only");
    } catch (err) { setError(err.message || "Unable to save model."); }
  };
  const exportPhotos = () => {
    // A single-photo download avoids requiring an unreviewed ZIP library.
    photos.forEach((photo, i) => {
      const url = URL.createObjectURL(photo.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = String(i + 1).padStart(3, "0") + "-" + photo.pass + "-" + (photo.name || "bus.jpg");
      document.body.appendChild(anchor);
      anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
  };
  const counts = Object.fromEntries(PASSES.map((p) => [p.id, photos.filter((photo) => photo.pass === p.id).length]));

  return (
    <section className="space-y-4" aria-label="3D Bus Studio">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">3D Bus Studio</h2><p className="text-sm text-muted-foreground">Exterior scan · {vehicle?.name || vehicle?.fleet_number || "Vehicle"}</p></div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">Local preview · Phase 1</span>
        </div>
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Photos and GLB models stay in this browser on this device. Clearing app data may delete them.
          Automatic 3D reconstruction and cloud syncing are not enabled yet.
        </div>
        <p className="mt-2 text-xs text-muted-foreground" role="status">{status}</p>
        {error && <p className="mt-2 flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold"><Camera className="mr-2 inline h-4 w-4" />Guided photo capture</h3><span className="text-sm text-muted-foreground">{photos.length} / {MAX_PHOTOS}</span></div>
        <div className="grid grid-cols-3 gap-2">
          {PASSES.map((p) => <button type="button" key={p.id} onClick={() => setPass(p.id)} aria-pressed={pass === p.id} className={"rounded-lg border px-2 py-3 text-sm font-medium transition-colors " + (pass === p.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>{p.label}<span className="block text-xs opacity-70">{counts[p.id]} photos</span></button>)}
        </div>
        <p className="text-sm text-muted-foreground">{PASSES.find((p) => p.id === pass)?.hint} Take overlapping views from every side. Avoid traffic and do not climb on the vehicle.</p>
        <input ref={cameraInput} className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => addFiles(event.target.files)} />
        <input ref={uploadInput} className="hidden" type="file" accept="image/*" multiple onChange={(event) => addFiles(event.target.files)} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => cameraInput.current?.click()}><Camera className="mr-2 h-4 w-4" />Take photo</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => uploadInput.current?.click()}><Upload className="mr-2 h-4 w-4" />Add existing photos</Button>
          {photos.length > 0 && <Button type="button" variant="outline" disabled={busy} onClick={exportPhotos}><Download className="mr-2 h-4 w-4" />Export photos</Button>}
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
        {photos.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">{photos.map((photo) => <PhotoThumb key={photo.id} photo={photo} onRemove={removePhoto} />)}</div> : <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto mb-2 h-6 w-6" />No photos yet. Start with one side of the bus and move around it.</div>}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <h3 className="font-semibold"><Rotate3D className="mr-2 inline h-4 w-4" />3D model viewer</h3>
        <p className="text-sm text-muted-foreground">Open an existing textured GLB model to rotate and inspect it. A collection of photographs alone cannot create a model in this preview.</p>
        <input ref={modelInput} className="hidden" type="file" accept=".glb,model/gltf-binary" onChange={(event) => { openModel(event.target.files?.[0]); event.target.value = ""; }} />
        <Button type="button" variant="outline" onClick={() => modelInput.current?.click()}><Upload className="mr-2 h-4 w-4" />Import GLB model</Button>
        {model ? <>
          <ModelViewer key={id + ":" + model.name + ":" + model.size} file={model} onError={onViewerError} />
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="truncate">{model.name} · Drag to rotate, scroll or pinch to zoom</span>
            <Button size="sm" variant="ghost" onClick={async () => { try { await deleteAsset(id, "model", "current"); setModel(null); } catch (err) { setError(err.message); } }}>Remove model</Button>
          </div>
        </> : <div className="grid h-56 place-items-center rounded-xl bg-slate-900 text-center text-sm text-slate-300"><div><Rotate3D className="mx-auto mb-2 h-10 w-10" />No 3D model imported yet</div></div>}
      </div>
    </section>
  );
}
