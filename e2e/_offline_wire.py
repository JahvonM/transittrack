def sub(f, old, new):
    s = open(f).read()
    assert old in s, (f, old[:80])
    open(f, "w").write(s.replace(old, new, 1))

# --- RunInspection: build a job payload, try it live, queue the rest if offline
f = "src/pages/RunInspection.jsx"
s = open(f).read()
start = s.index("      await Promise.all(resultRecords.map((r) => base44.entities.InspectionResult.create(r)));")
end = s.index("      await base44.entities.Vehicle.update(vehicle.id, { last_inspection_date: now.slice(0, 10) });")
end_line = "      await base44.entities.Vehicle.update(vehicle.id, { last_inspection_date: now.slice(0, 10) });\n"
new_block = '''      const failedItems = allItems.filter((it) => results[it.key]?.condition === "FAILED");
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
'''
s = s[:start] + new_block + s[end + len(end_line):]
# failedItems / faultsCreated were declared in the removed block; summary uses them
s = s.replace('''        faultsCreated,
      });''', '''        faultsCreated,
        queued,
      });''', 1)
s = s.replace('import BusLoader from "@/components/BusLoader";',
              'import BusLoader from "@/components/BusLoader";\nimport { enqueueJob, isOfflineError } from "@/lib/offlineJobs";\nimport { runMechanicInspection } from "@/lib/offlineRunners";', 1)
open(f, "w").write(s)
print("RunInspection patched")

# --- PreTripInspection: queue when offline
f = "src/components/driver/PreTripInspection.jsx"
sub(f, '''    try {
      const result = await invoke("submit_inspection", {
        checklist: checklistObj,
        odometer: odometer ? Number(odometer) : undefined,
        fuel: Number(fuel),
        status: passed ? "passed" : "failed",
        service_notes: !passed ? "Failed items: " + failed.map((f) => f.label).join("; ") : "",
      });''', '''    const payload = {
      checklist: checklistObj,
      odometer: odometer ? Number(odometer) : undefined,
      fuel: Number(fuel),
      status: passed ? "passed" : "failed",
      service_notes: !passed ? "Failed items: " + failed.map((f) => f.label).join("; ") : "",
    };
    try {
      const result = await invoke("submit_inspection", payload);''')
sub(f, '''    } catch (e) {
      toast({ title: "Couldn't save inspection", description: e.message, variant: "destructive" });
    }
    setSubmitting(false);''', '''    } catch (e) {
      const deviceId = localStorage.getItem("tt_driver_device_id");
      if (isOfflineError(e) && deviceId) {
        // No signal: keep it on the tablet and upload when back online.
        enqueueJob("driver_inspection", { ...payload, device_id: deviceId }, `Pre-trip check · ${vehicle?.name || "vehicle"}`);
        toast({ title: "Saved on this tablet", description: "No connection right now. The inspection will upload automatically when you're back online." });
        onCompleted(null, passed);
      } else {
        toast({ title: "Couldn't save inspection", description: e.message, variant: "destructive" });
      }
    }
    setSubmitting(false);''')
s = open(f).read()
lines = s.split("\n")
last = max(i for i, l in enumerate(lines) if l.startswith("import "))
while not lines[last].rstrip().endswith(";"):
    last += 1
lines.insert(last + 1, 'import { enqueueJob, isOfflineError } from "@/lib/offlineJobs";')
open(f, "w").write("\n".join(lines))
print("PreTrip patched")

# --- main.jsx: register runners
f = "src/main.jsx"
sub(f, "import { installGlobalErrorReporting } from '@/lib/reportError'",
    "import { installGlobalErrorReporting } from '@/lib/reportError'\nimport { installOfflineRunners } from '@/lib/offlineRunners'")
sub(f, "installGlobalErrorReporting()", "installGlobalErrorReporting()\ninstallOfflineRunners()")
print("main patched")
