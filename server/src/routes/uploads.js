import { Router } from "express";
import { randomBytes } from "crypto";
import { authRequired } from "../auth.js";
import { createSignedUpload, storageEnabled } from "../storage.js";

export const uploadsRouter = Router();

// Phone uploads the file straight to object storage. The API only stores the
// resulting URL. When storage env is missing, the client keeps using base64.
uploadsRouter.post("/uploads/sign", authRequired, async (req, res) => {
  if (!storageEnabled) {
    return res.status(503).json({
      message: "Direct upload is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.",
      fallback: "base64",
    });
  }
  const folder = String(req.body?.folder || "uploads").replace(/[^a-z0-9/_-]/gi, "").slice(0, 40) || "uploads";
  const contentType = String(req.body?.contentType || "image/jpeg");
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(contentType)) {
    return res.status(400).json({ message: "That file type is not allowed." });
  }
  const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1] || "jpg";
  const id = `${req.user.id.slice(0, 8)}-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const signed = await createSignedUpload({ folder, id, ext, contentType });
  if (!signed) return res.status(502).json({ message: "Could not create an upload slot." });
  res.json(signed);
});
