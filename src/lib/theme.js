export const THEMES = [
  { name: 'Cinema Red', value: '#e50914' },
  { name: 'Ocean', value: '#2f80ed' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Sunset', value: '#f97316' },
  { name: 'Rose', value: '#ec4899' },
  { name: 'Gold', value: '#eab308' },
  { name: 'Teal', value: '#14b8a6' },
];

export const DEFAULT_THEME = THEMES[0].value;

export const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
export const normalizeTheme = (v) => (isHex(v) ? v.toLowerCase() : DEFAULT_THEME);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Black text on light accents (gold, etc.), white on everything else.
export const textOn = (hex) => (luminance(normalizeTheme(hex)) > 0.4 ? '#000000' : '#ffffff');

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
  if (isHex(theirTheme) && theirTheme.toLowerCase() !== mine) return theirTheme.toLowerCase();
  return THEMES.find((t) => t.value !== mine).value;
}

// Stable hue per tab so each tab card gets its own gradient.
export function hueFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
