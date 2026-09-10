import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import {
  aiEnabled,
  transcriptionEnabled,
  assistantAnswer,
  assistantAct,
  transcribeAudio,
  parseVisitorFromText,
  translateText,
} from "../ai.js";

export const aiRouter = Router();

function ensureEnabled(res) {
  if (!aiEnabled) {
    res.status(503).json({
      message:
        "AI is not configured. Set AI_API_KEY (and optionally AI_BASE_URL/AI_CHAT_MODEL) on the server to enable it.",
    });
    return false;
  }
  return true;
}

// Natural-language assistant for all roles ("who visited my flat 2 weeks ago",
// "how much is due", "society balance"). Answers are scoped to the caller's role.
aiRouter.post("/assistant", authRequired, async (req, res) => {
  if (!ensureEnabled(res)) return;
  const { question } = req.body || {};
  if (!question || !String(question).trim()) {
    return res.status(400).json({ message: "question is required" });
  }
  try {
    const answer = await assistantAnswer(req.user, String(question).trim());
    res.json({ answer });
  } catch (err) {
    // A provider outage or a retired model id must not leave the user staring at
    // an error. assistantAct answers from the same data snapshot without the
    // LLM, so the tab still says something useful.
    console.error("AI assistant failed, falling back:", err.message);
    try {
      const { reply, source } = await assistantAct(req.user, String(question).trim());
      res.json({ answer: reply, source });
    } catch (fallbackErr) {
      console.error("AI assistant fallback failed:", fallbackErr.message);
      res.status(502).json({ message: "AI request failed. Please try again." });
    }
  }
});

// Same as /assistant but also returns the screen that fulfils the request, so
// the AI home tab can act on it ("pay my bill" -> opens the bills screen).
// Never 502s for a normal question: it degrades to deterministic intent
// matching when the provider is unreachable.
aiRouter.post("/act", authRequired, async (req, res) => {
  const { question } = req.body || {};
  if (!question || !String(question).trim()) {
    return res.status(400).json({ message: "question is required" });
  }
  try {
    const result = await assistantAct(req.user, String(question).trim());
    res.json({ ...result, aiEnabled });
  } catch (err) {
    console.error("AI act failed:", err.message);
    res.status(502).json({ message: "Could not process that request. Please try again." });
  }
});

// General-purpose speech-to-text for the AI home tab's mic button. Unlike
// /voice-visitor this is open to every role and returns plain text, which the
// caller then sends to /act.
aiRouter.post("/transcribe", authRequired, async (req, res) => {
  if (!ensureEnabled(res)) return;
  const { audioBase64 } = req.body || {};
  if (!audioBase64) return res.status(400).json({ message: "audioBase64 is required" });
  if (!transcriptionEnabled) {
    return res.status(503).json({
      message:
        "Voice input needs a Whisper-capable provider (e.g. OpenAI or Groq). Type your request instead.",
    });
  }
  try {
    const raw = audioBase64.replace(/^data:.*;base64,/, "");
    const text = await transcribeAudio(Buffer.from(raw, "base64"));
    if (!text.trim()) {
      return res.status(400).json({ message: "No speech detected. Please try again." });
    }
    res.json({ text: text.trim() });
  } catch (err) {
    console.error("AI transcribe failed:", err.message);
    res.status(502).json({ message: `Could not process the audio: ${err.message}` });
  }
});

// Voice-to-entry for guards: accepts recorded audio (base64) or a plain
// transcript, and returns structured visitor fields to prefill the form.
aiRouter.post("/voice-visitor", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  if (!ensureEnabled(res)) return;
  const { audioBase64, transcript } = req.body || {};
  try {
    let text = transcript || "";
    if (!text && audioBase64) {
      if (!transcriptionEnabled) {
        return res.status(503).json({
          message:
            "Voice transcription needs a Whisper-capable provider (e.g. OpenAI or Groq). Type the details instead, or set AI_TRANSCRIBE_MODEL=whisper-large-v3 with Groq.",
        });
      }
      const raw = audioBase64.replace(/^data:.*;base64,/, "");
      const buffer = Buffer.from(raw, "base64");
      text = await transcribeAudio(buffer);
    }
    if (!text.trim()) {
      return res.status(400).json({ message: "No speech detected. Please try again." });
    }
    // Only match against flats in the caller's society (not every tenant's).
    const societyId = req.user.societyId || "__none__";
    const [flats, society] = await Promise.all([
      prisma.flat.findMany({ where: { societyId }, select: { flatNo: true } }),
      prisma.society.findUnique({ where: { id: societyId }, select: { orgType: true } }),
    ]);
    const orgType = society?.orgType === "preschool" ? "preschool" : "society";
    const fields = await parseVisitorFromText(text, flats.map((f) => f.flatNo), { orgType });
    // The transcript goes back too: guards trust the form far more when they can
    // see what was actually heard.
    res.json({ transcript: text, fields });
  } catch (err) {
    console.error("AI voice-visitor failed:", err.message);
    // Surface the real reason so guards/admins can act (e.g. transcription
    // provider rejected the audio) instead of a vague "could not process".
    res.status(502).json({ message: `Could not process the voice input: ${err.message}` });
  }
});

// Translate a notice/announcement so it can be shown and read aloud in the
// resident's language (Marathi/Hindi/English). Falls back to the original text
// when AI is off, so the "Listen" button always has something to speak.
aiRouter.post("/translate", authRequired, async (req, res) => {
  const { text, lang } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ message: "text is required" });
  try {
    const translated = await translateText(String(text).trim(), lang || "hi");
    res.json({ text: translated, lang: lang || "hi", enabled: aiEnabled });
  } catch (err) {
    console.error("AI translate failed:", err.message);
    res.json({ text: String(text).trim(), lang: lang || "hi", enabled: false });
  }
});
