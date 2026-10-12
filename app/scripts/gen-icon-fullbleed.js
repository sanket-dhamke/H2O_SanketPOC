// Copies the existing GATEZO slash mark (assets/brand/gatezo/) into the live
// Expo icon/splash/favicon slots. Does not invent or regenerate artwork.
//
// Run: node scripts/gen-icon-fullbleed.js
const path = require("path");
const fs = require("fs");

const ASSETS = path.join(__dirname, "..", "assets");
const BRAND = path.join(ASSETS, "brand", "gatezo");

function copy(from, to) {
  fs.copyFileSync(path.join(BRAND, from), path.join(ASSETS, to));
}

copy("icon.png", "icon.png");
copy("splash.png", "splash.png");
copy("favicon.png", "favicon.png");
console.log("Copied GATEZO brand/gatezo mark into live icon, splash, favicon.");
