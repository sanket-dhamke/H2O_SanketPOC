import {
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";

// Brand typography. Inter carries the wordmark, headings, and UI text.
// MyGate sets its name in Archivo, NoBrokerHood in Roboto, Razorpay in Inter
// SemiBold. Those are all neo-grotesques at medium or semibold, with tight
// tracking. Poppins ExtraBold with wide letter-spacing reads as a poster, so
// the name and the screen titles use Inter instead.
//
// Why the helpers below instead of just setting `fontFamily`: React Native does
// NOT synthesize weights for a custom font the way a browser does. Setting
// `fontFamily: "Inter_400Regular"` alongside `fontWeight: "800"` renders
// *regular* on Android — the heading silently goes thin. Each weight is a
// separate file, so `head(800)` / `body(700)` return the correct family and drop
// fontWeight entirely.
//
// Usage:  ...head(800)  or  ...body(600)  spread into a style object.

export const FONTS = {
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
};

// 800 is kept for existing call sites, and drawn as Bold. ExtraBold is wider
// and heavier than the wordmarks on MyGate, NoBrokerHood, and Razorpay.
const HEAD = { 600: "Inter_600SemiBold", 700: "Inter_700Bold", 800: "Inter_700Bold" };
const BODY = {
  400: "Inter_400Regular",
  500: "Inter_500Medium",
  600: "Inter_600SemiBold",
  700: "Inter_700Bold",
  800: "Inter_800ExtraBold",
};

const nearest = (map, weight) => {
  const want = Number(weight) || 400;
  const keys = Object.keys(map).map(Number);
  return map[keys.reduce((best, k) => (Math.abs(k - want) < Math.abs(best - want) ? k : best))];
};

// Screen titles.
export function head(weight = 700) {
  return { fontFamily: HEAD[weight] || nearest(HEAD, weight) };
}

// The name beside the shield. Semibold, slightly tight, no shadow.
export function wordmark() {
  return { fontFamily: "Inter_600SemiBold", letterSpacing: -0.5 };
}

// Everything else: labels, body copy, numbers, buttons.
export function body(weight = 400) {
  return { fontFamily: BODY[weight] || nearest(BODY, weight) };
}
