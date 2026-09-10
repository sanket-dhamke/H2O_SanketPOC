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

// Brand typography. Poppins carries the GATEZO wordmark and headings; Inter
// handles UI text — it was drawn for small sizes on screen, which is most of
// this app.
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

const HEAD = { 600: "Poppins_600SemiBold", 700: "Poppins_700Bold", 800: "Poppins_800ExtraBold" };
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

// Headings and the brand wordmark.
export function head(weight = 700) {
  return { fontFamily: HEAD[weight] || nearest(HEAD, weight) };
}

// Everything else: labels, body copy, numbers, buttons.
export function body(weight = 400) {
  return { fontFamily: BODY[weight] || nearest(BODY, weight) };
}
