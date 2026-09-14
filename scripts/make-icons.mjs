#!/usr/bin/env node
// Generates the PWA icons. Run with `node scripts/make-icons.mjs`.
// Hand-rolled PNG encoding so the repo needs no image dependency for two files.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [7, 8, 10]; // ink-900, matches theme_color
const FG = [232, 200, 138]; // gold-300

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** A pair of crossed blades — legible at 48px, which is where it actually gets seen. */
function pixel(x, y, size) {
  const u = x / size;
  const v = y / size;
  const margin = 0.22;
  if (u < margin || u > 1 - margin || v < margin || v > 1 - margin) return BG;

  const thickness = 0.055;
  const onDown = Math.abs(u - v) < thickness;
  const onUp = Math.abs(u + v - 1) < thickness;
  return onDown || onUp ? FG : BG;
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/pwa-${size}.png`, import.meta.url), png(size));
  console.log(`public/pwa-${size}.png`);
}

// Crown over crossed scissors, matching src/components/Brand.tsx.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="#07080A"/>
  <g fill="none" stroke="#E8C88A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 13.5 L17.5 17 L24 10.5 L30.5 17 L34 13.5 L32.5 21 L15.5 21 Z"/>
    <path d="M17 25.5 L33 40"/>
    <path d="M31 25.5 L15 40"/>
    <circle cx="16.5" cy="28" r="3.1"/>
    <circle cx="31.5" cy="28" r="3.1"/>
  </g>
</svg>
`;
writeFileSync(new URL("../public/favicon.svg", import.meta.url), svg);
console.log("public/favicon.svg");
