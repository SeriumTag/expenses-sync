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

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A scanned QR holds a full join link; a typed value is just the code.
export function extractCode(text) {
  try {
    return new URL(text).searchParams.get('join') || text;
  } catch {
    return text;
  }
}
