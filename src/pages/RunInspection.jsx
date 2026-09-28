import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { ClipboardCheck, CheckCircle2, AlertTriangle, XCircle, Camera, Loader2, PartyPopper } from "lucide-react";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";
import { enqueueJob, isOfflineError } from "@/lib/offlineJobs";
import { runMechanicInspection } from "@/lib/offlineRunners";

const CONDITIONS = [
  { key: "GOOD", label: "Good", icon: CheckCircle2, activeClass: "bg-emerald-500 text-white border-emerald-500" },
  { key: "WARNING", label: "Warning", icon: AlertTriangle, activeClass: "bg-amber-500 text-white border-amber-500" },
  { key: "FAILED", label: "Failed", icon: XCircle, activeClass: "bg-destructive text-destructive-foreground border-destructive" },
];

const SEVERITY_BY_CRITICAL = { Critical: "critical", High: "high", Medium: "medium", Low: "low" };

// Mechanic-facing counterpart to admin's InspectionTemplatesTab builder:
// pick a vehicle + one of its available templates, walk every item, submit
// -> bulk InspectionResult records, auto-open a Fault for each FAILED item
// (same auto_create_faults bridge the driver's simple checklist already
// uses), and stamp the vehicle's last_inspection_date.
export default function RunInspection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vehicleId, setVehicleId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [started, setStarted] = useState(false);
  const [results, setResults] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [uploadingKey, setUploadingKey] = useState(null);
  const [photosEnabled, setPhotosEnabled] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Vehicle.list(),
      base44.entities.InspectionTemplate.list(),
      base44.entities.MaintenanceSettings.list(),
    ]).then(([v, t, settingsList]) => {
      setVehicles(v);
      setTemplates(t);
      setPhotosEnabled(settingsList[0]?.enable_photo_attachments !== false);
      setLoading(false);
    }).catch(() => { setLoading(false); loadFailed(); });
  }, []);

  const vehicle = vehicles.find((v) => v.id === vehicleId) || null;
  const availableTemplates = useMemo(
    () => templates.filter((t) => !t.company_id || t.company_id === vehicle?.company_id),
    [templates, vehicle]
  );
  const template = templates.find((t) => t.id === templateId) || null;

  const allItems = useMemo(() => {
    if (!template) return [];
    const flat = [];
    (template.sections || []).forEach((sec, sIdx) => {
      (sec.items || []).forEach((it, iIdx) => {
        flat.push({ key: `${sIdx}-${iIdx}`, section_name: sec.section_name, ...it });
      });
    });
    return flat;
  }, [template]);

  const markedCount = allItems.filter((it) => results[it.key]?.condition).length;
  const allMarked = allItems.length > 0 && markedCount === allItems.length;

  const setResult = (key, patch) => setResults((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const uploadPhoto = async (key, file) => {
    setUploadingKey(key);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setResult(key, { photo_url: file_url });
    } finally {
      setUploadingKey(null);
    }
  };

  const startInspection = () => {
    setResults({});
    setSummary(null);
    setStarted(true);
  };

  const backToPicker = () => {
    setStarted(false);
    setVehicleId("");
    setTemplateId("");
    setResults({});
    setSummary(null);
  };

  const submit = async () => {
    if (!vehicle || !template || !allMarked || submitting) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const inspectorName = user?.full_name || user?.email || "Mechanic";

      const resultRecords = allItems.map((it) => {
        const r = results[it.key];
        return {
          vehicle_id: vehicle.id,
          vehicle_name: vehicle.name,
          company_id: vehicle.company_id,
          company_name: vehicle.company_name,
          inspection_name: template.name,
          section_name: it.section_name,
          inspection_item: it.item_name,
          condition: r.condition,
          fault_found: r.condition !== "GOOD",
          fault_description: r.condition !== "GOOD" ? r.notes || "" : "",
          photo_url: r.photo_url || "",
          repair_required: r.condition === "FAILED",
          notes: r.notes || "",
          inspector_id: user?.id || "",
          inspector_name: inspectorName,
          inspection_date: now,
        };
      });
      const failedItems = allItems.filter((it) => results[it.key]?.condition === "FAILED");
      let autoCreate = true;
      if (failedItems.length > 0) {
        try {
          const settingsList = await base44.entities.MaintenanceSettings.list();
          autoCreate = settingsList[0]?.auto_create_faults !== false;
        } catch { /* offline or lookup failed: default to creating faults */ }
      }
      const faultRecords = autoCreate
        ? failedItems.map((it) => {
            const r = results[it.key];
            return {
              vehicle_id: vehicle.id,
              vehicle_name: vehicle.name,
              company_id: vehicle.company_id,
              company_name: vehicle.company_name,
              title: it.item_name,
              description: r.notes || `Failed during ${template.name} inspection (${it.section_name}).`,
              source: "inspection",
              severity: SEVERITY_BY_CRITICAL[it.critical] || "medium",
              status: "open",
              photo_url: r.photo_url || "",
              repair_required: true,
              reported_by: inspectorName,
            };
          })
        : [];
      const faultsCreated = faultRecords.length;

      // Upload row by row; if the connection drops, whatever is left is kept
      // on this device and uploads automatically once back online.
      let progress = { results: resultRecords, faults: faultRecords, vehicle_id: vehicle.id, date: now };
      let queued = false;
      try {
        await runMechanicInspection(progress, (p) => { progress = p; });
      } catch (err) {
        if (!isOfflineError(err)) throw err;
        enqueueJob("mechanic_inspection", progress, `${template.name} · ${vehicle.name}`);
        queued = true;
      }

      setSummary({
        good: allItems.filter((it) => results[it.key]?.condition === "GOOD").length,
        warning: allItems.filter((it) => results[it.key]?.condition === "WARNING").length,
        failed: failedItems.length,
        faultsCreated,
        queued,
      });
      setStarted(false);
    } catch (e) {
      // Some InspectionResult rows or the Fault/Vehicle updates may have
      // already gone through before this failed — surface the error rather
      // than silently leaving the mechanic on the form with no explanation.
      // Re-submitting after this is safe for InspectionResult (new rows, no
      // uniqueness constraint) but could double-create Faults for items that
      // already succeeded; that's an acceptable tradeoff for a best-effort
      // retry versus losing the inspection entirely.
      toast({ title: "Couldn't submit inspection", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (user && user.role !== "mechanic" && user.role !== "admin") return <Navigate to="/" replace />;

  if (loading) {
    return (
      <AppLayout title="Run inspection">
        <BusLoader className="py-8" />
      </AppLayout>
    );
  }

  if (summary) {
    return (
      <AppLayout title="Run inspection">
        <div className="max-w-lg space-y-4">
          <Card className="bg-gradient-to-b from-emerald-500/10 to-transparent">
            <CardContent className="p-8 text-center space-y-3">
              <PartyPopper className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-xl font-bold">Inspection submitted</p>
              <div className="flex justify-center gap-2 flex-wrap">
                <Badge variant="secondary">{summary.good} good</Badge>
                {summary.warning > 0 && <Badge className="bg-amber-500 text-white hover:bg-amber-500">{summary.warning} warning</Badge>}
                {summary.failed > 0 && <Badge variant="destructive">{summary.failed} failed</Badge>}
              </div>
              {summary.faultsCreated > 0 && (
                <p className="text-sm text-muted-foreground">{summary.faultsCreated} fault{summary.faultsCreated === 1 ? "" : "s"} opened for the mechanic queue.</p>
              )}
              <Button onClick={backToPicker}>Run another inspection</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!started) {
    return (
      <AppLayout title="Run inspection">
        <div className="max-w-lg space-y-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-heading font-semibold">Run inspection</h1>
          </div>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Vehicle</label>
                <Select value={vehicleId} onValueChange={(v) => { setVehicleId(v); setTemplateId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Choose a vehicle" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Inspection template</label>
                <Select value={templateId} onValueChange={setTemplateId} disabled={!vehicleId}>
                  <SelectTrigger><SelectValue placeholder={vehicleId ? "Choose a template" : "Pick a vehicle first"} /></SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {vehicleId && availableTemplates.length === 0 && (
                  <p className="text-xs text-muted-foreground">No inspection templates yet — ask an admin to create one in Admin → Inspection Templates.</p>
                )}
              </div>
              <Button className="w-full" disabled={!vehicleId || !templateId} onClick={startInspection}>
                Start inspection
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Run inspection">
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10">
          <div className="min-w-0">
            <p className="font-semibold truncate">{vehicle?.name} · {template?.name}</p>
            <p className="text-xs text-muted-foreground">{markedCount} / {allItems.length} items marked</p>
          </div>
          <Button size="sm" onClick={submit} disabled={!allMarked || submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>

        {(template?.sections || []).map((section, sIdx) => (
          <Card key={sIdx}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{section.section_name}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(section.items || []).map((item, iIdx) => {
                const key = `${sIdx}-${iIdx}`;
                const r = results[key] || {};
                return (
                  <div key={key} className="border rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.item_name}</p>
                      {photosEnabled && item.requires_photo && <Camera className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    </div>
                    <div className="flex gap-1.5">
                      {CONDITIONS.map((c) => {
                        const Icon = c.icon;
                        const active = r.condition === c.key;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setResult(key, { condition: c.key })}
                            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-medium transition-colors ${
                              active ? c.activeClass : "bg-card hover:bg-accent"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" /> {c.label}
                          </button>
                        );
                      })}
                    </div>
                    {r.condition && r.condition !== "GOOD" && (
                      <div className="space-y-2 pt-1">
                        <Textarea
                          placeholder="What's wrong?"
                          value={r.notes || ""}
                          onChange={(e) => setResult(key, { notes: e.target.value })}
                          className="text-sm min-h-[60px]"
                        />
                        {photosEnabled && (
                          <label className="inline-flex items-center gap-1.5 text-xs text-primary cursor-pointer">
                            <Camera className="w-3.5 h-3.5" />
                            {uploadingKey === key ? "Uploading…" : r.photo_url ? "Photo attached — replace" : "Add photo"}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadPhoto(key, f); }}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
