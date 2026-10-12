// Generates a proper Android adaptive icon so the launcher icon matches the
// GATEZO login-screen logo (G monogram + inner gate, centered, uncropped).
//
// Android masks the launcher icon to a circle/squircle and only guarantees the
// center ~66% "safe zone" is visible. So we:
//   1. Extract the white mark from gatezo-logo.png / icon.png by luminance
//      threshold (the coloured gradient drops out).
//   2. Scale that mark into the safe zone on a transparent foreground.
//   3. Paint a full-bleed brand gradient as the background layer.
//
// Run: node scripts/gen-adaptive-icon.js
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ASSETS = path.join(__dirname, "..", "assets");
const SIZE = 1024;
const MARK_SCALE = 0.62;

async function main() {
  const src = fs.existsSync(path.join(ASSETS, "gatezo-logo.png"))
    ? path.join(ASSETS, "gatezo-logo.png")
    : path.join(ASSETS, "icon.png");

  const base = sharp(src).resize(SIZE, SIZE, { fit: "cover" });
  const alpha = await base.clone().grayscale().threshold(200).raw().toBuffer();

  const silhouetteRaw = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .png()
    .toBuffer();

  const markSize = Math.round(SIZE * MARK_SCALE);
  const scaledMark = await sharp(silhouetteRaw)
    .resize(markSize, markSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const foreground = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaledMark, gravity: "centre" }])
    .png()
    .toBuffer();

  await sharp(foreground).toFile(path.join(ASSETS, "adaptive-icon-fg.png"));

  const bgSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
       <defs>
         <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
           <stop offset="0%" stop-color="#0C4A8C"/>
           <stop offset="55%" stop-color="#0E7FA8"/>
           <stop offset="100%" stop-color="#15B8A6"/>
         </linearGradient>
       </defs>
       <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
     </svg>`
  );
  await sharp(bgSvg).png().toFile(path.join(ASSETS, "adaptive-icon-bg.png"));

  const circleMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
       <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/>
     </svg>`
  );
  const composed = await sharp(path.join(ASSETS, "adaptive-icon-bg.png"))
    .composite([{ input: foreground }])
    .png()
    .toBuffer();
  await sharp(composed)
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toFile(path.join(ASSETS, "adaptive-preview-circle.png"));

  console.log("Wrote GATEZO adaptive-icon-fg.png, adaptive-icon-bg.png, adaptive-preview-circle.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
