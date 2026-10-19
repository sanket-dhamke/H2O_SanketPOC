import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { compactDataUrl, decodeDataUrl } from "../src/shrink.js";

async function jpegDataUrl(width, height, quality) {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 210, g: 186, b: 150 } },
  })
    .jpeg({ quality })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

test("a large photo is stored as a JPEG under 120 KB and is not enlarged past the long edge", async () => {
  const input = await jpegDataUrl(3200, 2400, 95);
  const inputBytes = decodeDataUrl(input).buffer.length;
  const out = await compactDataUrl(input, "listing");
  const decoded = decodeDataUrl(out);
  assert.equal(decoded.contentType, "image/jpeg");
  assert.ok(decoded.buffer.length < 120 * 1024, `got ${decoded.buffer.length} bytes`);
  assert.ok(decoded.buffer.length < inputBytes);
  const meta = await sharp(decoded.buffer).metadata();
  assert.ok(meta.width <= 1280 && meta.height <= 1280);
});

test("a visitor photo stays under 80 KB", async () => {
  const input = await jpegDataUrl(3000, 3000, 92);
  const out = await compactDataUrl(input, "visitor");
  const decoded = decodeDataUrl(out);
  assert.ok(decoded.buffer.length <= 80 * 1024, `got ${decoded.buffer.length} bytes`);
  const meta = await sharp(decoded.buffer).metadata();
  assert.ok(meta.width <= 960 && meta.height <= 960);
});

test("a small photo is not blown up, and a PDF is left untouched", async () => {
  const small = await jpegDataUrl(80, 60, 60);
  const out = await compactDataUrl(small, "listing");
  const meta = await sharp(decodeDataUrl(out).buffer).metadata();
  assert.ok(meta.width <= 80 && meta.height <= 60);
  const pdf = "data:application/pdf;base64,JVBERi0xLjQK";
  assert.equal(await compactDataUrl(pdf, "document"), pdf);
});
