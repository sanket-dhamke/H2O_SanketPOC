import { createClient } from "@supabase/supabase-js";

// Supabase Storage for visitor photos. Optional: if env vars are not set the
// server falls back to a deterministic placeholder avatar so the demo still runs.
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const BUCKET = process.env.SUPABASE_BUCKET || "visitors";

export const storageEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

const supabase = storageEnabled
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Accepts a base64 data URL (or raw base64) from the guard's camera, uploads it
// to Supabase Storage and returns a public URL. Returns null on failure so the
// caller can fall back to a placeholder.
export async function uploadVisitorPhoto(base64, id) {
  if (!storageEnabled || !base64) return null;
  try {
    const match = /^data:(image\/\w+);base64,(.+)$/.exec(base64);
    const contentType = match ? match[1] : "image/jpeg";
    const raw = match ? match[2] : base64;
    const ext = contentType.split("/")[1] || "jpg";
    const buffer = Buffer.from(raw, "base64");
    const path = `${id}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) {
    console.error("Visitor photo upload failed:", err.message);
    return null;
  }
}

// Fallback avatar so every visitor still has an image in the UI.
export function placeholderPhoto(seed) {
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(seed)}`;
}

const BACKUP_BUCKET = process.env.SUPABASE_BACKUP_BUCKET || "backups";

// Uploads a backup archive (Buffer) to a PRIVATE bucket and returns a signed,
// time-limited download URL. Returns null if storage isn't configured. The
// bucket is created (private) on first use.
export async function uploadBackup(buffer, filename, { expiresIn = 7 * 24 * 3600 } = {}) {
  if (!storageEnabled || !buffer) return null;
  try {
    // Ensure a private bucket exists (idempotent: ignore "already exists").
    await supabase.storage.createBucket(BACKUP_BUCKET, { public: false }).catch(() => {});
    const path = `${new Date().toISOString().slice(0, 10)}/${filename}`;
    const { error } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(path, buffer, { contentType: "application/octet-stream", upsert: true });
    if (error) throw error;
    const { data, error: signErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (signErr) throw signErr;
    return { path, url: data?.signedUrl || null, bucket: BACKUP_BUCKET };
  } catch (err) {
    console.error("Backup upload failed:", err.message);
    return null;
  }
}

// Re-signs an existing backup object so the superadmin can download it later
// even after the original signed URL expired.
export async function signBackup(path, { expiresIn = 3600 } = {}) {
  if (!storageEnabled || !path) return null;
  try {
    const { data, error } = await supabase.storage.from(BACKUP_BUCKET).createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data?.signedUrl || null;
  } catch (err) {
    console.error("Backup re-sign failed:", err.message);
    return null;
  }
}

// Uploads a document (rent agreement, etc.) sent as a base64 data URL. Supports
// PDFs and images. Returns a public URL, or null if storage isn't configured.
export async function uploadDocument(base64, id, folder = "documents") {
  if (!storageEnabled || !base64) return null;
  try {
    const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(base64);
    const contentType = match ? match[1] : "application/pdf";
    const raw = match ? match[2] : base64;
    const extMap = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const ext = extMap[contentType] || (contentType.split("/")[1] || "bin");
    const buffer = Buffer.from(raw, "base64");
    const path = `${folder}/${id}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) {
    console.error("Document upload failed:", err.message);
    return null;
  }
}
