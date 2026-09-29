// Soft pastel accents (think plush-toy shop: blush, lavender, mint, peach…).
export const THEMES = [
  { name: 'Blush', value: '#f29cb2' },
  { name: 'Lavender', value: '#a99be6' },
  { name: 'Mint', value: '#7fcfb2' },
  { name: 'Peach', value: '#f6b28c' },
  { name: 'Sky', value: '#8ec3ea' },
  { name: 'Honey', value: '#efc16a' },
  { name: 'Rose', value: '#e88fa2' },
  { name: 'Sage', value: '#a6c59c' },
];

export const DEFAULT_THEME = THEMES[0].value;

// Colours chosen before the pastel redesign turn into their soft versions.
const LEGACY = {
  '#e50914': '#f29cb2',
  '#2f80ed': '#8ec3ea',
  '#10b981': '#7fcfb2',
  '#8b5cf6': '#a99be6',
  '#f97316': '#f6b28c',
  '#ec4899': '#e88fa2',
  '#eab308': '#efc16a',
  '#14b8a6': '#86d3cf',
};

export const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
export function normalizeTheme(v) {
  if (!isHex(v)) return DEFAULT_THEME;
  const c = v.toLowerCase();
  return LEGACY[c] || c;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Cocoa text on light (pastel) accents, white on darker custom colours.
export const INK = '#4b3a33';
export const textOn = (hex) => (luminance(normalizeTheme(hex)) > 0.3 ? INK : '#ffffff');

export function applyTheme(hex) {
  const color = normalizeTheme(hex);
  const root = document.documentElement.style;
  root.setProperty('--accent', color);
  root.setProperty('--on-accent', textOn(color));
}

// The partner is shown in their own theme colour, unless it's the same as
// mine; then they get the first palette colour that isn't mine.
export function partnerColor(myTheme, theirTheme) {
  const mine = normalizeTheme(myTheme);
  if (isHex(theirTheme) && normalizeTheme(theirTheme) !== mine) return normalizeTheme(theirTheme);
  return THEMES.find((t) => t.value !== mine).value;
}

// Stable hue per tab so each tab card gets its own pastel.
export function hueFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
