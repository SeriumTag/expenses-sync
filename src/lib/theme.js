// The "Family Expenses" palette: Duffy's honey-brown first, then his friends.
export const THEMES = [
  { name: 'Honey', value: '#96622c' },
  { name: 'Rose', value: '#e08ca4' },
  { name: 'Mint', value: '#84bda1' },
  { name: 'Lavender', value: '#ac9ed8' },
  { name: 'Butter', value: '#e7bd55' },
  { name: 'Seafoam', value: '#84c4b5' },
  { name: 'Fox', value: '#df9c83' },
  { name: 'Sky', value: '#93bede' },
];

export const DEFAULT_THEME = THEMES[0].value;

// Colours saved before (the bold set, the soft pastels, then the pink "Cute
// Expenses" set) move to their place in this palette, so choices carry over.
// The old default pink becomes Honey, the new default.
const LEGACY = {
  // Cute Expenses set
  '#ff7d9c': '#96622c',
  '#ffad7a': '#df9c83',
  '#5fc9a7': '#84bda1',
  '#b8a9ff': '#ac9ed8',
  '#6ec6e8': '#93bede',
  '#ffc93c': '#e7bd55',
  '#e85d7e': '#e08ca4',
  '#8cc98a': '#84c4b5',
  // earlier sets
  '#e50914': '#96622c',
  '#2f80ed': '#93bede',
  '#10b981': '#84bda1',
  '#8b5cf6': '#ac9ed8',
  '#f97316': '#df9c83',
  '#ec4899': '#e08ca4',
  '#eab308': '#e7bd55',
  '#14b8a6': '#84c4b5',
  '#f29cb2': '#96622c',
  '#a99be6': '#ac9ed8',
  '#7fcfb2': '#84bda1',
  '#f6b28c': '#df9c83',
  '#8ec3ea': '#93bede',
  '#efc16a': '#e7bd55',
  '#e88fa2': '#e08ca4',
  '#a6c59c': '#84c4b5',
  '#86d3cf': '#84c4b5',
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

// White text on the darker colours (like the design's honey buttons); cocoa
// ink on the light pastels.
export const INK = '#4a382c';
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
