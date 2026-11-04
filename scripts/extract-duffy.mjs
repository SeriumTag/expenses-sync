// Cuts the Duffy bear (and a small banner) out of the "Family Expenses" design file.
// Run with: node scripts/extract-duffy.mjs "<path to family-expenses-offline.html>"
// Outputs public/duffy.webp (512 px, soft cream edge) and public/banner.webp.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) throw new Error('Pass the path to family-expenses-offline.html');
const html = await readFile(src, 'utf8');
const b64 = html.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/)?.[1];
if (!b64) throw new Error('No banner image found in that file');
const banner = Buffer.from(b64, 'base64');
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

// The bear sits in the middle of the 2736 × 912 banner.
const BOX = { left: 1123, top: 225, width: 500, height: 500 };
const SIZE = 512;
const CREAM = '#fdf6ec';

// A soft bear-shaped mask (head, ears, body), so the neighbouring plushies disappear.
const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter></defs>
  <g fill="#fff" filter="url(#soft)">
    <circle cx="256" cy="192" r="160"/>
    <circle cx="122" cy="98" r="56"/><circle cx="390" cy="98" r="56"/>
    <ellipse cx="256" cy="420" rx="188" ry="150"/>
  </g></svg>`);

const bear = await sharp(banner).extract(BOX).resize(SIZE, SIZE).ensureAlpha().composite([{ input: fade, blend: 'dest-in' }]).png().toBuffer();
await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: CREAM } })
  .composite([{ input: bear }])
  .webp({ quality: 86 })
  .toFile(out('duffy.webp'));

await sharp(banner).resize(1400).webp({ quality: 78 }).toFile(out('banner.webp'));
console.log('wrote public/duffy.webp and public/banner.webp');
