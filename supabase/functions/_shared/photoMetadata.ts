// Photos keep what the phone wrote into them: the GPS position, the time, the
// phone's model. A driver's photo taken at home would give their address to
// anyone with its public link. Every upload passes through here (upload() in
// base44-compat.ts) and leaves with that removed, without re-encoding, so the
// picture itself is unchanged. Kept: the colour profile, and which way up the
// photo goes (a small new EXIF block holding only that), so nothing turns
// sideways.
//
// JPEG, PNG and WebP are cleaned; anything else passes through as it came
// (the app converts iPhone HEIC photos to JPEG before uploading them).

type Bytes = Uint8Array;

const u16be = (b: Bytes, i: number) => (b[i] << 8) | b[i + 1];
const u32le = (b: Bytes, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b: Bytes, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function concat(parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export function photoKind(b: Bytes): 'jpeg' | 'png' | 'webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  return null;
}

// ----- JPEG -----

// Which way up, from an EXIF block (the APP1 segment's data after its length).
function exifOrientation(seg: Bytes): number {
  if (seg.length < 14 || ascii(seg, 0, 4) !== 'Exif') return 1;
  const t = 6; // the TIFF header
  const little = seg[t] === 0x49 && seg[t + 1] === 0x49;
  if (!little && !(seg[t] === 0x4d && seg[t + 1] === 0x4d)) return 1;
  const r16 = (i: number) => (little ? seg[i] | (seg[i + 1] << 8) : u16be(seg, i));
  const r32 = (i: number) => (little ? u32le(seg, i) : ((seg[i] << 24) | (seg[i + 1] << 16) | (seg[i + 2] << 8) | seg[i + 3]) >>> 0);
  const ifd = t + r32(t + 4);
  if (ifd + 2 > seg.length) return 1;
  const count = r16(ifd);
  for (let k = 0; k < count; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > seg.length) break;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

// An APP1 segment holding only the orientation (big-endian TIFF, one entry).
function orientationSegment(orientation: number): Bytes {
  const body = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // MM, 42, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const len = body.length + 2;
  return new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...body]);
}

// Kept segments: the JFIF header (APP0), the colour profile (APP2
// "ICC_PROFILE"), Adobe's colour flag (APP14) and everything the picture
// needs. Gone: EXIF and XMP (APP1), other APPn blocks, IPTC (APP13),
// comments, and anything after the end of the picture (some phones append
// extra pictures there, each with its own EXIF).
function cleanJpeg(b: Bytes): Bytes | null {
  const parts: Bytes[] = [b.subarray(0, 2)];
  let orientation = 1;
  let i = 2;
  let scanning = false; // inside a picture's compressed data
  while (i < b.length) {
    if (scanning) {
      // Compressed data runs until a marker other than stuffing or a restart.
      let j = i;
      while (j + 1 < b.length && !(b[j] === 0xff && b[j + 1] !== 0x00 && !(b[j + 1] >= 0xd0 && b[j + 1] <= 0xd7) && b[j + 1] !== 0xff)) j++;
      if (j + 1 >= b.length) return null; // no end of picture
      parts.push(b.subarray(i, j));
      i = j;
      scanning = false;
      continue;
    }
    if (b[i] !== 0xff) return null;
    while (i + 1 < b.length && b[i + 1] === 0xff) i++; // fill bytes
    if (i + 1 >= b.length) return null;
    const marker = b[i + 1];
    if (marker === 0xd9) { parts.push(b.subarray(i, i + 2)); break; } // end of picture
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { parts.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > b.length) return null;
    const end = i + 2 + u16be(b, i + 2);
    if (end > b.length || end < i + 4) return null;
    const data = b.subarray(i + 4, end);
    const keep =
      marker === 0xe0 ||
      (marker === 0xe2 && ascii(data, 0, 12) === 'ICC_PROFILE\0') ||
      marker === 0xee ||
      !((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe);
    if (marker === 0xe1 && orientation === 1) orientation = exifOrientation(data);
    if (keep) parts.push(b.subarray(i, end));
    i = end;
    if (marker === 0xda) scanning = true;
  }
  if (!parts.length || parts[parts.length - 1][1] !== 0xd9) return null;
  // Which way up goes first, or straight after the JFIF header when there is one.
  if (orientation !== 1) parts.splice(parts[1]?.[1] === 0xe0 ? 2 : 1, 0, orientationSegment(orientation));
  return concat(parts);
}

// ----- PNG -----

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function cleanPng(b: Bytes): Bytes | null {
  const parts: Bytes[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') return concat(parts);
  }
  return null;
}

// ----- WebP -----

function cleanWebp(b: Bytes): Bytes | null {
  const chunks: Bytes[] = [];
  let i = 12;
  const riffEnd = Math.min(b.length, 8 + u32le(b, 4));
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    const end = i + 8 + size + (size & 1);
    if (i + 8 + size > b.length) return null;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04); // no EXIF, no XMP
      chunks.push(chunk);
    }
    i = end;
  }
  const body = concat(chunks);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 4), 0);
  const size = body.length + 4;
  head.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff], 4);
  head.set(b.subarray(8, 12), 8);
  return concat([head, body]);
}

// The photo without what the phone wrote into it, or null when it isn't a
// JPEG, PNG or WebP (or can't be read as one): then it is kept as it came.
export function stripPhotoMetadata(b: Bytes): Bytes | null {
  try {
    const kind = photoKind(b);
    if (kind === 'jpeg') return cleanJpeg(b);
    if (kind === 'png') return cleanPng(b);
    if (kind === 'webp') return cleanWebp(b);
  } catch { /* unreadable: kept as it came */ }
  return null;
}
