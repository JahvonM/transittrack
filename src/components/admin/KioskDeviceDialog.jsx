import { NFC_SPOTS, NFC_SPOT_LABEL } from "@/lib/kioskLayout";
import { ChoiceSelect } from "@/components/ui/choice-picker";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";


const KIOSK_TYPES = [
  { value: "bus_boarding", label: "Bus boarding" },
  { value: "driver", label: "Driver tablet" },
  { value: "job_signing", label: "Signing tablet (guests sign for jobs)" },
  // The store app on a driver's own phone or tablet: belongs to the driver,
  // who picks the bus before each shift. Saved as a driver device, personal.
  { value: "driver_own", label: "Driver's own phone or tablet (store app)" },
];

export default function KioskDeviceDialog({ open, onOpenChange, companies, vehicles, device, presetType, onSaved }) {
  const isEdit = !!device;
  const [label, setLabel] = useState("");
  const [kioskType, setKioskType] = useState("bus_boarding");
  const [companyId, setCompanyId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [displayLayout, setDisplayLayout] = useState("auto");
  // Boarding tablets: what the reader records, and whether taps need an open shift.
  const [readerMode, setReaderMode] = useState("both");
  const [nfcSpot, setNfcSpot] = useState("auto");
  const [needsShift, setNeedsShift] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [drivers, setDrivers] = useState([]);
  const own = kioskType === "driver_own";

  useEffect(() => {
    if (open) {
      setLabel(device?.label || "");
      setDisplayLayout(device?.display_layout || "auto");
      setReaderMode(device?.reader_mode || "both");
      setNfcSpot(device?.nfc_spot || "auto");
      setNeedsShift(device?.require_active_trip === true);
      // Retired types (card registry, front-desk sign-in) switch to bus boarding when edited.
      setKioskType(device?.personal ? "driver_own" : !device && presetType ? presetType : device?.kiosk_type && !["badge_registry", "front_desk"].includes(device.kiosk_type) ? device.kiosk_type : "bus_boarding");
      setCompanyId(device?.company_id || "");
      setVehicleId(device?.vehicle_id || "");
      setDriverId(device?.driver_id || "");
    }
  }, [open, device, presetType]);

  // The company's drivers, for a driver's own phone.
  useEffect(() => {
    if (!open || !own || !companyId) { setDrivers([]); return undefined; }
    let live = true;
    base44.entities.Driver.filter({ company_id: companyId }, "full_name", 300)
      .then((rows) => { if (live) setDrivers(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (live) setDrivers([]); });
    return () => { live = false; };
  }, [open, own, companyId]);

  const filteredVehicles = vehicles.filter((v) => {
    if (!companyId) return [];
    const byCompany = v.company_id === companyId;
    if (kioskType === "bus_boarding" || kioskType === "driver") return byCompany && v.type === "bus";
    // Jobs can go to any vehicle, so its signing tablet can be on any vehicle.
    return byCompany;
  });

  const needsVehicle = kioskType === "bus_boarding" || kioskType === "driver" || kioskType === "job_signing";
  const lockedOwn = isEdit && device?.personal;

  const handleSave = async () => {
    if (!label.trim()) {
      toast({ title: "Label required", variant: "destructive" });
      return;
    }
    if (!companyId) {
      toast({ title: "Company required", variant: "destructive" });
      return;
    }
    if (needsVehicle && !vehicleId) {
      toast({ title: "Vehicle required for this kiosk type", variant: "destructive" });
      return;
    }
    if (own && !driverId) {
      toast({ title: "Choose the driver", variant: "destructive" });
      return;
    }

    const company = companies.find((c) => c.id === companyId);
    const vehicle = filteredVehicles.find((v) => v.id === vehicleId);

    setSaving(true);
    try {
      if (lockedOwn) {
        // A driver's own phone keeps its driver; the phone picks the bus.
        await base44.entities.KioskDevice.update(device.id, { label: label.trim() });
        toast({ title: "Device updated" });
      } else if (own) {
        const created = await base44.entities.KioskDevice.create({
          label: label.trim(), kiosk_type: "driver", personal: true, driver_id: driverId,
          company_id: companyId, company_name: company?.name || "",
        });
        toast({ title: "Driver's device added", description: `Code for the McSween Driver app: ${created.pairing_code}. It works once, for 7 days.` });
      } else if (isEdit) {
        await base44.entities.KioskDevice.update(device.id, {
          label: label.trim(),
          kiosk_type: kioskType,
          display_layout: displayLayout,
          company_id: companyId,
          company_name: company?.name || "",
          vehicle_id: needsVehicle ? vehicleId : "",
          vehicle_name: needsVehicle ? vehicle?.name : "",
          ...(kioskType === "bus_boarding" ? { reader_mode: readerMode, require_active_trip: needsShift, nfc_spot: nfcSpot } : {}),
        });
        toast({ title: "Device updated" });
      } else {
        const created = await base44.entities.KioskDevice.create({
          label: label.trim(),
          kiosk_type: kioskType,
          display_layout: displayLayout,
          company_id: companyId,
          company_name: company?.name || "",
          vehicle_id: needsVehicle ? vehicleId : "",
          vehicle_name: needsVehicle ? vehicle?.name : "",
          ...(kioskType === "bus_boarding" ? { reader_mode: readerMode, require_active_trip: needsShift, nfc_spot: nfcSpot } : {}),
        });
        toast({ title: "Device registered", description: `Pairing code: ${created.pairing_code}` });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectClass = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lockedOwn ? "Driver's own device" : isEdit ? "Reassign device" : "Register kiosk tablet"}</DialogTitle>
          <DialogDescription>
            {lockedOwn
              ? "This phone or tablet belongs to its driver, who picks the bus in the app before each shift."
              : own
                ? "The driver installs McSween Driver from Google Play or the App Store and types the code (it works once, for 7 days). Before each shift they pick the bus and enter its PIN."
                : isEdit
                  ? "Update this device's company, vehicle, or kiosk type."
                  : "Create a device record and receive a one-time pairing code for the kiosk app."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Device label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={own ? "e.g. Ana's phone" : "e.g. Lobby tablet, Bus 12 tablet"}
            />
          </div>
          {!lockedOwn && <>
          <div className="space-y-2">
            <Label>Kiosk type</Label>
            <ChoiceSelect
              aria-label="Kiosk type" value={kioskType}
              onChange={(e) => setKioskType(e.target.value)}
              className={selectClass}
            >
              {KIOSK_TYPES.filter((t) => !isEdit || t.value !== "driver_own").map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </ChoiceSelect>
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <ChoiceSelect
              aria-label="Company" value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setVehicleId(""); setDriverId(""); }}
              className={selectClass}
            >
              <option value="">Select company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </ChoiceSelect>
          </div>
          {own && (
            <div className="space-y-2">
              <Label>Driver</Label>
              <ChoiceSelect aria-label="Driver" value={driverId} onChange={(e) => {
                setDriverId(e.target.value);
                const d = drivers.find((x) => x.id === e.target.value);
                if (d && !label.trim()) setLabel(`${(d.full_name || d.username || "Driver").split(" ")[0]}'s phone`);
              }} className={selectClass} disabled={!companyId}>
                <option value="">{companyId ? (drivers.length ? "Select driver…" : "No drivers in this company yet") : "Select a company first"}</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.username}</option>)}
              </ChoiceSelect>
            </div>
          )}
          {kioskType !== "driver" && !own && <div className="space-y-2">
            <Label htmlFor="kiosk-layout">Screen layout</Label>
            <ChoiceSelect id="kiosk-layout" aria-label="Screen layout" value={displayLayout} onChange={e => setDisplayLayout(e.target.value)} className={selectClass}>
              <option value="auto">Automatic / device choice</option><option value="tablet">Kiosk tablet</option><option value="phone">Kiosk phone</option>{kioskType === "bus_boarding" && <option value="validator">Validator (card reader above the screen)</option>}{kioskType === "bus_boarding" && <option value="info">Passenger information screen (no tapping)</option>}
            </ChoiceSelect>
          </div>}
          {kioskType === "bus_boarding" && <div className="space-y-2">
            <Label htmlFor="kiosk-reader-mode">What this reader records</Label>
            <ChoiceSelect id="kiosk-reader-mode" aria-label="What this reader records" value={readerMode} onChange={e => setReaderMode(e.target.value)} className={selectClass}>
              <option value="both">Boarding and getting off (tap on, tap again to get off)</option>
              <option value="boarding">Boarding only (front door)</option>
              <option value="exit">Getting off only (rear door)</option>
            </ChoiceSelect>
            <p className="text-caption text-muted-foreground">Cards record straight away, with no question. On a two-way reader the first tap is getting on and the next tap is getting off; a second tap within 5 minutes is shown as "Already recorded" (30 minutes on a one-way reader). Codes and QR still ask on a two-way reader.</p>
            <Label htmlFor="kiosk-nfc-spot">Where passengers tap their card</Label>
            <ChoiceSelect id="kiosk-nfc-spot" aria-label="Where passengers tap their card" value={nfcSpot} onChange={e => setNfcSpot(e.target.value)} className={selectClass}>
              {NFC_SPOTS.map((k) => <option key={k} value={k}>{NFC_SPOT_LABEL[k]}</option>)}
            </ChoiceSelect>
            <p className="text-caption text-muted-foreground">The boarding screen shows passengers where to hold their card. Automatic: above the screen on a validator (a T10 is recognised), the back of a phone, or the card reader beside a tablet.</p>
            <label className="flex items-start gap-2 text-body-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={needsShift} onChange={e => setNeedsShift(e.target.checked)} />
              <span>Only accept taps while a driver shift is open on this bus<span className="block text-caption text-muted-foreground">Without one, the tablet says "No trip is running on this bus yet" and asks the driver to start their shift. Taps saved offline are still kept.</span></span>
            </label>
          </div>}
          {needsVehicle && (
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <ChoiceSelect
                aria-label="Vehicle" value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className={selectClass}
                disabled={!companyId}
              >
                <option value="">Select vehicle…</option>
                {filteredVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}{v.plate_number ? ` · ${v.plate_number}` : ""}</option>
                ))}
              </ChoiceSelect>
              {/* What moving a paired tablet to another bus does to it. */}
              {isEdit && device?.paired && vehicleId && vehicleId !== (device.vehicle_id || "") && (
                <p role="status" className="text-xs text-muted-foreground">
                  {kioskType === "job_signing" && device.kiosk_type === "job_signing"
                    ? "The tablet stays paired and switches to the new bus within a minute. Move it while it's online: signatures saved on it with no signal can't be sent after a move and are kept on the tablet for review."
                    : kioskType === "driver" && device.kiosk_type === "driver"
                      ? "The tablet stays paired and switches to the new bus within a minute, then asks for the new bus's PIN. Drivers can also do this on the tablet with Switch bus."
                      : "This tablet will need a new pairing code after it changes bus."}
                </p>
              )}
            </div>
          )}
          </>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : own ? "Add and get code" : "Register device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}