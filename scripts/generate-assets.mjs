// Generates the app icons and iPhone launch screens into public/.
// Run with: npm run assets   (outputs are committed, so Netlify doesn't need to run this)
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = new URL('../public/', import.meta.url);
const out = (name) => fileURLToPath(new URL(name, OUT));
const RED = '#e50914';

// The "ribbon E" mark, drawn in a 1024 grid. The bars cast a shadow onto the
// darker stem, like a folded ribbon.
const MARK_DEFS = `
  <linearGradient id="stem" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9e0710"/>
    <stop offset="1" stop-color="#6d040a"/>
  </linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff2a36"/>
    <stop offset="1" stop-color="${RED}"/>
  </linearGradient>
  <filter id="fold" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="-16" dy="6" stdDeviation="14" flood-color="#000" flood-opacity="0.6"/>
  </filter>`;

const MARK = `
  <path d="M318 236 H462 V788 H318 Z" fill="url(#stem)"/>
  <g filter="url(#fold)">
    <path d="M404 236 H736 L694 374 H404 Z" fill="url(#bar)"/>
    <path d="M404 443 H652 L612 581 H404 Z" fill="url(#bar)"/>
    <path d="M404 650 H736 L694 788 H404 Z" fill="url(#bar)"/>
  </g>`;

// Crop box around the mark (also used by the in-app splash in index.html).
export const MARK_BOX = { x: 290, y: 220, w: 460, h: 590 };

function iconSvg({ scale = 1, rounded = false } = {}) {
  const c = 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="72%">
      <stop offset="0" stop-color="#3d0609"/>
      <stop offset="0.5" stop-color="#140304"/>
      <stop offset="1" stop-color="#050505"/>
    </radialGradient>
    <filter id="blur" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feGaussianBlur stdDeviation="40"/></filter>
    ${MARK_DEFS}
  </defs>
  <rect width="1024" height="1024" rx="${rounded ? 224 : 0}" fill="url(#bg)"/>
  <ellipse cx="512" cy="846" rx="${270 * scale}" ry="${46 * scale}" fill="${RED}" opacity="0.35" filter="url(#blur)"/>
  <g transform="translate(${c} ${c}) scale(${scale}) translate(${-c - 15} ${-c})">${MARK}</g>
</svg>`;
}

function splashSvg(w, h) {
  const markW = w * 0.28;
  const k = markW / MARK_BOX.w;
  const markH = MARK_BOX.h * k;
  const x = w / 2 - markW / 2;
  const y = h * 0.45 - markH / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${w / 2}" cy="${h * 0.45}" r="${w * 0.75}">
      <stop offset="0" stop-color="${RED}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${RED}" stop-opacity="0"/>
    </radialGradient>
    ${MARK_DEFS}
  </defs>
  <rect width="${w}" height="${h}" fill="#000"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <g transform="translate(${x} ${y}) scale(${k}) translate(${-MARK_BOX.x} ${-MARK_BOX.y})">${MARK}</g>
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

await writeFile(new URL('icon.svg', OUT), iconSvg({ rounded: true }));
await png(iconSvg(), 180).toFile(out('apple-touch-icon.png'));
await png(iconSvg(), 192).toFile(out('icon-192.png'));
await png(iconSvg(), 512).toFile(out('icon-512.png'));
await png(iconSvg({ scale: 0.78 }), 512).toFile(out('icon-maskable-512.png'));
await png(iconSvg({ rounded: true }), 32).toFile(out('favicon-32.png'));
await png(iconSvg({ rounded: true }), 1024).toFile(out('icon-preview.png'));

const links = [];
for (const [cw, ch, r] of IPHONES) {
  const w = cw * r;
  const h = ch * r;
  const name = `splash/iphone-${w}x${h}.png`;
  await sharp(Buffer.from(splashSvg(w, h))).png({ compressionLevel: 9 }).toFile(out(name));
  links.push(
    `<link rel="apple-touch-startup-image" media="screen and (device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" href="/${name}" />`,
  );
}

console.log(`Generated icons and ${IPHONES.length} launch screens.\n\nLaunch screen <link> tags:\n`);
console.log(links.join('\n'));
