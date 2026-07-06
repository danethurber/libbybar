// Generates the app's icons (a headphones glyph):
//   assets/trayTemplate.png     16x16     menu bar (template: black + alpha,
//   assets/trayTemplate@2x.png  32x32     recolored by macOS for light/dark)
//   assets/appIcon.png          1024x1024 app icon (electron-builder converts
//                                         it to .icns at package time)
//
// Dependency-free (hand-rolled PNG encoder over node:zlib) so the repo needs
// no image tooling. Run: node assets/gen-tray-icon.ts
//
// CommonJS on purpose: executed directly by Node's type-stripping (this file
// is outside the tsc rootDir), and the package is not type:module.

const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

// --- minimal PNG encoder -----------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

type Rgba = [number, number, number, number];

/** RGBA PNG from a per-pixel color function. */
function encodePng(size: number, pixelAt: (x: number, y: number) => Rgba): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // compression 0, filter 0, interlace 0

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const at = row + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- headphones glyph --------------------------------------------------------
// Defined in a 16-unit coordinate space; @2x just samples it more finely.

function roundedRectHit(
  u: number,
  v: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
): boolean {
  const dx = Math.max(Math.abs(u - cx) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(v - cy) - (h / 2 - r), 0);
  return Math.hypot(dx, dy) <= r;
}

function glyphHit(u: number, v: number): boolean {
  // Headband: upper half of a ring centered (8, 8.5).
  const ringDist = Math.hypot(u - 8, v - 8.5);
  if (v <= 8.5 && ringDist >= 4.9 && ringDist <= 6.6) return true;
  // Ear cups.
  return (
    roundedRectHit(u, v, 3.05, 10.7, 3.1, 5.4, 1.5) ||
    roundedRectHit(u, v, 12.95, 10.7, 3.1, 5.4, 1.5)
  );
}

const SUB = 4; // 4x4 supersampling for smooth edges

/** Coverage (0..1) of a hit test, supersampled within pixel (x, y). */
function coverage(x: number, y: number, hit: (px: number, py: number) => boolean): number {
  let hits = 0;
  for (let sy = 0; sy < SUB; sy++) {
    for (let sx = 0; sx < SUB; sx++) {
      if (hit(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB)) hits++;
    }
  }
  return hits / (SUB * SUB);
}

/** Tray template: black glyph + alpha. */
function trayPixel(size: number): (x: number, y: number) => Rgba {
  const scale = 16 / size;
  return (x, y) => [0, 0, 0, Math.round(coverage(x, y, (px, py) => glyphHit(px * scale, py * scale)) * 255)];
}

/** App icon: white glyph on a purple rounded square (macOS-style margins). */
function appIconPixel(size: number): (x: number, y: number) => Rgba {
  const bg: Rgba = [122, 61, 184, 255]; // #7a3db8
  // macOS icon grid: content square is ~80% of the canvas, corner radius ~22.5%.
  const content = size * 0.8;
  const radius = content * 0.225;
  // Glyph occupies the central 60% of the canvas, mapped to its 16-unit space.
  const glyphScale = 16 / (size * 0.6);
  const glyphOffset = size * 0.2;
  return (x, y) => {
    const bgCov = coverage(x, y, (px, py) =>
      roundedRectHit(px, py, size / 2, size / 2, content, content, radius),
    );
    if (bgCov === 0) return [0, 0, 0, 0];
    const g = coverage(x, y, (px, py) =>
      glyphHit((px - glyphOffset) * glyphScale, (py - glyphOffset) * glyphScale),
    );
    const mix = (c: number) => Math.round(c + (255 - c) * g);
    return [mix(bg[0]), mix(bg[1]), mix(bg[2]), Math.round(bgCov * 255)];
  };
}

for (const [size, name, pixel] of [
  [16, 'trayTemplate.png', trayPixel(16)],
  [32, 'trayTemplate@2x.png', trayPixel(32)],
  [1024, 'appIcon.png', appIconPixel(1024)],
] as [number, string, (x: number, y: number) => Rgba][]) {
  const file = path.join(__dirname, name);
  fs.writeFileSync(file, encodePng(size, pixel));
  console.log(`wrote ${file}`);
}
