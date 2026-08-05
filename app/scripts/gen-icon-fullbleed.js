// Rebuilds icon.png / splash.png / favicon.png as a CLEAN full-bleed icon:
//   * a diagonal gradient colour-matched to the original artwork (navy -> teal),
//   * the white mark (barrier + shield + sparkle) extracted from the original by
//     luminance threshold and clipped to an inscribed circle (drops the white
//     corners + soft edge halo), composited at its ORIGINAL size/position.
// Result: no white corners, no edge halo, and the login logo stays visually the
// same (same mark, same colours; the login screen already clips to a rounded box).
//
// Run: node scripts/gen-icon-fullbleed.js
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ASSETS = path.join(__dirname, "..", "assets");
const SIZE = 1024;
const SRC = path.join(ASSETS, "icon.png");

// Diagonal gradient matched to the sampled original corners.
const GRAD = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
   <defs>
     <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
       <stop offset="0%" stop-color="#032E78"/>
       <stop offset="50%" stop-color="#036CA4"/>
       <stop offset="100%" stop-color="#06B9C1"/>
     </linearGradient>
   </defs>
   <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
 </svg>`;

async function extractMark() {
  const base = sharp(SRC).resize(SIZE, SIZE, { fit: "cover" });
  const alpha = await base.clone().grayscale().threshold(200).raw().toBuffer();
  const silhouetteRaw = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .png()
    .toBuffer();
  // Inscribed circle removes the white corners + edge halo; all logo content is
  // comfortably inside it, so the mark is preserved at its original size.
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
       <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/>
     </svg>`
  );
  return sharp(silhouetteRaw).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer();
}

async function main() {
  const mark = await extractMark();
  const finalIcon = await sharp(Buffer.from(GRAD))
    .composite([{ input: mark }])
    .png()
    .toBuffer();

  for (const name of ["icon.png", "splash.png", "favicon.png"]) {
    fs.writeFileSync(path.join(ASSETS, name), finalIcon);
  }

  // Verifications.
  await sharp(finalIcon).toFile(path.join(ASSETS, "verify-icon-square.png"));
  // Login-style: clip to a rounded box (~24% radius) like the login screen does.
  const loginRadius = Math.round(SIZE * 0.24);
  const loginMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
       <rect width="${SIZE}" height="${SIZE}" rx="${loginRadius}" ry="${loginRadius}" fill="#fff"/>
     </svg>`
  );
  await sharp(finalIcon).composite([{ input: loginMask, blend: "dest-in" }]).png().toFile(path.join(ASSETS, "verify-login.png"));
  // Splash-style: contained on the blue splash background.
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: "#0C4A8C" } })
    .composite([{ input: await sharp(finalIcon).resize(600, 600).toBuffer(), gravity: "centre" }])
    .png()
    .toFile(path.join(ASSETS, "verify-splash.png"));

  console.log("Rebuilt icon.png, splash.png, favicon.png (clean full-bleed).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
