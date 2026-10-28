// The design's palette (Cute Expenses App): pink first, then its friends.
export const THEMES = [
  { name: 'Pink', value: '#ff7d9c' },
  { name: 'Peach', value: '#ffad7a' },
  { name: 'Mint', value: '#5fc9a7' },
  { name: 'Lavender', value: '#b8a9ff' },
  { name: 'Sky', value: '#6ec6e8' },
  { name: 'Yellow', value: '#ffc93c' },
  { name: 'Rose', value: '#e85d7e' },
  { name: 'Sage', value: '#8cc98a' },
];

export const DEFAULT_THEME = THEMES[0].value;

// Colours saved before (the first bold set, then the soft pastels) move to
// their place in the new palette, so everyone's choice carries over.
const LEGACY = {
  '#e50914': '#ff7d9c',
  '#2f80ed': '#6ec6e8',
  '#10b981': '#5fc9a7',
  '#8b5cf6': '#b8a9ff',
  '#f97316': '#ffad7a',
  '#ec4899': '#e85d7e',
  '#eab308': '#ffc93c',
  '#14b8a6': '#5fc9a7',
  '#f29cb2': '#ff7d9c',
  '#a99be6': '#b8a9ff',
  '#7fcfb2': '#5fc9a7',
  '#f6b28c': '#ffad7a',
  '#8ec3ea': '#6ec6e8',
  '#efc16a': '#ffc93c',
  '#e88fa2': '#e85d7e',
  '#a6c59c': '#8cc98a',
  '#86d3cf': '#5fc9a7',
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

// White text on the palette's colours (like the design's pink buttons); ink
// only on very light ones such as yellow.
export const INK = '#3b2632';
export const textOn = (hex) => (luminance(normalizeTheme(hex)) > 0.56 ? INK : '#ffffff');

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
