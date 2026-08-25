// ---------------------------------------------------------------------------
// Brand raster assets: favicons, touch icon, and the Open Graph share card.
//
// Search engines and chat apps (KakaoTalk, Slack, iMessage) all want an opaque
// square/landscape image. The site logo is a transparent PNG, so anything that
// composites it on a dark ground shows a black box. These outputs bake the mark
// onto plain white once, here, rather than hoping each consumer gets it right.
//
// Run: node scripts/generate-brand-assets.mjs
// Source of truth: marketing/public/logo.png (the navy mark, transparent).
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'marketing/public/logo.png');
const OUT_DIR = resolve(root, 'marketing/public');

/* ---------- decode -------------------------------------------------------- */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8;
  let width = 0, height = 0, depth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (colorType !== 6 && colorType !== 2) throw new Error(`unsupported colour type ${colorType}`);
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src]; src += 1;
    const line = raw.subarray(src, src + stride); src += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prior = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= channels ? prior[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  // Normalise to RGBA.
  if (channels === 4) return { width, height, data: out };
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0, j = 0; i < width * height; i += 1, j += 3) {
    rgba[i * 4] = out[j]; rgba[i * 4 + 1] = out[j + 1]; rgba[i * 4 + 2] = out[j + 2];
  }
  return { width, height, data: rgba };
}

/* ---------- encode -------------------------------------------------------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i += 1) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

// Opaque RGB output: transparency is exactly what breaks these previews.
function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- compose ------------------------------------------------------- */
const src = decodePng(readFileSync(SOURCE));

// Trim the transparent margin so the mark fills the padding box predictably.
function bounds({ width, height, data }) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 } : { x0, y0, x1, y1 };
}
const box = bounds(src);
const markW = box.x1 - box.x0 + 1;
const markH = box.y1 - box.y0 + 1;

// Area-average downscale, then alpha-composite over white.
function render(canvasW, canvasH, coverage) {
  const scale = Math.min((canvasW * coverage) / markW, (canvasH * coverage) / markH);
  const dw = Math.max(1, Math.round(markW * scale));
  const dh = Math.max(1, Math.round(markH * scale));
  const ox = Math.round((canvasW - dw) / 2);
  const oy = Math.round((canvasH - dh) / 2);
  const out = Buffer.alloc(canvasW * canvasH * 3, 255);

  for (let y = 0; y < dh; y += 1) {
    const sy0 = box.y0 + (y * markH) / dh;
    const sy1 = box.y0 + ((y + 1) * markH) / dh;
    for (let x = 0; x < dw; x += 1) {
      const sx0 = box.x0 + (x * markW) / dw;
      const sx1 = box.x0 + ((x + 1) * markW) / dw;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(sy0); sy < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); sy += 1) {
        for (let sx = Math.floor(sx0); sx < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); sx += 1) {
          const i = (Math.min(sy, src.height - 1) * src.width + Math.min(sx, src.width - 1)) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al;
          n += 1;
        }
      }
      const alpha = a / n;
      if (alpha <= 0) continue;
      const px = ((oy + y) * canvasW + ox + x) * 3;
      out[px] = Math.round(r / n + 255 * (1 - alpha));
      out[px + 1] = Math.round(g / n + 255 * (1 - alpha));
      out[px + 2] = Math.round(b / n + 255 * (1 - alpha));
    }
  }
  return encodePng(canvasW, canvasH, out);
}

// Google's crawler probes /favicon.ico directly, so ship one. An .ico may wrap
// a PNG payload whole, which saves writing a second encoder.
function icoFromPng(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);        // reserved
  header.writeUInt16LE(1, 2);        // type: icon
  header.writeUInt16LE(1, 4);        // one image
  header[6] = size >= 256 ? 0 : size; // width
  header[7] = size >= 256 ? 0 : size; // height
  header.writeUInt16LE(1, 10);       // colour planes
  header.writeUInt16LE(32, 12);      // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);      // payload offset
  return Buffer.concat([header, png]);
}

const targets = [
  ['favicon.png', 64, 64, 0.84],
  ['icon-192.png', 192, 192, 0.82],
  ['icon-512.png', 512, 512, 0.82],
  // Maskable: Android/Chrome crop this to a circle or squircle, so the mark has
  // to sit inside the inner 80% safe zone rather than fill the canvas.
  ['icon-maskable-512.png', 512, 512, 0.58],
  ['apple-touch-icon.png', 180, 180, 0.72],
  ['og-image.png', 1200, 630, 0.52],
];
for (const [name, w, h, coverage] of targets) {
  const png = render(w, h, coverage);
  writeFileSync(resolve(OUT_DIR, name), png);
  console.log(`wrote ${name} ${w}x${h}`);
  if (name === 'favicon.png') {
    writeFileSync(resolve(OUT_DIR, 'favicon.ico'), icoFromPng(png, w));
    console.log(`wrote favicon.ico ${w}x${w}`);
  }
}
