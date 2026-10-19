import sharp from "sharp";

// Phone cameras send multi-megabyte pictures. Stored copies are a smaller JPEG
// so Postgres and file storage stay on kilobytes, not megabytes. A full backup
// or a PDF is not a photo: those stay complete, and the platform backup is
// already gzipped.

const PROFILES = {
  visitor: { maxEdge: 960, quality: 60, maxBytes: 80 * 1024 },
  listing: { maxEdge: 1280, quality: 62, maxBytes: 120 * 1024 },
  document: { maxEdge: 1280, quality: 62, maxBytes: 120 * 1024 },
};

function profileFor(kind) {
  return PROFILES[kind] || PROFILES.document;
}

export function decodeDataUrl(input) {
  if (!input || typeof input !== "string") return null;
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(input.trim());
  if (!match) return null;
  try {
    return { contentType: match[1].toLowerCase(), buffer: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

async function toJpeg(buffer, maxEdge, quality) {
  return sharp(buffer, { failOn: "none", animated: false })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

// Returns a JPEG data URL small enough for the profile. Non-images (PDFs) and
// anything sharp cannot read are returned unchanged.
export async function compactDataUrl(input, kind = "document") {
  const decoded = decodeDataUrl(input);
  if (!decoded || !decoded.contentType.startsWith("image/")) return input;
  const profile = profileFor(kind);
  try {
    let out = await toJpeg(decoded.buffer, profile.maxEdge, profile.quality);
    if (out.length > profile.maxBytes) out = await toJpeg(decoded.buffer, 960, 50);
    if (out.length > profile.maxBytes) out = await toJpeg(decoded.buffer, 720, 42);
    if (decoded.contentType === "image/jpeg" && out.length >= decoded.buffer.length) return input;
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch (err) {
    console.error("image compact failed:", err.message);
    return input;
  }
}
