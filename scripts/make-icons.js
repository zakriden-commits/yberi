#!/usr/bin/env node
/* Generates the app icon set as PNGs — no dependencies, pure Node. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------- minimal PNG encoder ----------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------- tiny raster helpers ----------------
const hex = (s, a = 1) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), a];
const mix = (c1, c2, t) => [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t, c1[3] + (c2[3] - c1[3]) * t];

function over(dst, i, col, alpha) {
  const a = col[3] * alpha;
  if (a <= 0) return;
  const da = dst[i + 3] / 255;
  const outA = a + da * (1 - a);
  if (outA <= 0) { dst[i + 3] = 0; return; }
  for (let k = 0; k < 3; k++) {
    dst[i + k] = Math.round((col[k] * a + dst[i + k] * da * (1 - a)) / outA);
  }
  dst[i + 3] = Math.round(outA * 255);
}

function roundedRectSDF(x, y, w, h, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/* Draw the mark. `art` is the drawing size; returns rgba buffer.
   transparent=true -> no background plate (for adaptive foregrounds). */
function draw(size, opts = {}) {
  const ss = 2;                       // supersampling
  const S = size * ss;
  const buf = Buffer.alloc(S * S * 4, 0);
  const transparent = !!opts.transparent;
  const inset = opts.inset || 1;      // shrink the glyph for adaptive safe-zone

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const px = x / ss, py = y / ss;      // logical pixel centre-ish
      const u = (px + 0.5) / size, v = (py + 0.5) / size;

      // ---- background plate
      if (!transparent) {
        const d = roundedRectSDF(u * size, v * size, size, size, size * 0.235);
        const edge = Math.max(0, Math.min(1, 0.5 - d));       // AA over 1px
        if (edge > 0) {
          const g = mix(hex('#0b0f26'), hex('#1a1246'), Math.min(1, v * 1.15));
          const glow = Math.exp(-Math.pow((u - 0.5) * 2.1, 2) - Math.pow((v - 0.28) * 2.6, 2));
          const base = mix(g, hex('#3a2a7a'), glow * 0.55);
          over(buf, i, [base[0], base[1], base[2], 255], edge);
        }
      }

      // ---- corridor lines
      const lineAlpha = (yy, thick) => Math.max(0, 1 - Math.abs(v - yy) / thick);
      for (const [yy, col] of [[0.205, '#38f7e0'], [0.795, '#8b5cff']]) {
        const la = lineAlpha(yy, 0.0075);
        if (la > 0.02) over(buf, i, hex(col), la * 0.75);
        const lg = lineAlpha(yy, 0.055);
        if (lg > 0.01) over(buf, i, hex(col), lg * lg * 0.28);
      }

      // ---- main orb
      const cx = 0.485, cy = 0.575, R = 0.135 * inset;
      const dx = (u - cx), dy = (v - cy);
      const dist = Math.hypot(dx, dy);
      if (dist < R * 1.65) {
        const glow = Math.max(0, 1 - dist / (R * 1.65));
        over(buf, i, hex('#38f7e0'), Math.pow(glow, 3.2) * 0.26);
      }
      if (dist < R * 1.06) {
        const aa = Math.max(0, Math.min(1, (R * 1.06 - dist) / 0.006));
        const shade = Math.min(1, dist / R);
        const col = mix(hex('#eafffb'), hex('#0fb3a4'), Math.pow(shade, 0.55));
        over(buf, i, col, aa);
        // highlight
        const hd = Math.hypot(u - (cx - 0.045 * inset), v - (cy - 0.05 * inset));
        if (hd < R * 0.34) over(buf, i, [255, 255, 255, 0.95], Math.pow(1 - hd / (R * 0.34), 1.2) * 0.9);
      }

      // ---- magenta pickup
      const ox = 0.745, oy = 0.345, OR = 0.048 * inset;
      const od = Math.hypot(u - ox, v - oy);
      if (od < OR * 2.6) over(buf, i, hex('#ff3d8b'), Math.pow(Math.max(0, 1 - od / (OR * 2.6)), 2.2) * 0.42);
      if (od < OR) {
        const aa = Math.max(0, Math.min(1, (OR - od) / 0.006));
        over(buf, i, mix(hex('#ffd9ea'), hex('#ff2f86'), Math.min(1, od / OR)), aa);
      }

      // ---- motion streaks
      for (let s = 0; s < 3; s++) {
        const sy = 0.50 + s * 0.075;
        const x0 = 0.16 + s * 0.012, x1 = 0.315 - s * 0.028;
        if (v > sy - 0.0045 && v < sy + 0.0045 && u > x0 && u < x1) {
          const fade = Math.min(1, (u - x0) * 16) * Math.min(1, (x1 - u) * 16);
          over(buf, i, hex('#8ce7ff'), 0.5 * fade);
        }
      }
    }
  }

  // downsample
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const j = ((y * ss + sy) * S + (x * ss + sx)) * 4;
          const al = buf[j + 3] / 255;
          r += buf[j] * al; g += buf[j + 1] * al; b += buf[j + 2] * al; a += al;
        }
      }
      const n = ss * ss;
      const o = (y * size + x) * 4;
      if (a <= 0.0001) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

function write(file, size, opts) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(size, size, draw(size, opts)));
  console.log('  ' + file + '  ' + size + 'x' + size + (opts && opts.transparent ? '  (transparent)' : ''));
}

const root = path.join(__dirname, '..');
const wwwIcons = path.join(root, 'www', 'icons');

for (const s of [48, 72, 96, 144, 192, 512]) write(path.join(wwwIcons, `icon-${s}.png`), s);
write(path.join(wwwIcons, 'icon-foreground.png'), 512, { transparent: true, inset: 0.72 });

const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const mipmaps = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
if (fs.existsSync(res)) {
  for (const [dpi, size] of Object.entries(mipmaps)) {
    const dir = path.join(res, `mipmap-${dpi}`);
    write(path.join(dir, 'ic_launcher.png'), size);
    write(path.join(dir, 'ic_launcher_round.png'), size);
    write(path.join(dir, 'ic_launcher_foreground.png'), Math.round(size * 2.25), { transparent: true, inset: 0.78 });
  }
  write(path.join(res, 'drawable', 'splash.png'), 512);
} else {
  console.log('  (android/ not found yet — run `npx cap add android`, then re-run this script)');
}
