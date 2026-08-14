import { api } from "./api";

// On-device text-to-speech for "spoken notices" and vernacular announcements.
//
// expo-speech is a native module, so we require it lazily and guard every call:
// if this JS is delivered over-the-air to an older build that doesn't yet embed
// the native side, playback simply no-ops instead of crashing the screen.
let Speech = null;
try {
  // eslint-disable-next-line global-require
  Speech = require("expo-speech");
} catch {
  Speech = null;
}

export const speechSupported = () => !!(Speech && typeof Speech.speak === "function");

const BCP47 = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

export function stopSpeaking() {
  try {
    Speech?.stop?.();
  } catch {}
}

// Speaks the given text in the chosen language. Best-effort; resolves quietly.
export function speak(text, lang = "en") {
  if (!speechSupported() || !text) return;
  try {
    Speech.stop();
    Speech.speak(String(text), { language: BCP47[lang] || "en-IN", rate: 0.95, pitch: 1.0 });
  } catch {}
}

// Translates (server-side) then speaks. Falls back to speaking the original text
// if translation is unavailable, so the button always does something.
export async function translateAndSpeak(text, lang = "en") {
  const src = String(text || "").trim();
  if (!src) return src;
  if (lang === "en") {
    speak(src, "en");
    return src;
  }
  try {
    const { text: translated } = await api.translate(src, lang);
    speak(translated || src, lang);
    return translated || src;
  } catch {
    speak(src, lang);
    return src;
  }
}
