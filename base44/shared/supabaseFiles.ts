// Step 5 of the move to Supabase: files (used by copyToSupabase).
// Each Base44 file the tables point to is copied into a Supabase storage area
// (supabase/migrations/*_storage_areas.sql), recorded in storage_file_copy,
// and the copied row is pointed at the new file. Copying the tables again
// keeps the new link, because the map is applied to every copied row.
//
// - Only Base44's own file hosts are fetched (an address someone typed into a
//   photo field is never fetched), and only over https.
// - What a file is comes from its first bytes, not its name or the server's
//   label, so a web page can't be stored as a "photo".
// - New names are <table>/<row id>/<field>-<hash>.<ext>: no personal file
//   names, and the same Base44 file always lands on the same name.
// - public files get their public link; private files get storage://private/<path>,
//   which the app turns into a short-lived signed link when it shows them.

export const FILE_COLUMNS: Record<string, Record<string, 'public' | 'private'>> = {
  Advertisement: { image_url: 'public' },
  Company: { logo_url: 'public' },
  Vehicle: { image_url: 'public' },
  Part: { photo_url: 'public' },
  User: { photo_url: 'public' },
  Driver: { photo_url: 'public' },
  StaffCheckIn: { staff_picture_url: 'private' },
  FrontDeskSignIns: { signature_url: 'private' },
  Trip: { pickup_signature_url: 'private', dropoff_signature_url: 'private', pickup_signature_uri: 'private', dropoff_signature_uri: 'private' },
  GroupMessage: { media_url: 'private' },
  Incident: { photo_uris: 'private' },
  Fault: { photo_url: 'private' },
  InspectionResult: { photo_url: 'private' },
  DriverDocument: { file_uri: 'private' },
};

const FILE_HOSTS = new Set(['base44.app', 'media.base44.com']);
const FILE_MAX_BYTES: Record<string, number> = { public: 10 * 1024 * 1024, private: 25 * 1024 * 1024 };
const FILE_TYPES: Record<string, string[]> = {
  public: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  private: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'application/pdf', 'audio/webm', 'video/webm', 'audio/mp4', 'video/mp4', 'audio/mpeg', 'audio/ogg'],
};
const FILE_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'application/pdf': 'pdf',
  'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg',
};

// 'link' = a public Base44 file, 'private' = a Base44 private file id,
// null = anything else (empty, inline data:, another site, already copied).
export function base44FileKind(value: unknown): 'link' | 'private' | null {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  if (/^https:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      return FILE_HOSTS.has(u.hostname) && !u.username && !u.password && !u.port ? 'link' : null;
    } catch { return null; }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  return /^[A-Za-z0-9._/-]{8,512}$/.test(value) && !value.includes('..') ? 'private' : null;
}

// The values a file field holds: one, or a list (Incident.photo_uris).
export function fileValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

const fileAscii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
export function sniffFileType(b: Uint8Array, label = ''): string | null {
  if (b.length >= 8 && b[0] === 0x89 && fileAscii(b, 1, 4) === 'PNG') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && /^GIF8[79]a$/.test(fileAscii(b, 0, 6))) return 'image/gif';
  if (b.length >= 12 && fileAscii(b, 0, 4) === 'RIFF' && fileAscii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 5 && fileAscii(b, 0, 5) === '%PDF-') return 'application/pdf';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return /^video\//i.test(label) ? 'video/webm' : 'audio/webm';
  if (b.length >= 4 && fileAscii(b, 0, 4) === 'OggS') return 'audio/ogg';
  if (b.length >= 3 && (fileAscii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return 'audio/mpeg';
  if (b.length >= 12 && fileAscii(b, 4, 8) === 'ftyp') {
    const brand = fileAscii(b, 8, 12);
    if (/^(heic|heix|mif1|msf1|hevc)$/.test(brand)) return 'image/heic';
    return /^M4A /.test(brand) ? 'audio/mp4' : 'video/mp4';
  }
  return null;
}

async function fileHash(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function filePath(table: string, id: string, column: string, source: string, type: string) {
  const safeId = String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'row';
  return `${table}/${safeId}/${column}-${await fileHash(source)}.${FILE_EXT[type]}`;
}

// Fetches over https only, following at most 3 redirects, and stops reading
// past the size limit.
async function fileDownload(url: string, max: number) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(current, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      await res.body?.cancel().catch(() => {});
      if (!next) throw new Error('Redirect without an address');
      const u = new URL(next, current);
      if (u.protocol !== 'https:') throw new Error('Refused a redirect that is not https');
      current = u.href;
      continue;
    }
    if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new Error('Base44 answered HTTP ' + res.status); }
    if (Number(res.headers.get('content-length') || 0) > max) { await res.body?.cancel().catch(() => {}); throw new Error('Too big'); }
    const label = res.headers.get('content-type') || '';
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > max) throw new Error('Too big');
    return { bytes: buf, label };
  }
  throw new Error('Too many redirects');
}

