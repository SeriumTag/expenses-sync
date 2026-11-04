// Generates the app icons and iPhone launch screens into public/.
// Run with: npm run assets   (outputs are committed, so Netlify doesn't need to run this)
// Duffy (public/duffy.webp) comes from scripts/extract-duffy.mjs.
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = new URL('../public/', import.meta.url);
const out = (name) => fileURLToPath(new URL(name, OUT));

// Duffy as PNG, so the SVG renderer can embed it.
const DUFFY = (await sharp(await readFile(new URL('duffy.webp', OUT))).png().toBuffer()).toString('base64');
const duffyImage = (x, y, size, clip) =>
  `<image x="${x}" y="${y}" width="${size}" height="${size}"${clip ? ` clip-path="url(#${clip})"` : ''} preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${DUFFY}" xlink:href="data:image/png;base64,${DUFFY}"/>`;

// The design's cream paper with soft honey / rose / mint / lavender spots.
const CREAM = '#fdf6ec';
const TINTS = ['#faeed9', '#fcebf1', '#e7f3ec', '#f0ecfb'];
const SPOTS = [
  [0.12, 0.18, 0.45],
  [0.92, 0.28, 0.4],
  [0.25, 1.05, 0.5],
  [1, 0.95, 0.38],
];
const blobDefs = (w, h) =>
  SPOTS.map(
    ([x, y, r], i) => `<radialGradient id="s${i}" gradientUnits="userSpaceOnUse" cx="${w * x}" cy="${h * y}" r="${Math.max(w, h) * r}">
      <stop offset="0" stop-color="${TINTS[i]}"/><stop offset="1" stop-color="${TINTS[i]}" stop-opacity="0"/></radialGradient>`,
  ).join('');
const blobRects = (w, h) => `<rect width="${w}" height="${h}" fill="${CREAM}"/>` + SPOTS.map((_, i) => `<rect width="${w}" height="${h}" fill="url(#s${i})"/>`).join('');

// App icon: Duffy filling the tile on plain cream, which matches his own background
// (the maskable one leaves room for the phone's mask).
function iconSvg({ scale = 1, rounded = false } = {}) {
  const size = 1024 * scale;
  const off = (1024 - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="clip"><rect width="1024" height="1024" rx="${rounded ? 224 : 0}"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="1024" height="1024" fill="${CREAM}"/>
    ${duffyImage(off, off, size)}
  </g>
</svg>`;
}

// Launch screen: Duffy in a white circle, as the splash in index.html.
function splashSvg(w, h, ratio) {
  const d = Math.min((w / ratio) * 0.4, 170) * ratio; // circle size, as in index.html
  const ring = 6 * ratio;
  const cx = w / 2;
  const cy = h * 0.45;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    ${blobDefs(w, h)}
    <clipPath id="face"><circle cx="${cx}" cy="${cy}" r="${d / 2 - ring}"/></clipPath>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${10 * ratio}" stdDeviation="${12 * ratio}" flood-color="#96622c" flood-opacity="0.2"/></filter>
  </defs>
  ${blobRects(w, h)}
  <circle cx="${cx}" cy="${cy}" r="${d / 2}" fill="#fffcf7" filter="url(#shadow)"/>
  ${duffyImage(cx - d / 2 + ring, cy - d / 2 + ring, d - 2 * ring, 'face')}
</svg>`;
}

// iPhone portrait launch screens: [css width, css height, pixel ratio]
const IPHONES = [
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [430, 932, 3], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [420, 912, 3], // Air
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6s/7/8 Plus
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [390, 844, 3], // 12, 13, 14, 16e
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [375, 667, 2], // SE 2/3, 6s/7/8
];

const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size).png({ compressionLevel: 9 });

await mkdir(new URL('splash/', OUT), { recursive: true });

await png(iconSvg(), 180).toFile(out('apple-touch-icon.png'));
await png(iconSvg(), 192).toFile(out('icon-192.png'));
await png(iconSvg(), 512).toFile(out('icon-512.png'));
await png(iconSvg({ scale: 0.8 }), 512).toFile(out('icon-maskable-512.png'));
await png(iconSvg({ rounded: true }), 32).toFile(out('favicon-32.png'));
await png(iconSvg({ rounded: true }), 1024).toFile(out('icon-preview.png'));

for (const [cw, ch, r] of IPHONES) {
  const w = cw * r;
  const h = ch * r;
  await sharp(Buffer.from(splashSvg(w, h, r))).png({ compressionLevel: 9 }).toFile(out(`splash/iphone-${w}x${h}.png`));
}

console.log(`Generated icons and ${IPHONES.length} launch screens.`);
