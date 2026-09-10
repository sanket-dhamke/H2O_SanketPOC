const appJson = require("./app.json");
const pack = require("./src/lib/brandPack.json");

const p = pack.profiles[pack.active] || pack.profiles.gatemate;

function branded(value) {
  if (typeof value === "string") return value.replace(/GateMate/g, p.name);
  if (Array.isArray(value)) return value.map(branded);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = branded(v);
    return out;
  }
  return value;
}

module.exports = {
  expo: {
    ...appJson.expo,
    name: p.name,
    icon: p.icon,
    extra: {
      ...appJson.expo.extra,
      // Preview/production APKs set this in eas.json so the phone talks to the
      // hosted API. Local `expo start` keeps app.json's localhost default.
      apiUrl: process.env.EXPO_PUBLIC_API_URL || appJson.expo.extra.apiUrl,
    },
    android: {
      ...appJson.expo.android,
      adaptiveIcon: {
        ...appJson.expo.android.adaptiveIcon,
        foregroundImage: p.adaptiveFg,
        backgroundImage: p.adaptiveBg,
      },
    },
    web: {
      ...appJson.expo.web,
      favicon: p.favicon,
    },
    plugins: branded(appJson.expo.plugins),
  },
};
