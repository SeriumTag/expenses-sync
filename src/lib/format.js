export function sumItems(items) {
  return Object.values(items || {}).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

export function formatMoney(n, currency = '$') {
  const rounded = Math.round((Number(n) || 0) * 100) / 100;
  const text = Math.abs(rounded).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${rounded < 0 ? '-' : ''}${currency ?? ''}${text}`;
}

// Returns a number, or undefined while the text isn't a valid amount yet.
export function parseAmount(text) {
  const s = text.replace(/,/g, '').trim();
  if (s === '' || s === '-' || s === '.' || s === '-.') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

// Amounts are stored per month; the view multiplies by this.
export const PERIODS = {
  monthly: { label: 'Monthly', short: '/mo', factor: 1 },
  yearly: { label: 'Yearly', short: '/yr', factor: 12 },
};

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Splits text the way Excel / Google Sheets copy it: tab between cells, newline
// between rows, and cells that contain line breaks wrapped in "…" ("" = a quote).
function parseTSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

const firstLine = (s) => s.split('\n')[0].trim();
const withoutFirstLine = (s) => s.split('\n').slice(1).join('\n').trim();
const TOTAL_RE = /^(sub)?total\b/i;

/**
 * Reads a pasted sheet into sections. Columns: item, amount, category, then any
 * notes. A row with a title but no amount (e.g. "Kelly | Monthly | Category")
 * starts a new section, which becomes its own tab. TOTAL rows are skipped.
 * Long or multi-line "categories" are really notes, so they go to the note.
 */
export function parseSheet(text) {
  const sections = [];
  let current = null;
  let prevName = '';
  const start = (title) => {
    current = { title, rows: [] };
    sections.push(current);
  };

  for (const cols of parseTSV(text)) {
    const [rawName = '', rawAmount = '', rawCat = '', ...rest] = cols.map((c) => c.trim());
    if (!cols.some((c) => c.trim())) continue;
    if (TOTAL_RE.test(rawName)) continue;

    const cleaned = rawAmount.replace(/[^0-9.,-]/g, '');
    const amount = /\d/.test(cleaned) ? parseAmount(cleaned) : undefined;

    if (amount === undefined) {
      if (rawName) {
        start(firstLine(rawName));
        prevName = '';
      }
      continue;
    }
    if (!current) start(null);

    let category = rawCat;
    const notes = rest.filter(Boolean);
    let name = rawName;
    if (!name) {
      // A continuation row (amount but no item name): name it after the
      // item above plus the first line of its details, e.g. "POSB Personal – Arissa".
      const detail = category || notes[0] || '';
      name = detail ? `${prevName} – ${firstLine(detail)}` : `${prevName} (cont.)`;
      if (category) category = withoutFirstLine(category) || firstLine(category);
    }
    if (category && (category.length > 24 || category.includes('\n') || /^[\d.,$\s-]+$/.test(category))) {
      notes.unshift(category);
      category = '';
    }

    current.rows.push({ name: name.replace(/\s*\n\s*/g, ' '), amount, category, note: notes.join('\n') });
    if (rawName) prevName = name;
  }
  return sections.filter((s) => s.rows.length);
}

// Groups items by category (case-insensitive), biggest first.
export function byCategory(items) {
  const groups = new Map();
  for (const item of Object.values(items || {})) {
    const label = (item.category || '').trim() || 'Uncategorised';
    const key = label.toLowerCase();
    const g = groups.get(key) || { label, total: 0, count: 0 };
    g.total += Number(item.amount) || 0;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

// A scanned QR holds a full join link; a typed value is just the code.
export function extractCode(text) {
  try {
    return new URL(text).searchParams.get('join') || text;
  } catch {
    return text;
  }
}
