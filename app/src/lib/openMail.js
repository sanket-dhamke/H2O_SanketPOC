import { Linking, Platform } from "react-native";

// Default From identity for GateMate owner emails. The mail app uses whichever
// Google/Gmail account is logged in on the phone; we put this address in To so
// a copy lands in that inbox, and the user can add more recipients before send.
export const OWNER_EMAIL = "sanket.dhamke@gmail.com";

export function parseRecipients(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export function uniqueEmails(...lists) {
  const out = [];
  for (const list of lists) {
    for (const e of Array.isArray(list) ? list : parseRecipients(list)) {
      const v = String(e || "").trim().toLowerCase();
      if (v && !out.includes(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) out.push(v);
    }
  }
  return out;
}

// Opens Gmail (web or app) or the device's default mail app with To / subject / body
// filled in. Recipients can still be edited in the compose window before sending.
export async function openEmailCompose({ to, subject, body }) {
  const toList = (Array.isArray(to) ? to : parseRecipients(to)).join(",");
  if (!toList) throw new Error("Add at least one recipient email.");
  const su = encodeURIComponent(subject || "");
  const bd = encodeURIComponent(body || "");
  const toEnc = encodeURIComponent(toList);

  const gmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${toEnc}&su=${su}&body=${bd}`;
  const mailto = `mailto:${toList}?subject=${su}&body=${bd}`;

  // On web, Gmail compose in the browser is the most reliable. On a phone,
  // mailto opens Gmail if it's the default mail app (otherwise the chooser).
  const urls = Platform.OS === "web" ? [gmailWeb, mailto] : [mailto, gmailWeb];

  let lastErr;
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(lastErr?.message || "Could not open Gmail or your email app.");
}
