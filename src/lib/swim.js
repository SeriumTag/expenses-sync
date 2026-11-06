// Swim teaching at Happy Fish: logged swim days, what each month earns, away
// days and the payslip check. Ported from the Body Log app's Swim tab.
//
// swim = { days: { id: { date, swimMode, amount, p1, p2, p3, trials, reliefHeads, outside, outsideDiscount } },
//          away: { id: { date, reason, blocks: [{ time, level, safety, games, formation, remarks }], noteUpdated } },
//          payslips: { 'YYYY-MM': { text, basis, checkedAt, issues, slipTotal, logTotal } } }

export const RATE_P1 = 45; // in-school private class, 1 student
export const RATE_P2 = 52.5; // 2 students
export const RATE_P3 = 60; // 3 students
export const RATE_TRIAL = 15;
export const RATE_SCHOOL = 8; // per school student
export const RATE_OUTSIDE = 58; // private lesson taught outside school
export const RATE_RELIEF = 10; // relief day, per head
export const FLAT_DEFAULT = 40; // flat-rate day

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
// Where the school students are, by the weekday a swim day falls on.
export const LOCATION_BY_DAY = { mon: 'CC', thu: 'WWW', fri: 'JE', sat: 'JE', sun: 'WWW' };
export const LOCATIONS = ['CC', 'WWW', 'JE'];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => localDate(new Date());
export const dayKeyOf = (ds) => DAY_KEYS[new Date(`${ds}T00:00:00`).getDay()];

const list = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));
export const daysOf = (s) => list(s?.days).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
export const awayOf = (s) => list(s?.away).sort((a, b) => a.date.localeCompare(b.date));

// ── One swim day ──
export const swimModeOf = (it) => it?.swimMode || 'normal';
// What in-school private classes and trials take out of the school total.
export const schoolDeductions = (it) => (it.p1 != null ? it.p1 : it.priv || 0) * RATE_P1 + (it.p2 || 0) * RATE_P2 + (it.p3 || 0) * RATE_P3 + (it.trials || 0) * RATE_TRIAL;
// School students, worked back from the school total (normal days only).
export function schoolStudents(it) {
  if (it.amount == null || swimModeOf(it) !== 'normal') return null;
  const rest = it.amount - schoolDeductions(it);
  return rest <= 0 ? 0 : Math.round(rest / RATE_SCHOOL);
}
// Outside lessons after their discount, never below zero.
export const outsideLessonAmount = (it) => Math.max(0, (it.outside || 0) * RATE_OUTSIDE - (it.outsideDiscount || 0));
export const swimDayTotal = (it) => (it.amount || 0) + outsideLessonAmount(it);

// A calendar month (monthIndex 0-based) — what the salary follows.
export function swimTotals(days, year, monthIndex) {
  const prefix = `${year}-${pad(monthIndex + 1)}`;
  let total = 0;
  let students = 0;
  let outside = 0;
  const taught = new Set();
  for (const it of days) {
    if (!it.date.startsWith(prefix)) continue;
    total += swimDayTotal(it);
    outside += it.outside || 0;
    taught.add(it.date);
    const s = schoolStudents(it);
    if (s != null) students += s;
  }
  return { total: Math.round(total * 100) / 100, students, outside, days: taught.size };
}

// The salary for a period key: that month's swim total (a whole year: its months ÷ 12).
export function swimSalaryFor(swim, pk) {
  const days = daysOf(swim);
  if (/^\d{4}$/.test(pk)) {
    let sum = 0;
    for (let m = 0; m < 12; m++) sum += swimTotals(days, Number(pk), m).total;
    return Math.round((sum / 12) * 100) / 100;
  }
  return swimTotals(days, Number(pk.slice(0, 4)), Number(pk.slice(5, 7)) - 1).total;
}

// ── Students by real Monday–Sunday weeks ──
export function mondayOf(d) {
  const dow = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (dow === 0 ? -6 : 1 - dow));
}
// Bars for every week touching the month, with this week's index.
export function weeksOfMonth(days, year, monthIndex) {
  const first = mondayOf(new Date(year, monthIndex, 1));
  const last = new Date(year, monthIndex + 1, 0);
  const n = Math.ceil((Math.round((last - first) / 86400000) + 1) / 7);
  const weeks = Array.from({ length: n }, (_, i) => {
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: localDate(start), end: localDate(end), students: 0 };
  });
  const prefix = `${year}-${pad(monthIndex + 1)}`;
  for (const it of days) {
    if (!it.date.startsWith(prefix)) continue;
    const s = schoolStudents(it);
    if (s == null) continue;
    const i = Math.floor((new Date(`${it.date}T00:00:00`) - first) / 86400000 / 7);
    if (weeks[i]) weeks[i].students += s;
  }
  const current = Math.round((mondayOf(new Date()) - first) / 86400000 / 7);
  return { weeks, current };
}
// School students per location between two dates (inclusive).
export function locationTotals(days, start, end) {
  const totals = { CC: 0, WWW: 0, JE: 0 };
  let count = 0;
  for (const it of days) {
    if (it.date < start || it.date > end) continue;
    count++;
    const s = schoolStudents(it);
    const loc = LOCATION_BY_DAY[dayKeyOf(it.date)];
    if (s != null && loc) totals[loc] += s;
  }
  return { totals, days: count };
}
// Day totals for each date of the month (for the per-day chart).
export function dailyTotals(days, year, monthIndex) {
  const prefix = `${year}-${pad(monthIndex + 1)}`;
  const totals = {};
  for (const it of days) if (it.date.startsWith(prefix)) totals[it.date] = (totals[it.date] || 0) + swimDayTotal(it);
  const n = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => ({ date: ymd(year, monthIndex, i + 1), value: totals[ymd(year, monthIndex, i + 1)] || 0 }));
}

