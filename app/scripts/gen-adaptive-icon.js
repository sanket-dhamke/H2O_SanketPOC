// Generates a proper Android adaptive icon so the launcher icon matches the
// login-screen logo (full barrier + shield + sparkle mark, centered, uncropped).
//
// Android masks the launcher icon to a circle/squircle and only guarantees the
// center ~66% "safe zone" is visible. So we:
//   1. Extract the white mark from the full artwork (icon.png) by luminance
//      threshold (the coloured gradient drops out, the checkmark/stripes stay as
//      cut-outs so the gradient shows through them).
//   2. Scale that mark into the safe zone on a transparent foreground.
//   3. Paint a full-bleed brand gradient as the background layer.
//
// Run: node scripts/gen-adaptive-icon.js
const path = require("path");
const sharp = require("sharp");

const ASSETS = path.join(__dirname, "..", "assets");
const SIZE = 1024;
// Fraction of the canvas the mark occupies (safe zone ≈ 66%). 0.62 keeps a
// little breathing room so nothing is ever cropped on round launchers.
const MARK_SCALE = 0.62;

async function main() {
  const src = path.join(ASSETS, "icon.png");

  // 1) Build an alpha mask of the white mark (white content -> opaque).
  const base = sharp(src).resize(SIZE, SIZE, { fit: "cover" });
  const alpha = await base
    .clone()
    .grayscale()
    .threshold(200) // white artwork -> 255, gradient -> 0
    .raw()
    .toBuffer(); // single channel, SIZE*SIZE bytes

  // White RGB canvas + the mask as its alpha channel = clean white silhouette.
  // The source is a rounded-square whose 4 white corners also survive the
  // threshold; clip the silhouette with an inscribed circle so only the central
  // mark (barrier + shield + sparkle) remains — all corner artefacts vanish and
  // no real content is lost (it all sits well inside the circle).
  const circleClip = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
       <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/>
     </svg>`
  );
  const silhouetteRaw = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .png()
    .toBuffer();
  const whiteSilhouette = await sharp(silhouetteRaw)
    .composite([{ input: circleClip, blend: "dest-in" }])
    .png()
    .toBuffer();

  // 2) Scale the mark into the safe zone, centred on a transparent canvas.
  const markSize = Math.round(SIZE * MARK_SCALE);
  const scaledMark = await sharp(whiteSilhouette)
    .resize(markSize, markSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const foreground = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaledMark, gravity: "centre" }])
    .png()
    .toBuffer();

  await sharp(foreground).toFile(path.join(ASSETS, "adaptive-icon-fg.png"));

  // 3) Full-bleed brand gradient background (navy -> teal, diagonal).
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

  // 4) A masked preview (circle) so we can eyeball the launcher result.
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

  console.log("Wrote adaptive-icon-fg.png, adaptive-icon-bg.png, adaptive-preview-circle.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
