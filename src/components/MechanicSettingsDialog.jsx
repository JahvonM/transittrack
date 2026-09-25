import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Fleet-wide maintenance settings, controlled only by the mechanic team —
// a single MaintenanceSettings row rather than a per-company field, since
// maintenance is a shared/central team here, not something each transport
// company should be able to tune for itself.
export default function MechanicSettingsDialog({ open, onOpenChange }) {
  const [settingsId, setSettingsId] = useState(null);
  const [autoCreateFaults, setAutoCreateFaults] = useState(true);
  const [reminderDays, setReminderDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    base44.entities.MaintenanceSettings.list().then((list) => {
      const s = list[0];
      if (s) {
        setSettingsId(s.id);
        setAutoCreateFaults(s.auto_create_faults !== false);
        setReminderDays(s.maintenance_reminder_days ?? 14);
      }
      setLoading(false);
    });
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { auto_create_faults: autoCreateFaults, maintenance_reminder_days: Number(reminderDays) || 14 };
      if (settingsId) {
        await base44.entities.MaintenanceSettings.update(settingsId, payload);
      } else {
        const created = await base44.entities.MaintenanceSettings.create(payload);
        setSettingsId(created.id);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Maintenance settings</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Auto-create faults</Label>
                <p className="text-xs text-muted-foreground">Failed inspections (driver checklist or Run Inspection) automatically open a Fault ticket.</p>
              </div>
              <Switch checked={autoCreateFaults} onCheckedChange={setAutoCreateFaults} />
            </div>
            <div className="space-y-1.5">
              <Label>Maintenance reminder (days ahead)</Label>
              <Input type="number" min={1} value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
              <p className="text-xs text-muted-foreground">How many days before a schedule is due to send a reminder email — applies fleet-wide.</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
