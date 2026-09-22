// Which of the three languages GATEZO speaks a piece of text is in.
//
// Hindi and Marathi share Devanagari, so script alone cannot tell them apart —
// these very common Marathi words do. Anything without Devanagari is treated as
// English (including Hinglish typed in Latin script, which the assistant
// already understands).
//
// Matching is whole-word: as a substring, "काय" also sits inside the Hindi
// "शिकायत", which would answer a Hindi complaint in Marathi.
const MARATHI_WORDS = new Set([
  "आहे", "आहेत", "नाही", "नाहीये", "काय", "कसं", "कसे", "कशी", "किती",
  "माझा", "माझी", "माझं", "माझ्या", "मला", "तुम्ही", "पाहिजे", "करायचं", "कुठे", "कधी",
]);

export const LANG_LABELS = { en: "English", hi: "हिंदी", mr: "मराठी" };

export function detectLang(text) {
  const s = String(text || "");
  if (!/[\u0900-\u097F]/.test(s)) return "en";
  const words = s.split(/[^\u0900-\u097F]+/).filter(Boolean);
  return words.some((w) => MARATHI_WORDS.has(w)) ? "mr" : "hi";
}

export function isIndic(lang) {
  return lang === "hi" || lang === "mr";
}

export function hasDevanagari(text) {
  return /[\u0900-\u097F]/.test(String(text || ""));
}

// Offline safety net for Devanagari questions.
//
// Understanding a Hindi or Marathi question normally goes through the server's
// translate call. That needs an AI provider, and this app is deliberately
// local-first because the provider has gone down (and retired a model) before.
// So map the handful of things residents actually ask onto the canonical
// English question, which the assistant answers from live society data.
const INDIC_QUESTIONS = [
  { re: /(मेंटेनेंस|मेन्टेनन्स|मेंटेनन्स|मेंटेनेन्स|बकाया|थकबाकी|बिल|भुगतान|शुल्क|फीस|पैसे)/, en: "how much maintenance is pending" },
  { re: /(विजिटर|व्हिजिटर|मेहमान|पाहुणे|कौन आया|कोण आले|कोण आला|गेट पर|गेटवर)/, en: "who visited my flat recently" },
  { re: /(गेट पास|गेटपास|पास बनाओ|पास काढ)/, en: "create a gate pass" },
  { re: /(क्लबहाउस|क्लब हाउस|हॉल|सभागृह|बुकिंग|बुक कर)/, en: "book clubhouse" },
  { re: /(शिकायत|तक्रार|समस्या|हेल्पडेस्क|दुरुस्ती|मरम्मत)/, en: "raise a complaint" },
  { re: /(आपातकाल|आपत्कालीन|इमरजेंसी|एसओएस|मदद चाहिए|मदत हवी)/, en: "emergency sos" },
  { re: /(खरीद|बेच|खरेदी|विक्री|बाजार|मार्केट)/, en: "open buy and sell" },
  { re: /(मेड|कामवाली|कामगार|नौकर|बाई|ड्राइवर|ड्रायव्हर)/, en: "trusted helpers" },
  { re: /(गाड़ी|गाडी|वाहन|पार्किंग|नंबर प्लेट)/, en: "vehicle passes" },
  { re: /(पारदर्शिता|पैसा कहाँ|पैसे कुठे|खर्च)/, en: "transparency where money went" },
  { re: /(कैसे|कसे|कशी|कसं|कैसा)/, en: "how do I use the app" },
];

export function indicToEnglishQuestion(text) {
  const s = String(text || "");
  for (const { re, en } of INDIC_QUESTIONS) {
    if (re.test(s)) return en;
  }
  return null;
}
