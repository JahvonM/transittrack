// Bounded telemetry shared by driver and boarding heartbeats. Never authorization.
export function cleanHardwareHealth(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, max) : '';
  for (const [key, max] of [['native_version',16],['model',80],['android_version',24]] as const) {
    const value = str(o[key], max); if (value) out[key] = value;
  }
  if (['wifi','mobile','offline','other','unknown'].includes(o.network_type as string)) out.network_type = o.network_type;
  for (const key of ['internet_validated','recovery_available']) if (typeof o[key] === 'boolean') out[key] = o[key];
  for (const [key,min,max] of [['battery_temperature',-30,100],['free_storage_mb',0,10000000],['usb_devices',0,64],['cellular_bars',0,4],['recovery_count',0,100000]] as const) {
    const value = o[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) out[key] = key === 'battery_temperature' ? value : Math.floor(value);
  }
  const cellular = ['unsupported','unknown','permission_denied','absent','pin_required','puk_required','network_locked','ready','not_ready','disabled','error','restricted'];
  if (cellular.includes(o.cellular_state as string)) out.cellular_state = o.cellular_state;
  const carrier = str(o.cellular_carrier,60); if (carrier) out.cellular_carrier = carrier;
  if (['ready','recovered','waiting','retry_required'].includes(o.recovery_state as string)) out.recovery_state = o.recovery_state;
  return out;
}
