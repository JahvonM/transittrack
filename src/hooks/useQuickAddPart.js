import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { optimizeBus360Photo } from "@/lib/vehicle360Optimize";
import {
  blankQuickPart, parsePartText, partKey, partsByNumber, quickCount, quickExtrasFilled, quickPartRecord,
  quickPrimary, restockPatch, withSavedParts,
} from "@/lib/partsCatalogue";

// Adding a part from a phone, shared by the Add a part sheet on Parts and the
// parts kiosk (/parts). Made to stay quick on a phone:
// - a photo is shrunk on the phone, shown from the phone straight away, and
//   uploaded in the background while the rest is filled in;
// - a save shows "Added" as soon as the server has it; the screen's list is
//   refreshed afterwards (onSaved), not waited for;
// - the fields are locked while saving, so nothing typed is lost;
// - a restock reads that one part's count fresh, as the list on a kiosk
//   tablet may be hours old.
// onAdded hears of each part added or restocked: { name, quantity, total, restocked, part }.
export default function useQuickAddPart({ parts = [], guides = [], onSaved, onAdded } = {}) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => blankQuickPart());
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState("");
  const [saved, setSaved] = useState([]);
  const [photo, setPhoto] = useState({ state: "idle", preview: "" }); // idle | working | ready | failed
  const savingRef = useRef(false);
  const upload = useRef(null); // { token, promise, file }
  const previewRef = useRef("");

  const set = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);
  const fail = useCallback((title) => (err) => toast({ title, description: err?.message, variant: "destructive" }), [toast]);

  const known = useMemo(() => withSavedParts(parts, saved), [parts, saved]);
  const index = useMemo(() => partsByNumber(known), [known]);
  const key = partKey(form.number);
  const matches = useMemo(() => (key ? index.get(key) || [] : []), [index, key]);
  const qty = quickCount(form.quantity);
  const primary = quickPrimary({ matches, qty, name: form.name });
  const extras = quickExtrasFilled(form);

  // ----- copied text -----
  const fill = useCallback((text) => {
    const { number, name } = parsePartText(text);
    if (!number && !name) return false;
    setForm((f) => ({ ...f, number: number || f.number, name: name || f.name }));
    return true;
  }, []);
  const pasteCopied = useCallback(async () => {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast({ title: "Couldn't read what you copied", description: "Press and hold the part number box, then choose Paste." });
      return;
    }
    if (!fill(text)) toast({ title: "Nothing to paste", description: "Copy a part number, or a number and its name, first." });
  }, [fill, toast]);
  // Pasting a whole copied line into the number box splits it into number and name.
  const onNumberPaste = useCallback((e) => {
    const text = e.clipboardData?.getData("text") || "";
    if (!/\s/.test(text.trim())) return;
    e.preventDefault();
    fill(text);
  }, [fill]);

  // ----- photo -----
  const showPreview = (url) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
  };
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const pickPhoto = useCallback((e) => {
    const file = e?.target ? e.target.files?.[0] : e;
    if (e?.target) e.target.value = "";
    if (!(file instanceof Blob)) return;
    const token = {};
    const current = () => upload.current?.token === token;
    setPhoto({ state: "working", preview: previewRef.current });
    const promise = (async () => {
      const small = await optimizeBus360Photo(file);
      if (!current()) return null;
      const url = URL.createObjectURL(small);
      showPreview(url);
      setPhoto({ state: "working", preview: url });
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file: small });
      if (!current()) return null;
      setPhoto({ state: "ready", preview: url });
      return file_url;
    })();
    upload.current = { token, promise, file };
    promise.catch((err) => {
      if (!current()) return;
      setPhoto((p) => ({ ...p, state: "failed" }));
      fail("Couldn't upload photo")(err);
    });
  }, [fail]);
  const retryPhoto = useCallback(() => { if (upload.current?.file) pickPhoto(upload.current.file); }, [pickPhoto]);
  const removePhoto = useCallback(() => {
    upload.current = null;
    showPreview("");
    setPhoto({ state: "idle", preview: "" });
  }, []);
  // The photo's web address for a save, once its upload has finished.
  const photoUrlForSave = async () => {
    const job = upload.current;
    if (!job) return "";
    try {
      return (await job.promise) || "";
    } catch {
      throw new Error("The photo didn't upload. Try it again, or remove it.");
    }
  };

  // ----- saving -----
  const keep = (record) => {
    if (record?.id) setSaved((s) => [record, ...s.filter((x) => x.id !== record.id)].slice(0, 200));
  };
  // Ready for the next part, keeping the kind of number and the models.
  const done = (message, entry) => {
    onAdded?.(entry);
    setAdded(message);
    upload.current = null;
    showPreview("");
    setPhoto({ state: "idle", preview: "" });
    setForm((f) => blankQuickPart(f));
    setMore(false);
  };
  const refresh = (record) => { Promise.resolve().then(() => onSaved?.(record)).catch(() => {}); };
  const lock = () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };
  const unlock = () => { savingRef.current = false; setSaving(false); };

  const addNew = async (e) => {
    e?.preventDefault?.();
    const snapshot = form;
    const name = snapshot.name.trim();
    if (!name || !lock()) return null;
    try {
      const photo_url = await photoUrlForSave();
      const record = await base44.entities.Part.create(quickPartRecord({ ...snapshot, photo_url }, guides));
      keep(record);
      refresh(record);
      const n = quickCount(snapshot.quantity);
      done(`Added ${name} (${n})`, { name, quantity: n, total: n, restocked: false, part: record });
      return record;
    } catch (err) {
      fail("Couldn't add part")(err);
      return null;
    } finally {
      unlock();
    }
  };

  const restock = async (part) => {
    const n = quickCount(form.quantity);
    if (!part || n < 1 || !lock()) return null;
    try {
      const photo_url = await photoUrlForSave();
      const fresh = (await base44.entities.Part.get(part.id)) || part;
      const patch = restockPatch(fresh, n, photo_url);
      const result = await base44.entities.Part.update(part.id, patch);
      const record = result?.id ? result : { ...fresh, ...patch };
      keep(record);
      refresh(record);
      done(`Added ${n} to ${part.part_name}: ${patch.quantity_in_stock} in stock`, {
        name: part.part_name, quantity: n, total: patch.quantity_in_stock, restocked: true, part: record,
      });
      return record;
    } catch (err) {
      fail("Couldn't update stock")(err);
      return null;
    } finally {
      unlock();
    }
  };

  // The main button: restock the one part with this number, or add a new part.
  const submit = (e) => {
    e?.preventDefault?.();
    if (!primary.enabled) return Promise.resolve(null);
    return primary.kind === "restock" ? restock(primary.part) : addNew();
  };

  return {
    form, set, qty, matches, primary, more, setMore, extras,
    fill, pasteCopied, onNumberPaste,
    photo, pickPhoto, retryPhoto, removePhoto,
    saving, added, addNew, restock, submit,
  };
}
