// Cuts each plush friend out of the "Family Expenses" design banner, for the
// character picker. Run with:
//   node scripts/extract-friends.mjs "<path to family-expenses-offline.html>" [contact-sheet.png]
// Outputs public/friends/<key>.webp (384 px, soft silhouette on cream).
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const [src, sheetPath] = process.argv.slice(2);
if (!src) throw new Error('Pass the path to family-expenses-offline.html');
const html = await readFile(src, 'utf8');
const b64 = html.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/)?.[1];
if (!b64) throw new Error('No banner image found in that file');
const banner = Buffer.from(b64, 'base64');
const out = (name) => fileURLToPath(new URL(`../public/friends/${name}`, import.meta.url));

const SIZE = 384;
const CREAM = '#fdf6ec';

// box: square crop in the 2736 × 912 banner. shapes: the silhouette kept, in a
// 512 grid (circles [cx, cy, r] and ellipses [cx, cy, rx, ry]); the rest fades to cream.
export const FRIENDS = [
  { key: 'duffy', box: [1123, 225, 500], shapes: [[256, 192, 160], [122, 98, 56], [390, 98, 56], [256, 420, 188, 150]] },
  { key: 'shelliemay', box: [800, 290, 470], shapes: [[256, 200, 150], [128, 100, 52], [384, 100, 52], [256, 420, 180, 150]] },
  { key: 'gelatoni', box: [480, 260, 490], shapes: [[256, 205, 150], [160, 90, 60], [356, 90, 60], [256, 420, 175, 150]] },
  { key: 'stellalou', box: [130, 310, 500], shapes: [[256, 200, 140], [130, 250, 66, 120], [378, 240, 60, 110], [250, 420, 165, 140]] },
  { key: 'cookieann', box: [1480, 230, 500], shapes: [[256, 215, 160], [256, 80, 90, 70], [256, 420, 175, 150]] },
  { key: 'linabell', box: [1810, 270, 480], shapes: [[256, 210, 150], [150, 100, 60], [362, 100, 60], [256, 420, 180, 150]] },
  { key: 'olumel', box: [2170, 470, 420], shapes: [[286, 250, 205, 150]] },
];

const maskSvg = (shapes) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter></defs>
  <g fill="#fff" filter="url(#soft)">${shapes
    .map((s) => (s.length === 3 ? `<circle cx="${s[0]}" cy="${s[1]}" r="${s[2]}"/>` : `<ellipse cx="${s[0]}" cy="${s[1]}" rx="${s[2]}" ry="${s[3]}"/>`))
    .join('')}</g></svg>`;

await mkdir(new URL('../public/friends/', import.meta.url), { recursive: true });
const done = [];
for (const f of FRIENDS) {
  const [left, top, side] = f.box;
  const mask = await sharp(Buffer.from(maskSvg(f.shapes))).resize(SIZE, SIZE).png().toBuffer();
  const cut = await sharp(banner).extract({ left, top, width: side, height: Math.min(side, 912 - top) }).resize(SIZE, SIZE, { fit: 'cover', position: 'top' }).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const img = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: CREAM } }).composite([{ input: cut }]).webp({ quality: 84 }).toBuffer();
  await sharp(img).toFile(out(`${f.key}.webp`));
  done.push(img);
}

// Optional contact sheet, to check the crops by eye.
if (sheetPath) {
  const t = 200;
  const tiles = await Promise.all(done.map((b) => sharp(b).resize(t).png().toBuffer()));
  await sharp({ create: { width: t * tiles.length + 10 * (tiles.length + 1), height: t + 20, channels: 3, background: '#777' } })
    .composite(tiles.map((input, i) => ({ input, left: 10 + i * (t + 10), top: 10 })))
    .png()
    .toFile(sheetPath);
}
console.log(`wrote ${FRIENDS.length} friends to public/friends/`);
