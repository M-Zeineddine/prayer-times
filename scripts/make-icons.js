// Generates simple PNG app icons (solid background + crescent moon) with no dependencies.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crcTable = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, r = size / 2;

  // background: deep teal radial-ish gradient
  const top = [14, 90, 94];     // #0e5a5e
  const bottom = [8, 56, 60];   // #08383c

  for (let y = 0; y < size; y++) {
    const t = y / size;
    const bg = [
      Math.round(top[0] + (bottom[0] - top[0]) * t),
      Math.round(top[1] + (bottom[1] - top[1]) * t),
      Math.round(top[2] + (bottom[2] - top[2]) * t),
    ];
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let a = 255;
      if (dist > r) a = 0; // round icon mask (will still show square per manifest 'any', fine)
      buf[i] = bg[0]; buf[i + 1] = bg[1]; buf[i + 2] = bg[2]; buf[i + 3] = a;
    }
  }

  // crescent moon: big circle minus offset smaller circle, gold color
  const gold = [242, 183, 5];
  const moonR = size * 0.30;
  const moonCx = cx, moonCy = cy - size * 0.03;
  const cutR = size * 0.26;
  const cutCx = moonCx + size * 0.14;
  const cutCy = moonCy - size * 0.06;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (buf[i + 3] === 0) continue;
      const d1 = Math.hypot(x - moonCx, y - moonCy);
      const d2 = Math.hypot(x - cutCx, y - cutCy);
      if (d1 <= moonR && d2 > cutR) {
        buf[i] = gold[0]; buf[i + 1] = gold[1]; buf[i + 2] = gold[2]; buf[i + 3] = 255;
      }
    }
  }

  return encodePNG(size, size, buf);
}

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sizes = [180, 192, 512];
for (const s of sizes) {
  fs.writeFileSync(path.join(outDir, `icon-${s}.png`), makeIcon(s));
  console.log('wrote icon-' + s + '.png');
}