// ── Away days: what the month is still worth when you're not there ──
function averageOf(rows) {
  return rows.length ? { avg: rows.reduce((s, it) => s + swimDayTotal(it), 0) / rows.length, n: rows.length } : { avg: 0, n: 0 };
}
// What a weekday is usually worth: the average of its last 8 swim days.
export const weekdayEarnStats = (days, dayKey) => averageOf(days.filter((it) => dayKeyOf(it.date) === dayKey).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8));
const overallStats = (days) => averageOf([...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12));
// A teaching day: that weekday has been taught before (classes come in part 2).
export const teachesOnDate = (days, ds) => weekdayEarnStats(days, dayKeyOf(ds)).n > 0;
export function estimateForDate(days, ds) {
  const key = dayKeyOf(ds);
  const w = weekdayEarnStats(days, key);
  if (w.n) return { amount: w.avg, basis: `average of your last ${w.n} ${DAY_LABELS[key]}${w.n === 1 ? '' : 's'}` };
  const o = overallStats(days);
  if (o.n) return { amount: o.avg, basis: `average of your last ${o.n} swim days` };
  return { amount: 0, basis: 'no history for that day yet' };
}
// The month so far, plus an estimate for each teaching day to come, minus away days.
export function monthAwayProjection(days, away, year, monthIndex, today = todayStr()) {
  const actual = swimTotals(days, year, monthIndex).total;
  const awaySet = new Set(away.map((a) => a.date));
  let toCome = 0;
  let toComeDays = 0;
  let awayValue = 0;
  let awayCount = 0;
  const n = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= n; d++) {
    const ds = ymd(year, monthIndex, d);
    if (ds <= today || !teachesOnDate(days, ds)) continue;
    const est = estimateForDate(days, ds).amount;
    if (awaySet.has(ds)) {
      awayValue += est;
      awayCount++;
    } else {
      toCome += est;
      toComeDays++;
    }
  }
  return { actual, toCome, toComeDays, awayValue, awayCount, potential: actual + toCome, ifPresent: actual + toCome + awayValue };
}
export function awayDatesBetween(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) return [];
  const out = [];
  const end = to && to >= from ? to : from;
  for (let d = new Date(`${from}T12:00:00`), i = 0; localDate(d) <= end && i < 120; d.setDate(d.getDate() + 1), i++) out.push(localDate(d));
  return out;
}

// ── Relief handover note ──
export const RELIEF_FIELDS = [
  { k: 'time', label: 'Time', kind: 'input', ph: '9:00 AM' },
  { k: 'level', label: 'Level', kind: 'input', ph: 'Toddler Intermediate' },
  { k: 'safety', label: 'Safety Skills', kind: 'text', ph: 'Swim float swim' },
  { k: 'games', label: 'Games', kind: 'text', ph: 'Run and jump from the mat' },
  { k: 'formation', label: 'Usual class formation', kind: 'text', ph: 'Wave (warm up), Circuit (new skills)' },
  { k: 'remarks', label: 'Special remarks', kind: 'text', ph: 'Eden is weaker, get a backfloat for side breathing…' },
];
export const blankBlock = () => Object.fromEntries(RELIEF_FIELDS.map((f) => [f.k, '']));
export const blockFilled = (b) => RELIEF_FIELDS.some((f) => String(b?.[f.k] || '').trim());
// Start a note from what's saved, else the last note for the same weekday (classes repeat weekly).
export function reliefBlocksFor(a, away) {
  if (Array.isArray(a.blocks) && a.blocks.some(blockFilled)) return a.blocks.map((b) => ({ ...blankBlock(), ...b }));
  const key = dayKeyOf(a.date);
  const prev = away.filter((x) => x.date !== a.date && dayKeyOf(x.date) === key && (x.blocks || []).some(blockFilled)).sort((x, y) => y.date.localeCompare(x.date))[0];
  if (prev) return prev.blocks.filter(blockFilled).map((b) => ({ ...blankBlock(), ...b }));
  return [blankBlock()];
}
export function reliefShareText(date, blocks, shortD) {
  const key = dayKeyOf(date);
  const head = `${DAY_LABELS[key]} class progress · ${shortD(date)}`;
  const filled = blocks.filter(blockFilled);
  if (!filled.length) return head;
  return `${head}\n\n${filled
    .map((b) =>
      RELIEF_FIELDS.filter((f) => String(b[f.k] || '').trim())
        .map((f) => `${f.label}: ${String(b[f.k]).trim()}`)
        .join('\n'),
    )
    .join('\n\n──────────\n\n')}`;
}
// The handover as a two-column CSV laid out like the Progression sheet.
export function reliefCsv(date, blocks) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [[`${DAY_LABELS[dayKeyOf(date)]} class progress`, 'Details'], ['', '']];
  blocks.forEach((b, i) => {
    if (i) rows.push(['', '']);
    RELIEF_FIELDS.forEach((f) => rows.push([`${f.label}:`, b[f.k] || '']));
  });
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}

