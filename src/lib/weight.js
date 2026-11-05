// Weight log: scale readings (weight, BMI, body age, body fat, muscle,
// visceral fat). Ported from the Body Log app's Weight log tab.
//
// weight = { readings: { id: { date, weight?, bmi?, bodyAge?, fat?, muscle?, visceral? } } }

export const FIELDS = ['weight', 'bmi', 'bodyAge', 'fat', 'muscle', 'visceral'];

export const METRICS = [
  { key: 'weight', label: 'Weight', color: 'var(--lav)', dec: 1, suffix: ' kg' },
  { key: 'bodyAge', label: 'Body age', color: 'var(--coral)', dec: 0, suffix: '' },
  { key: 'fat', label: 'Body fat', color: 'var(--peach)', dec: 1, suffix: '%' },
  { key: 'muscle', label: 'Muscle mass', color: 'var(--mint)', dec: 1, suffix: '%' },
  { key: 'visceral', label: 'Visceral fat', color: 'var(--pink)', dec: 1, suffix: '' },
];

export const fmt = (v, dec) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(dec));

// Oldest first; readings on the same day keep the order they were added.
export const readingsOf = (w) =>
  Object.entries(w?.readings || {})
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));

export function bmiCategory(bmi) {
  if (bmi == null || Number.isNaN(bmi)) return { text: '', high: false };
  if (bmi < 18.5) return { text: 'Underweight', high: false };
  if (bmi < 25) return { text: 'Normal', high: false };
  if (bmi < 30) return { text: 'Overweight', high: true };
  return { text: 'Obese', high: true };
}

// The latest reading, and how its weight compares with the last earlier
// reading that has a weight ("+0.4 kg vs 3 days ago").
export function latestWithDelta(readings) {
  if (!readings.length) return null;
  const latest = readings[readings.length - 1];
  let prev = null;
  for (let i = readings.length - 2; i >= 0; i--) {
    if (readings[i].weight != null) {
      prev = readings[i];
      break;
    }
  }
  let delta = null;
  if (prev && latest.weight != null) {
    const diff = Math.round((latest.weight - prev.weight) * 100) / 100;
    const days = Math.round((new Date(`${latest.date}T00:00:00Z`) - new Date(`${prev.date}T00:00:00Z`)) / 86400000);
    delta = { diff, label: days <= 0 ? 'vs earlier today' : days === 1 ? 'vs yesterday' : `vs ${days} days ago` };
  }
  return { latest, delta };
}

// The most recent weight logged (for the Home icon).
export function latestWeight(w) {
  const rs = readingsOf(w).filter((r) => r.weight != null);
  return rs.length ? rs[rs.length - 1].weight : null;
}

// "weight 72.4 fat 21.3 muscle 34" → { weight: '72.4', fat: '21.3', muscle: '34' }
export function parsePasted(text) {
  const t = String(text || '').toLowerCase();
  const find = (keys) => {
    for (const k of keys) {
      const m = t.match(new RegExp(`${k}\\s*:?\\s*(-?\\d+\\.?\\d*)`));
      if (m) return m[1];
    }
    return null;
  };
  const out = {
    weight: find(['weight', 'wt', 'kg']),
    bmi: find(['bmi']),
    bodyAge: find(['body age', 'bodyage', 'age']),
    fat: find(['body fat', 'bodyfat', 'fat']),
    muscle: find(['muscle mass', 'musclemass', 'muscle']),
    visceral: find(['visceral fat', 'visceralfat', 'visceral', 'vf']),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null));
}

// ── Reading numbers off scale photos ──
// Plausible ranges, to sanity-check and to restore a decimal point OCR dropped.
const RANGES = {
  weight: { min: 25, max: 250 },
  bmi: { min: 10, max: 60 },
  fat: { min: 3, max: 65 },
  muscle: { min: 10, max: 60 },
  visceral: { min: 1, max: 40 },
  bodyAge: { min: 10, max: 99 },
};
export function fixValue(metric, raw) {
  if (raw == null) return null;
  const r = RANGES[metric];
  if (!r) return raw;
  let v = raw;
  for (let i = 0; v > r.max && i < 3; i++) v /= 10; // 798 → 79.8, 145 → 14.5
  if (v < r.min || v > r.max) return raw;
  return Math.round(v * 10) / 10;
}

const KEYWORDS = [
  { key: 'visceral', test: (t) => t.includes('VISCERAL') },
  { key: 'bodyAge', test: (t) => t.includes('BODY AGE') || t.includes('BODYAGE') },
  { key: 'bmi', test: (t) => /\bBMI\b/.test(t) },
  { key: 'muscle', test: (t) => t.includes('SKELETAL') || t.includes('MUSCLE') },
  { key: 'fat', test: (t) => t.includes('FAT') },
  { key: 'weight', test: (t) => t.includes('WEIGHT') },
];

// From OCR words (with bounding boxes): the big number in the upper half is
// the value; the label is read only from the top band (the bottom of the
// scale's screen always shows other stats' names).
export function guessFromOcr(words) {
  const ws = (words || []).filter((w) => w.text && w.text.trim());
  if (!ws.length) return { metric: null, value: null };
  const yMin = Math.min(...ws.map((w) => w.bbox.y0));
  const span = Math.max(...ws.map((w) => w.bbox.y1)) - yMin || 1;
  const rel = (w) => (w.bbox.y0 - yMin) / span;
  const heights = ws.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 1;
  const numbers = ws
    .filter((w) => /^\d{1,3}([.,]\d)?$/.test(w.text.trim()))
    .map((w) => ({ raw: parseFloat(w.text.trim().replace(',', '.')), h: w.bbox.y1 - w.bbox.y0, rel: rel(w) }))
    .filter((n) => !Number.isNaN(n.raw));
  const big = numbers.filter((n) => n.h > medianH * 1.6 && n.rel < 0.55);
  const pool = (big.length ? big : numbers.filter((n) => n.rel < 0.55)).sort((a, b) => b.h - a.h);
  const rawValue = pool.length ? pool[0].raw : null;
  const header = ws
    .filter((w) => rel(w) < 0.3)
    .map((w) => w.text.trim())
    .join(' ')
    .toUpperCase();
  let metric = KEYWORDS.find((k) => k.test(header))?.key || null;
  if (!metric && ws.some((w) => rel(w) < 0.55 && /^KG$/i.test(w.text.trim()))) metric = 'weight';
  return { metric, value: fixValue(metric, rawValue) };
}

// Readings from a Body Log backup's 'body-log-readings'.
export function parseBackupReadings(stores) {
  const raw = stores?.['body-log-readings'];
  if (!Array.isArray(raw)) throw new Error('No weight readings found in that backup.');
  const out = {};
  for (const r of raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r?.date || '')) continue;
    const clean = { date: r.date };
    let any = false;
    for (const f of FIELDS) {
      const v = r[f] == null || r[f] === '' ? null : Number(r[f]);
      if (v != null && !Number.isNaN(v)) {
        clean[f] = v;
        any = true;
      }
    }
    if (any) out[String(r.id ?? `${r.date}-${Object.keys(out).length}`).replace(/[.#$/[\]]/g, '_')] = clean;
  }
  return out;
}
