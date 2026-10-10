// Admin → Kiosk tablets network controls (TransitTrack Helper 1.9+ on the tablet):
//  - boarding tablets: scan for Wi-Fi networks around the tablet, join a chosen one
//  - driver tablets:   keep the hotspot on all the time, or back to normal
//
// How a command travels: kioskNetwork (admin only) stores it on the KioskDevice
// record as `network_command`. entityAccess never returns that field, so the app
// never shows a Wi-Fi password (only admins can read the record directly). The tablet's next
// check-in (kioskHeartbeat / driverSession) hands it to the tablet, whose page
// passes it to the helper app. The tablet confirms with `network_ack` on the
// following check-in, which deletes the command; unconfirmed commands are
// deleted after COMMAND_TTL_MS. A password is therefore stored only until the
// tablet has it. `network_status` (no password) is what Admin shows.
// Wi-Fi passwords are only ever given to a tablet that proved its device key.

export const COMMAND_TTL_MS = 10 * 60 * 1000;
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export type NetworkCommand = {
  id: string;
  type: 'wifi_scan' | 'wifi_join' | 'hotspot';
  ssid?: string;
  password?: string;
  always_on?: boolean;
  requested_at: string;
};

// Network names are 1–32 bytes; no control characters.
export function validSsid(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim() || CONTROL.test(v)) return null;
  return new TextEncoder().encode(v).length <= 32 ? v : null;
}

// '' for an open network, otherwise a WPA/WPA2 passphrase: 8–63 printable ASCII.
export function validWifiPassword(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') return null;
  return /^[\x20-\x7e]{8,63}$/.test(v) ? v : null;
}

function commandId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Builds the command and the matching display status, or throws a message for the admin.
export function newNetworkCommand(device: Record<string, any>, input: Record<string, unknown>, now = new Date()) {
  const action = input.action;
  const requested_at = now.toISOString();
  const id = commandId();
  if (action === 'scan' || action === 'join') {
    if (device.kiosk_type !== 'bus_boarding') throw new Error('Wi-Fi can only be chosen for boarding tablets.');
    if (action === 'scan') {
      const command: NetworkCommand = { id, type: 'wifi_scan', requested_at };
      return { command, status: { id, type: 'wifi_scan', requested_at, state: 'waiting' } };
    }
    const ssid = validSsid(input.ssid);
    if (!ssid) throw new Error('Choose a Wi-Fi network from the list.');
    const password = validWifiPassword(input.password);
    if (password === null) throw new Error('Wi-Fi passwords are 8 to 63 characters.');
    const command: NetworkCommand = { id, type: 'wifi_join', ssid, password, requested_at };
    return { command, status: { id, type: 'wifi_join', ssid, requested_at, state: 'waiting' } };
  }
  if (action === 'hotspot') {
    if (device.kiosk_type !== 'driver') throw new Error('The hotspot switch is for driver tablets.');
    if (typeof input.always_on !== 'boolean') throw new Error('Choose on or off.');
    const command: NetworkCommand = { id, type: 'hotspot', always_on: input.always_on, requested_at };
    return { command, status: { id, type: 'hotspot', always_on: input.always_on, requested_at, state: 'waiting' } };
  }
  throw new Error('Unknown network action.');
}

function expired(cmd: NetworkCommand, now: number): boolean {
  const at = Date.parse(cmd?.requested_at || '');
  return !(Number.isFinite(at) && now - at <= COMMAND_TTL_MS);
}

function wellFormed(cmd: unknown): cmd is NetworkCommand {
  const c = cmd as NetworkCommand;
  return !!c && typeof c === 'object' && typeof c.id === 'string' && ID.test(c.id)
    && ['wifi_scan', 'wifi_join', 'hotspot'].includes(c.type);
}

// What this check-in should hand to the tablet, if anything. Wi-Fi commands go
// only to boarding tablets, hotspot ones only to driver tablets, and a Wi-Fi
// password only to a tablet that presented its device key (`authenticated`).
export function commandForTablet(device: Record<string, any>, authenticated: boolean, now = Date.now()) {
  const cmd = device?.network_command;
  if (!wellFormed(cmd) || expired(cmd, now)) return null;
  if (cmd.type === 'hotspot') {
    return device.kiosk_type === 'driver' && typeof cmd.always_on === 'boolean'
      ? { id: cmd.id, type: 'hotspot', always_on: cmd.always_on } : null;
  }
  if (device.kiosk_type !== 'bus_boarding') return null;
  if (cmd.type === 'wifi_scan') return { id: cmd.id, type: 'wifi_scan' };
  if (!authenticated || !validSsid(cmd.ssid) || validWifiPassword(cmd.password) === null) return null;
  return { id: cmd.id, type: 'wifi_join', ssid: cmd.ssid, password: cmd.password || '' };
}

