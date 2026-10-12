// Rebuilds icon.png / splash.png / favicon.png from the GATEZO source mark
// (assets/gatezo-logo.png): a G-shaped gate-zone monogram on the navy→teal gradient.
//
// Run: node scripts/gen-icon-fullbleed.js
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ASSETS = path.join(__dirname, "..", "assets");
const SIZE = 1024;
const SRC = path.join(ASSETS, "gatezo-logo.png");

async function main() {
  const finalIcon = await sharp(SRC).resize(SIZE, SIZE, { fit: "cover" }).png().toBuffer();

  for (const name of ["icon.png", "splash.png", "favicon.png"]) {
    fs.writeFileSync(path.join(ASSETS, name), finalIcon);
  }

  await sharp(finalIcon).toFile(path.join(ASSETS, "verify-icon-square.png"));
  const loginRadius = Math.round(SIZE * 0.24);
  const loginMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
       <rect width="${SIZE}" height="${SIZE}" rx="${loginRadius}" ry="${loginRadius}" fill="#fff"/>
     </svg>`
  );
  await sharp(finalIcon).composite([{ input: loginMask, blend: "dest-in" }]).png().toFile(path.join(ASSETS, "verify-login.png"));
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: "#0C4A8C" } })
    .composite([{ input: await sharp(finalIcon).resize(600, 600).toBuffer(), gravity: "centre" }])
    .png()
    .toFile(path.join(ASSETS, "verify-splash.png"));

  console.log("Rebuilt icon.png, splash.png, favicon.png from GATEZO mark.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
