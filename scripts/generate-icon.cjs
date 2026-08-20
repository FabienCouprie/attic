const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="azure" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00C6FF"/>
      <stop offset="100%" stop-color="#0072FF"/>
    </linearGradient>
    <linearGradient id="orange" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFA94D"/>
      <stop offset="100%" stop-color="#FF7A00"/>
    </linearGradient>
  </defs>
  <!-- anneau bleu azur -->
  <circle cx="128" cy="128" r="120" fill="url(#azure)"/>
  <!-- rond orange -->
  <circle cx="128" cy="128" r="96" fill="url(#orange)"/>
  <!-- reflet subtil pour le relief -->
  <ellipse cx="128" cy="104" rx="72" ry="56" fill="white" opacity="0.12"/>
</svg>`;

const svgBuffer = Buffer.from(svg, 'utf-8');

const sizes = [16, 32, 48, 64, 128, 256];

async function generatePng(size) {
  return sharp(svgBuffer, { density: 144 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function buildIco(pngs, outPath) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entrySize = 16;
  const dirSize = 6 + count * entrySize;
  const dataBuffers = [];
  let offset = dirSize;
  const entries = Buffer.alloc(count * entrySize);

  for (let i = 0; i < count; i++) {
    const png = pngs[i];
    const size = sizes[i];
    entries[i * entrySize + 0] = size === 256 ? 0 : size;
    entries[i * entrySize + 1] = size === 256 ? 0 : size;
    entries[i * entrySize + 2] = 0; // colors
    entries[i * entrySize + 3] = 0; // reserved
    entries.writeUInt16LE(1, i * entrySize + 4); // color planes
    entries.writeUInt16LE(32, i * entrySize + 6); // bit depth
    entries.writeUInt32LE(png.length, i * entrySize + 8); // size
    entries.writeUInt32LE(offset, i * entrySize + 12); // offset
    dataBuffers.push(png);
    offset += png.length;
  }

  fs.writeFileSync(outPath, Buffer.concat([header, entries, ...dataBuffers]));
}

(async () => {
  const pngs = await Promise.all(sizes.map(generatePng));
  const icoPath = path.resolve('public/icon.ico');
  const pngPath = path.resolve('public/icon.png');
  await buildIco(pngs, icoPath);
  await sharp(svgBuffer, { density: 144 }).resize(256, 256).png().toFile(pngPath);
  console.log('Generated:', icoPath, pngPath);
})();