// Fields to save on this check-in: delete a command the tablet confirmed
// (network_ack) or one that has expired, and update what Admin shows.
export function checkInUpdates(device: Record<string, any>, ack: unknown, now = Date.now()): Record<string, unknown> {
  const cmd = device?.network_command;
  if (!cmd) return {};
  const status = device.network_status && typeof device.network_status === 'object' ? device.network_status : {};
  const at = new Date(now).toISOString();
  if (wellFormed(cmd) && typeof ack === 'string' && ack === cmd.id) {
    return { network_command: null, network_status: { ...status, id: cmd.id, state: 'delivered', delivered_at: at } };
  }
  if (!wellFormed(cmd) || expired(cmd, now)) {
    const same = wellFormed(cmd) && status.id === cmd.id;
    return { network_command: null, ...(same ? { network_status: { ...status, state: 'expired', expired_at: at } } : {}) };
  }
  return {};
}

// Shows "sent to the tablet" in Admin the first time a check-in hands the command over.
export function sentUpdates(device: Record<string, any>, handed: { id: string } | null, now = Date.now()): Record<string, unknown> {
  const status = device?.network_status;
  if (!handed || !status || typeof status !== 'object' || status.id !== handed.id || status.state !== 'waiting') return {};
  return { network_status: { ...status, state: 'sent', sent_at: new Date(now).toISOString() } };
}

// Everything one check-in does: what to save on the device and what to hand the tablet.
export function networkCheckIn(device: Record<string, any>, ack: unknown, authenticated: boolean, now = Date.now()) {
  const cleared = checkInUpdates(device, ack, now);
  const current = 'network_command' in cleared
    ? { ...device, network_command: cleared.network_command, network_status: cleared.network_status ?? device.network_status }
    : device;
  const handed = commandForTablet(current, authenticated, now);
  return { updates: { ...cleared, ...sentUpdates(current, handed, now) }, command: handed };
}

// The network part of the helper's health report: the boarding tablet's Wi-Fi
// (current network, latest scan, latest join) and a driver tablet's always-on
// switch. Everything is length-limited text, numbers or known words.
export function cleanNetworkHealth(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, n) : undefined);
  const bars = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(4, Math.round(v))) : undefined);
  const date = (v: unknown) => { const s = text(v, 40); return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined; };
  if (typeof o.hotspot_always === 'boolean') out.hotspot_always = o.hotspot_always;
  const w = o.wifi;
  if (w && typeof w === 'object' && !Array.isArray(w)) {
    const wifi = w as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    const ssid = text(wifi.ssid, 32);
    if (ssid !== undefined) clean.ssid = ssid;
    const b = bars(wifi.bars); if (b !== undefined) clean.bars = b;
    if (Array.isArray(wifi.networks)) {
      clean.networks = wifi.networks.slice(0, 25).flatMap((n) => {
        if (!n || typeof n !== 'object') return [];
        const r = n as Record<string, unknown>;
        const name = text(r.ssid, 32);
        if (!name || !name.trim()) return [];
        const lock = ['open', 'password', 'unsupported'].includes(r.lock as string) ? r.lock : 'unsupported';
        return [{ ssid: name, bars: bars(r.bars) ?? 0, lock }];
      });
      const scanned = date(wifi.scanned_at); if (scanned) clean.scanned_at = scanned;
    }
    const j = wifi.join;
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const join = j as Record<string, unknown>;
      const state = ['joining', 'connected', 'failed'].includes(join.state as string) ? join.state : undefined;
      if (state) {
        clean.join = {
          id: typeof join.id === 'string' && ID.test(join.id) ? join.id : '',
          ssid: text(join.ssid, 32) || '',
          state,
          message: text(join.message, 160) || '',
          ...(date(join.at) ? { at: date(join.at) } : {}),
        };
      }
    }
    out.wifi = clean;
  }
  return out;
}
