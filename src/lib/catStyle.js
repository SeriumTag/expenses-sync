// A colour and icon for any category or group name, from the design's palette
// (Food & Drink pink, Shopping peach, Transport mint, Fun lavender, Home
// yellow, Health sky). Known words first, otherwise a stable pick by name.

const STYLES = {
  food: { color: '#ff7d9c', bg: 'var(--pink-soft)', icon: '🍓' },
  shopping: { color: '#ff9a5a', bg: 'var(--peach-soft)', icon: '🛍️' },
  transport: { color: '#5fc9a7', bg: 'var(--mint-soft)', icon: '🚌' },
  fun: { color: '#9b8cff', bg: 'var(--lav-soft)', icon: '🎟️' },
  home: { color: '#e9a800', bg: 'var(--butter-soft)', icon: '🏠' },
  health: { color: '#4fb3d9', bg: 'var(--sky-soft)', icon: '💊' },
};
const ORDER = ['food', 'shopping', 'transport', 'fun', 'home', 'health'];

const WORDS = [
  ['food', /food|dining|drink|meal|rice|noodle|lunch|dinner|breakfast|cafe|coffee|tea|snack|hawker|restaurant|groceri|supermarket|fairprice|ntuc|bakery|pastr/],
  ['shopping', /shop|cloth|fashion|uniqlo|mall|personal care|beauty|cosmetic|gift/],
  ['transport', /transport|travel|petrol|fuel|grab|taxi|mrt|bus|train|car|parking|toll|flight|trip|youtrip/],
  ['fun', /entertain|fun|movie|game|nintendo|music|netflix|spotify|apple|hobby|holiday|leisure/],
  ['home', /home|house|rent|utilit|electric|water|gas|internet|phone|bill|giga|mortgage|family|mummy|transfer/],
  ['health', /health|medic|doctor|clinic|pharma|vitamin|insurance|dental|gym|fitness|kids|baby/],
];

export function catStyle(label) {
  const text = String(label || '').toLowerCase();
  for (const [key, re] of WORDS) if (re.test(text)) return { key, ...STYLES[key] };
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const key = ORDER[h % ORDER.length];
  return { key, ...STYLES[key], icon: '🌸' };
}