// ── Payslip check ──
// One line: "1 Sep 160.00", "2026-09-01 160", "8/9 152", "Fri 5 Sep $184.50", "5 160".
export function parsePayslipLine(line, year, monthIndex) {
  const raw = String(line).replace(/[,\t]+/g, ' ').trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (/\b(total|subtotal|gross|net|nett|amount)\b/.test(low) && !/\d{1,2}[/ -]/.test(low)) return null;
  const nums = raw.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const amount = parseFloat(nums[nums.length - 1]);
  if (Number.isNaN(amount)) return null;
  let y = year;
  let m = monthIndex;
  let d = null;
  const iso = low.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  const slash = low.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})\b/);
  const named = low.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  const namedFirst = low.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
  else if (named) [d, m] = [Number(named[1]), MONTHS.indexOf(named[2])];
  else if (namedFirst) [m, d] = [MONTHS.indexOf(namedFirst[1]), Number(namedFirst[2])];
  else if (slash) [d, m] = [Number(slash[1]), Number(slash[2]) - 1];
  else {
    const first = parseFloat(nums[0]);
    if (nums.length >= 2 && Number.isInteger(first) && first >= 1 && first <= 31) d = first;
  }
  if (d == null || d < 1 || d > 31) return null;
  if (m < 0 || m > 11) m = monthIndex;
  return { date: ymd(y, m, d), amount };
}

// What a session should pay: private by head count, trials flat, groups per student.
export function payslipExpected(title, students) {
  const t = String(title || '').toLowerCase();
  if (/private/.test(t)) return students >= 3 ? RATE_P3 : students === 2 ? RATE_P2 : RATE_P1;
  if (/trial/.test(t)) return RATE_TRIAL;
  return students * RATE_SCHOOL;
}

// The school's own payslip layout, pasted from its page:
//   Group class (Kid) / West - Jurong East / 5 Sep 2026, 15:00 / 3  24  56 (students, payout, class total)
const SESSION_RE = /^(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2})\s*,?\s*(\d{1,2}:\d{2})\s*(.*)$/i;
const CLASS_RE = /^(group|private|trial)\b.*\bclass\b|^(group|private|trial)\s+class/i;
export function parsePayslipTable(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim());
  const classes = [];
  let cur = null;
  let sessions = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (CLASS_RE.test(line) && !/\d{1,2}:\d{2}/.test(line)) {
      const nxt = lines[i + 1] || '';
      cur = { title: line, loc: nxt && !SESSION_RE.test(nxt) && !/^conducted/i.test(nxt) && !/\d{1,2}:\d{2}/.test(nxt) ? nxt : '', sessions: [], stated: null };
      classes.push(cur);
      continue;
    }
    const m = line.match(SESSION_RE);
    if (!m) continue;
    let rest = m[5].trim();
    if (!/\d/.test(rest)) {
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      if (j < lines.length && /^[\d\s.$]+$/.test(lines[j])) {
        rest = lines[j];
        i = j;
      }
    }
    const nums = (rest.replace(/\$/g, '').match(/\d+(?:\.\d+)?/g) || []).map(parseFloat);
    if (!cur) {
      cur = { title: 'Class', loc: '', sessions: [], stated: null };
      classes.push(cur);
    }
    const students = nums.length ? nums[0] : 0;
    let payout = nums.length >= 2 ? nums[1] : null;
    const computed = payout == null;
    if (computed) payout = payslipExpected(cur.title, students);
    if (nums.length >= 3 && cur.stated == null) cur.stated = nums[2];
    cur.sessions.push({ date: ymd(Number(m[3]), MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)), Number(m[1])), time: m[4], students, payout, computed });
    sessions++;
  }
  if (!sessions) return null;
  const byDate = {};
  const payIssues = [];
  const totalIssues = [];
  let noTotal = 0;
  let computedRows = 0;
  for (const c of classes) {
    c.sum = c.sessions.reduce((t, s) => t + s.payout, 0);
    if (!c.sessions.length) continue;
    for (const s of c.sessions) {
      byDate[s.date] = (byDate[s.date] || 0) + s.payout;
      if (s.computed) {
        computedRows++;
        continue;
      }
      const exp = payslipExpected(c.title, s.students);
      const trialOk = !/private/i.test(c.title) && s.payout === RATE_TRIAL;
      if (Math.abs(s.payout - exp) >= 0.005 && !trialOk) payIssues.push({ cls: c, s, exp });
    }
    if (c.stated == null) noTotal++;
    else if (Math.abs(c.stated - c.sum) >= 0.005) totalIssues.push(c);
  }
  return { byDate, classes: classes.filter((c) => c.sessions.length), sessions, payIssues, totalIssues, noTotal, computedRows };
}