// The address the app stores for a copied file.
export function fileReference(origin: string, bucket: string, path: string) {
  return bucket === 'public' ? `${origin}/storage/v1/object/public/public/${path}` : `storage://${bucket}/${path}`;
}

// Points a row's file fields at the copied files it has a record of.
export function applyFileMap(entity: string, row: Record<string, unknown>, map: Map<string, { bucket: string; path: string }>, origin: string) {
  const columns = FILE_COLUMNS[entity];
  if (!columns) return row;
  for (const column of Object.keys(columns)) {
    if (!(column in row)) continue;
    const swap = (v: unknown) => { const hit = typeof v === 'string' ? map.get(v) : undefined; return hit ? fileReference(origin, hit.bucket, hit.path) : v; };
    row[column] = Array.isArray(row[column]) ? (row[column] as unknown[]).map(swap) : swap(row[column]);
  }
  return row;
}

// Copies one Base44 file into Supabase storage and records it.
// signedUrl turns a Base44 private file id into a short-lived download link.
export async function copyOneFile(
  sb: { origin: string; headers: Record<string, string> },
  where: { table: string; id: string; column: string; bucket: 'public' | 'private' },
  source: string,
  kind: 'link' | 'private',
  signedUrl: (uri: string) => Promise<string>,
) {
  const url = kind === 'link' ? source : await signedUrl(source);
  if (!/^https:\/\//i.test(url || '')) throw new Error('Base44 gave no download link');
  const { bytes, label } = await fileDownload(url, FILE_MAX_BYTES[where.bucket]);
  const type = sniffFileType(bytes, label);
  if (!type || !FILE_TYPES[where.bucket].includes(type)) throw new Error(`Not a file type this area takes (${type || 'unknown'})`);
  const path = await filePath(where.table, where.id, where.column, source, type);
  const up = await fetch(`${sb.origin}/storage/v1/object/${where.bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { ...sb.headers, 'Content-Type': type, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: bytes,
  });
  if (!up.ok) {
    const text = await up.text().catch(() => '');
    let message = text.slice(0, 200) || 'HTTP ' + up.status;
    try { const j = JSON.parse(text); message = String(j.message || j.error || message).slice(0, 200); } catch { /* not JSON */ }
    throw new Error('Supabase storage: ' + message);
  }
  await up.body?.cancel().catch(() => {});
  const record = await fetch(`${sb.origin}/rest/v1/storage_file_copy?on_conflict=source`, {
    method: 'POST',
    headers: { ...sb.headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ source, bucket: where.bucket, path, content_type: type, bytes: bytes.length }]),
  });
  if (!record.ok) throw new Error('Copied, but could not record it: HTTP ' + record.status);
  await record.body?.cancel().catch(() => {});
  return { bucket: where.bucket, path };
}

// Every file Supabase already has a copy of, by its Base44 source.
export async function loadFileMap(sb: { origin: string; headers: Record<string, string> }) {
  const map = new Map<string, { bucket: string; path: string }>();
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${sb.origin}/rest/v1/storage_file_copy?select=source,bucket,path&order=source`, { headers: { ...sb.headers, Range: `${from}-${from + 999}` } });
    if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new Error('Could not read the file list: HTTP ' + res.status); }
    const rows = await res.json();
    for (const r of rows) map.set(r.source, { bucket: r.bucket, path: r.path });
    if (rows.length < 1000) break;
  }
  return map;
}
