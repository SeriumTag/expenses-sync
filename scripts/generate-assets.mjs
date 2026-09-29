// Generates the app icons and iPhone launch screens into public/.
// Run with: npm run assets   (outputs are committed, so Netlify doesn't need to run this)
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = new URL('../public/', import.meta.url);
const out = (name) => fileURLToPath(new URL(name, OUT));

// The coin-pouch mark (same shapes as src/components/Logo.jsx), in a 100 grid.
const MARK = `
  <path d="M37 18c1-7 6-11 13-8 7-3 12 1 13 8Z" fill="#8fd6bb"/>
  <path d="M20 50c0-15 9-23 22-23h16c13 0 22 8 22 23v14c0 16-11 26-27 26h-6c-16 0-27-10-27-26Z" fill="#f29cb2"/>
  <path d="M33 22.5a5 5 0 0 1 5-5h24a5 5 0 0 1 0 10H38a5 5 0 0 1-5-5Z" fill="#a99be6"/>
  <path d="M28 48c1-6 5-10 11-11" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/>
  <path d="M50 26.2c-.5-.4-4.6-3-4.6-5.8 0-1.5 1.2-2.6 2.5-2.6.9 0 1.6.5 2.1 1.1.5-.6 1.2-1.1 2.1-1.1 1.3 0 2.5 1.1 2.5 2.6 0 2.8-4.1 5.4-4.6 5.8Z" fill="#fff"/><ellipse cx="33.5" cy="66" rx="5" ry="3.2" fill="#e2708f" opacity="0.45"/><ellipse cx="66.5" cy="66" rx="5" ry="3.2" fill="#e2708f" opacity="0.45"/><circle cx="40" cy="58.5" r="3.4" fill="#4b3a33"/><circle cx="60" cy="58.5" r="3.4" fill="#4b3a33"/><circle cx="41.2" cy="57.3" r="1.1" fill="#fff"/><circle cx="61.2" cy="57.3" r="1.1" fill="#fff"/><path d="M45.5 64.5q4.5 4.2 9 0" fill="none" stroke="#4b3a33" stroke-width="2.4" stroke-linecap="round"/>`;

// Crop box around the mark (the in-app splash in index.html uses the same viewBox).
export const MARK_BOX = { x: 12, y: 6, w: 76, h: 88 };

// Soft pastel blobs on cream, sized to a w × h canvas.
const blobs = (w, h, id = 'b') => `
    <radialGradient id="${id}1" gradientUnits="userSpaceOnUse" cx="${w * 0.12}" cy="${h * 0.18}" r="${Math.max(w, h) * 0.45}">
      <stop offset="0" stop-color="#f9cfd9"/><stop offset="1" stop-color="#f9cfd9" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}2" gradientUnits="userSpaceOnUse" cx="${w * 0.92}" cy="${h * 0.28}" r="${Math.max(w, h) * 0.4}">
      <stop offset="0" stop-color="#d9cff8"/><stop offset="1" stop-color="#d9cff8" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}3" gradientUnits="userSpaceOnUse" cx="${w * 0.25}" cy="${h * 1.05}" r="${Math.max(w, h) * 0.5}">
      <stop offset="0" stop-color="#c7ecdc"/><stop offset="1" stop-color="#c7ecdc" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}4" gradientUnits="userSpaceOnUse" cx="${w}" cy="${h * 0.95}" r="${Math.max(w, h) * 0.38}">
      <stop offset="0" stop-color="#fcdcc6"/><stop offset="1" stop-color="#fcdcc6" stop-opacity="0"/></radialGradient>`;
const blobRects = (w, h, id = 'b') =>
  `<rect width="${w}" height="${h}" fill="#fff7f1"/>` +
  [1, 2, 3, 4].map((n) => `<rect width="${w}" height="${h}" fill="url(#${id}${n})"/>`).join('');

function iconSvg({ scale = 1, rounded = false } = {}) {
  const k = 6.6 * scale;
  const cx = 512;
  const cy = 525;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    ${blobs(1024, 1024)}
    <filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feGaussianBlur stdDeviation="22"/></filter>
    <clipPath id="clip"><rect width="1024" height="1024" rx="${rounded ? 224 : 0}"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    ${blobRects(1024, 1024)}
    <circle cx="150" cy="820" r="26" fill="#fff" opacity="0.8"/>
    <circle cx="860" cy="190" r="18" fill="#fff" opacity="0.8"/>
    <circle cx="880" cy="760" r="12" fill="#fff" opacity="0.7"/>
    <ellipse cx="${cx}" cy="${cy + 300 * scale}" rx="${230 * scale}" ry="${40 * scale}" fill="#c98b8b" opacity="0.28" filter="url(#soft)"/>
    <g transform="translate(${cx - 50 * k} ${cy - 50 * k}) scale(${k})">${MARK}</g>
  </g>
</svg>`;
}

function splashSvg(w, h) {
  const markW = w * 0.28;
  const k = markW / MARK_BOX.w;
  const markH = MARK_BOX.h * k;
  const x = w / 2 - markW / 2;
  const y = h * 0.45 - markH / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${blobs(w, h)}</defs>
  ${blobRects(w, h)}
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
