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
