import heicConvert from 'heic-convert';

/**
 * Document media helpers — identify an image by its actual bytes (not its file
 * name, which phones get wrong) and make iPhone HEIC photos readable.
 *
 * Why this exists: browsers and Claude's vision both only handle
 * JPEG/PNG/WebP/GIF. iPhones save camera photos as HEIC by default, and files
 * picked from a phone often arrive with no extension — so a filename check
 * wrongly rejects perfectly good photos. Sniffing the bytes fixes that, and
 * transcoding HEIC→JPEG makes those photos both viewable and checkable.
 */

export type SniffedType = 'jpeg' | 'png' | 'webp' | 'gif' | 'heic' | 'pdf' | 'unknown';

/** Media types Claude vision accepts directly. */
export const CLAUDE_IMAGE_TYPES: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Identify a file from its leading bytes — robust to wrong/missing extensions. */
export function sniffType(buf: Buffer): SniffedType {
  if (buf.length < 12) return 'unknown';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  // PDF: "%PDF"
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
  // RIFF....WEBP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  // ISO-BMFF: bytes 4-8 = "ftyp", brand at 8-12 tells HEIC/HEIF variants.
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (['heic', 'heix', 'heif', 'mif1', 'msf1', 'hevc', 'heim', 'heis'].includes(brand)) return 'heic';
  }
  return 'unknown';
}

/** Convert a HEIC/HEIF buffer to JPEG. Pure JS (no native libs), so it runs on Railway. */
export async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const out = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.92 });
  return Buffer.from(out);
}

/**
 * Normalise a stored document buffer to something a browser and Claude can read.
 * Returns the (possibly converted) buffer, the Claude media type, and whether a
 * conversion happened (so callers can persist the JPEG and heal the record).
 * Returns null when the file is not a readable image (e.g. a real PDF).
 */
export async function toReadableImage(
  buf: Buffer,
): Promise<{ buffer: Buffer; mediaType: string; converted: boolean; kind: SniffedType } | null> {
  const kind = sniffType(buf);
  if (kind === 'heic') {
    const jpeg = await heicToJpeg(buf);
    return { buffer: jpeg, mediaType: 'image/jpeg', converted: true, kind };
  }
  if (CLAUDE_IMAGE_TYPES[kind]) {
    return { buffer: buf, mediaType: CLAUDE_IMAGE_TYPES[kind], converted: false, kind };
  }
  return null;
}
