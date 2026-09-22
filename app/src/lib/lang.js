// Which of the three languages GATEZO speaks a piece of text is in.
//
// Hindi and Marathi share Devanagari, so script alone cannot tell them apart —
// these very common Marathi words do. Anything without Devanagari is treated as
// English (including Hinglish typed in Latin script, which the assistant
// already understands).
const MARATHI_MARKERS = /(आहे|आहेत|नाही|काय|कसं|कसे|किती|माझ्या|माझा|माझी|तुम्ही|मला|करायच|पाहिजे)/;

export const LANG_LABELS = { en: "English", hi: "हिंदी", mr: "मराठी" };

export function detectLang(text) {
  const s = String(text || "");
  if (!/[\u0900-\u097F]/.test(s)) return "en";
  return MARATHI_MARKERS.test(s) ? "mr" : "hi";
}

export function isIndic(lang) {
  return lang === "hi" || lang === "mr";
}