// Compare a payslip with what was logged for the month.
// basis 'school': school totals only; 'all': with outside lessons.
export function checkPayslip(text, days, year, monthIndex, basis) {
  const table = parsePayslipTable(text);
  let slip = table?.byDate;
  if (!slip) {
    slip = {};
    String(text || '')
      .split(/\n+/)
      .forEach((line) => {
        const row = parsePayslipLine(line, year, monthIndex);
        if (row) slip[row.date] = (slip[row.date] || 0) + row.amount; // two lines for one date = one day paid in parts
      });
  }
  const slipDates = Object.keys(slip);
  if (!slipDates.length) return null;
  const prefix = `${year}-${pad(monthIndex + 1)}`;
  const logged = {};
  for (const it of days) if (it.date.startsWith(prefix)) logged[it.date] = (logged[it.date] || 0) + (basis === 'all' ? swimDayTotal(it) : it.amount || 0);
  const dates = [...new Set([...slipDates, ...Object.keys(logged)])].sort();
  const diffs = [];
  const missingInLog = [];
  const missingInSlip = [];
  for (const d of dates) {
    const a = slip[d];
    const b = logged[d];
    if (a != null && b == null) missingInLog.push({ date: d, amount: a });
    else if (a == null && b != null) missingInSlip.push({ date: d, amount: b });
    else if (Math.abs(a - b) >= 0.005) diffs.push({ date: d, slip: a, log: b, gap: b - a });
  }
  const slipTotal = slipDates.reduce((t, d) => t + slip[d], 0);
  const logTotal = Object.values(logged).reduce((t, v) => t + v, 0);
  const audit = table ? table.payIssues.length + table.totalIssues.length : 0;
  return { slipDates, slipTotal, logTotal, diffs, missingInLog, missingInSlip, table, issues: diffs.length + missingInLog.length + missingInSlip.length + audit };
}

// ── Import from a Body Log backup ──
const key = (id) => String(id).replace(/[.#$/[\]]/g, '_');
const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));
export function parseSwimBackup(stores) {
  const out = { days: {}, away: {}, payslips: {} };
  (stores['body-log-grab'] || []).forEach((it) => {
    if (it?.type !== 'swim' || !okDate(it.date)) return;
    out.days[key(it.id ?? `${it.date}-swim`)] = {
      date: it.date,
      swimMode: it.swimMode || 'normal',
      amount: num(it.amount),
      p1: num(it.p1 != null ? it.p1 : it.priv),
      p2: num(it.p2),
      p3: num(it.p3),
      trials: num(it.trials),
      reliefHeads: num(it.reliefHeads),
      outside: num(it.outside),
      outsideDiscount: num(it.outsideDiscount),
    };
  });
  (stores['body-log-away'] || []).forEach((a) => {
    if (!okDate(a?.date)) return;
    const blocks = Array.isArray(a.blocks) ? a.blocks.map((b) => ({ ...blankBlock(), ...b })) : a.note ? [{ ...blankBlock(), remarks: a.note }] : [];
    out.away[key(a.id ?? `away-${a.date}`)] = { date: a.date, reason: a.reason || '', blocks, noteUpdated: a.noteUpdated || null };
  });
  const slips = stores['body-log-payslip'];
  if (slips && typeof slips === 'object' && !Array.isArray(slips)) {
    for (const [month, v] of Object.entries(slips)) if (/^\d{4}-\d{2}$/.test(month) && v?.text) out.payslips[month] = { text: v.text, basis: v.basis || 'school', checkedAt: v.checkedAt || null, issues: num(v.issues), slipTotal: num(v.slipTotal), logTotal: num(v.logTotal) };
  }
  if (!Object.values(out).some((v) => Object.keys(v).length)) throw new Error('No swim data found in that backup.');
  return out;
}
