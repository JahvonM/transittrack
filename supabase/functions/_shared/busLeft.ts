// A driver tablet (or a driver's own phone) left this bus: it switched bus,
// was moved to another bus in Admin, or the phone changed bus. Nothing on the
// bus shares its position any more, so "sharing location" goes off. Left on,
// the office map and passengers kept showing the bus as live (or "signal
// lost") at the last place the tablet saw it.
//
// It stays on when the office locked sharing on, when a driver's phone is the
// bus's backup GPS, when another driver tablet or phone is still on the bus,
// or when another device has a shift open on it: then the office or that
// device is still in charge of it.
export async function stopSharingLeftBus(db, bus, deviceId): Promise<boolean> {
  if (!bus?.id || !bus.tracking_active || bus.remote_tracking_lock || bus.backup_gps_driver_email) return false;
  const [devices, shifts] = await Promise.all([
    db.KioskDevice.filter({ vehicle_id: bus.id, kiosk_type: 'driver' }, '-created_date', 20).catch(() => null),
    db.DriverShift.filter({ vehicle_id: bus.id }, '-started_at', 5).catch(() => null),
  ]);
  // Can't tell who else is on the bus: leave it as it is.
  if (!devices || !shifts) return false;
  if (devices.some((d) => d.id !== deviceId && d.vehicle_id === bus.id && d.paired && d.status === 'active')) return false;
  if (shifts.some((s) => !s.ended_at && s.device_id !== deviceId)) return false;
  await db.Vehicle.update(bus.id, { tracking_active: false });
  return true;
}
