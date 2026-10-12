// Copies the existing GATEZO Android adaptive layers from brand/gatezo.
// Does not invent or regenerate artwork.
//
// Run: node scripts/gen-adaptive-icon.js
const path = require("path");
const fs = require("fs");

const ASSETS = path.join(__dirname, "..", "assets");
const BRAND = path.join(ASSETS, "brand", "gatezo");

fs.copyFileSync(path.join(BRAND, "adaptive-icon-fg.png"), path.join(ASSETS, "adaptive-icon-fg.png"));
fs.copyFileSync(path.join(BRAND, "adaptive-icon-bg.png"), path.join(ASSETS, "adaptive-icon-bg.png"));
fs.copyFileSync(path.join(BRAND, "icon.png"), path.join(ASSETS, "adaptive-icon.png"));
console.log("Copied GATEZO adaptive icon layers from brand/gatezo.");
