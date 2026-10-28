// Reading a pasted bank / card statement into transactions.
//
// The copied-from-app format looks like:
//   Mon, 14 Sep 2026            ← a date line: applies to the lines below it
//   003Nu Skin Enterprise S Pl06 ← merchant
//   003NU SKIN ENTERPRISE (S) PL06 ← details (optional, may be several lines)
//   Personal Care               ← the bank's category
//   SGD                         ← currency (optional)
//   -356.70                     ← amount: "-" spent, "+" paid in / refunded
// Simple CSV / tab-separated exports with a header row also work.
//
// Each transaction: { id, date: 'YYYY-MM-DD' | null, merchant, detail, category,
//                     currency, amount (always positive), credit (true for "+") }

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

// "Mon, 14 Sep 2026", "14 Sep 2026", "14 September 2026", "14/09/2026", "2026-09-14".
export function parseStatementDate(text) {
  const t = String(text || '').trim();
  let m = t.match(/^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return null;
}

// "-356.70", "+1,166.62", "−20.00", "SGD -20.00", "20.00". Returns { amount, credit } or null.
function parseAmountLine(text) {
  const m = String(text || '')
    .trim()
    .match(/^(?:[A-Z]{3}\s*)?([+\-−–])?\s*(?:[A-Z]{3}\s*)?\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})$/);
  if (!m) return null;
  return { amount: Number(m[2].replace(/,/g, '')), credit: m[1] === '+' };
}

function fromBlock(lines, date, id, amt) {
  const b = [...lines];
  const currency = b.length > 1 && /^[A-Z]{3}$/.test(b[b.length - 1]) ? b.pop() : '';
  const category = b.length > 1 ? b.pop() : '';
  const merchant = b[0] || category || 'Unknown';
  return { id, date, merchant, detail: b.slice(1).join(' · '), category, currency, amount: amt.amount, credit: amt.credit };
}

function parseBlocks(text) {
  const out = [];
  let date = null;
  let buf = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const d = parseStatementDate(line);
    if (d) {
      date = d;
      buf = [];
      continue;
    }
    const amt = parseAmountLine(line);
    if (amt && buf.length) {
      out.push(fromBlock(buf, date, out.length, amt));
      buf = [];
      continue;
    }
    buf.push(line);
  }
  return out;
}

// ── CSV / TSV with a header row ──────────────────────────────────────
function splitRow(line, sep) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) cells.push(cur.trim()), (cur = '');
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseTable(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const head = splitRow(lines[0], sep).map((h) => h.toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const cDate = col('date');
  const cAmount = col('amount');
  const cDebit = col('debit', 'withdrawal', 'money out');
  const cCredit = col('credit', 'deposit', 'money in');
  if (cDate < 0 || (cAmount < 0 && cDebit < 0)) return null;
  const cDesc = col('description', 'merchant', 'payee', 'details', 'narrative', 'name');
  const cCat = col('category', 'type');
  const out = [];
  for (const line of lines.slice(1)) {
    const c = splitRow(line, sep);
    const num = (i) => (i >= 0 && c[i] ? Number(String(c[i]).replace(/[^\d.\-+]/g, '')) : NaN);
    let amount;
    let credit;
    if (cAmount >= 0 && !Number.isNaN(num(cAmount))) {
      const v = num(cAmount);
      amount = Math.abs(v);
      credit = v > 0 && /^\+/.test(c[cAmount].trim());
      // Exports that list spending as positive numbers: treat unsigned as spent.
      if (!/^[+-]/.test(c[cAmount].trim())) credit = false;
    } else if (!Number.isNaN(num(cDebit)) && num(cDebit) !== 0) {
      amount = Math.abs(num(cDebit));
      credit = false;
    } else if (!Number.isNaN(num(cCredit)) && num(cCredit) !== 0) {
      amount = Math.abs(num(cCredit));
      credit = true;
    } else continue;
    out.push({
      id: out.length,
      date: parseStatementDate(c[cDate]),
      merchant: (cDesc >= 0 && c[cDesc]) || 'Unknown',
      detail: '',
      category: cCat >= 0 ? c[cCat] || '' : '',
      currency: '',
      amount: Math.round(amount * 100) / 100,
      credit,
    });
  }
  return out;
}

export function parseStatement(text) {
  const firstLine = String(text).split(/\r?\n/).find((l) => l.trim()) || '';
  if ((firstLine.includes(',') || firstLine.includes('\t')) && /date/i.test(firstLine)) {
    const table = parseTable(text);
    if (table && table.length) return table;
  }
  return parseBlocks(text);
}
