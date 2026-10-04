// Minimal 8-bit RGBA PNG read/write for the dev tools - no dependencies (Node's zlib only).
//
// The weapon-review artifacts are base64 PNGs, so a tool that has to look inside them (or
// patch one when Pillow is not installed) needs this. `decodePNG` returns {w, h, px} with px
// as a flat RGBA buffer; `encodePNG` writes filter-0 rows, which is what PIL can also read.
const zlib = require('zlib');

// colour types 6 (RGBA) and 2 (RGB, alpha filled in) both come back as 4-channel pixels
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error('png_io: expected 8-bit RGB(A), got depth ' + bd + ' type ' + ct);
  const ch = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ch, stride = w * bpp;
  const src = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = src.slice(y * stride, (y + 1) * stride), prev = y ? src.slice((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
  }
  if (ch === 4) return { w, h, px: src };
  const out = Buffer.alloc(w * h * 4);                       // expand RGB to RGBA
  for (let i = 0; i < w * h; i++) { out[i * 4] = src[i * 3]; out[i * 4 + 1] = src[i * 3 + 1];
    out[i * 4 + 2] = src[i * 3 + 2]; out[i * 4 + 3] = 255; }
  return { w, h, px: out, rgb: true };
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return b => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([head.slice(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePNG(w, h, px, opts) {
  const rgb = !!(opts && opts.rgb), ch = rgb ? 3 : 4, stride = w * ch, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = y * (stride + 1) + 1 + x * ch;
    raw[d] = px[s]; raw[d + 1] = px[s + 1]; raw[d + 2] = px[s + 2];
    if (!rgb) raw[d + 3] = px[s + 3];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = rgb ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// straight-alpha src-over, clipped to a w x h box (what PIL's alpha_composite does per cell)
function overAt(dst, dw, sx, sy, src, sw, dx, dy, clipW, clipH) {
  for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
    const ai = (y * sw + x) * 4, sa = src[ai + 3];
    if (!sa) continue;
    const tx = x + dx, ty = y + dy;
    if (tx < 0 || ty < 0 || tx >= clipW || ty >= clipH) continue;
    const ti = (ty * dw + tx) * 4, oa = dst[ti + 3];
    if (sa === 255 || oa === 0) {
      dst[ti] = src[ai]; dst[ti + 1] = src[ai + 1]; dst[ti + 2] = src[ai + 2]; dst[ti + 3] = sa; continue;
    }
    const a = sa / 255, na = oa / 255, out = a + na * (1 - a);
    for (let k = 0; k < 3; k++) dst[ti + k] = Math.round((src[ai + k] * a + dst[ti + k] * na * (1 - a)) / out);
    dst[ti + 3] = Math.round(out * 255);
  }
}
const b64 = (buf, mime) => (mime || 'image/png') + ';base64,' + buf.toString('base64');
const un64 = uri => Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');

module.exports = { decodePNG, encodePNG, overAt, b64, un64 };
