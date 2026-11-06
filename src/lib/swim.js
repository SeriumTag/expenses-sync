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
  if (swimModeOf(it) === 'lessons') return lessonList(it).reduce((s, l) => s + (l.kids || 0), 0);
  if (it.amount == null || swimModeOf(it) !== 'normal') return null;
  const rest = it.amount - schoolDeductions(it);
  return rest <= 0 ? 0 : Math.round(rest / RATE_SCHOOL);
}
// Outside lessons after their discount, never below zero.
export const outsideLessonAmount = (it) => Math.max(0, (it.outside || 0) * RATE_OUTSIDE - (it.outsideDiscount || 0));
export const swimDayTotal = (it) => (it.amount || 0) + outsideLessonAmount(it);

// ── A day logged lesson by lesson (pasted from the booking page or keyed in) ──
// Group $8 a child, relief $10 a child, private $45 / $52.50 / $60 for 1 / 2 / 3 students.
export const LESSON_KINDS = { group: 'Group', relief: 'Relief', private: 'Private' };
export const lessonList = (it) => (Array.isArray(it?.lessons) ? it.lessons : Object.values(it?.lessons || {})).filter(Boolean);
export function lessonPay(kind, kids) {
  const n = Math.max(0, Math.round(Number(kids) || 0));
  if (kind === 'private') return n <= 0 ? 0 : n === 1 ? RATE_P1 : n === 2 ? RATE_P2 : n === 3 ? RATE_P3 : RATE_P3 + (n - 3) * RATE_SCHOOL;
  return n * (kind === 'relief' ? RATE_RELIEF : RATE_SCHOOL);
}
export const lessonsTotal = (lessons) => Math.round(lessons.reduce((s, l) => s + lessonPay(l.kind, l.kids), 0) * 100) / 100;
export function lessonsSummary(lessons) {
  return {
    count: lessons.length,
    kids: lessons.reduce((s, l) => s + (l.kids || 0), 0),
    absent: lessons.reduce((s, l) => s + (l.absent || 0), 0),
    relief: lessons.filter((l) => l.kind === 'relief').length,
    priv: lessons.filter((l) => l.kind === 'private').length,
    total: lessonsTotal(lessons),
  };
}
// Where a lesson was taught, from the booking page's place name.
export function locationOfText(s) {
  const t = String(s || '').toLowerCase();
  if (/downtown east|wild wild wet|\bwww\b/.test(t)) return 'WWW';
  if (/jurong east|\bje\b/.test(t)) return 'JE';
  if (/\bcc\b|community club/.test(t)) return 'CC';
  return null;
}

const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DOW3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const moneyIn = (s) => Number(String(s).replace(/[$,\s]/g, ''));
// "Thu, 5 Nov" has no year: take the year where that date is that weekday,
// preferring the latest date that isn't in the future.
export function yearForDate(day, monthIndex, dow, today = todayStr()) {
  const ty = Number(today.slice(0, 4));
  const options = [ty + 1, ty, ty - 1, ty - 2].map((y) => ({ y, ds: ymd(y, monthIndex, day) })).filter((o) => new Date(o.y, monthIndex, day).getMonth() === monthIndex);
  const match = options.filter((o) => dow == null || new Date(o.y, monthIndex, day).getDay() === dow);
  const pool = match.length ? match : options;
  return (pool.find((o) => o.ds <= today) || pool[pool.length - 1] || { y: ty }).y;
}
const HEADER_RE = /^(?:(sun|mon|tue|wed|thu|fri|sat)[a-z]*,?\s+)?(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b(?:\s+(\d{4}))?/i;
const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+(.+)$/i;
// One or more days copied from the booking page → [{ date, lessons, header, warnings, ... }].
export function parseLessonDays(text, today = todayStr()) {
  const days = [];
  let day = null;
  let lesson = null;
  let skipped = 0;
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s·•\-–]+/, '').trim())
    .filter(Boolean);
  for (const line of lines) {
    const h = line.match(HEADER_RE);
    if (h && !TIME_RE.test(line) && !/came|absent|per child|fixed rate/i.test(line)) {
      const mi = MON3.indexOf(h[3].toLowerCase());
      const dow = h[1] ? DOW3.indexOf(h[1].toLowerCase()) : null;
      const y = h[4] ? Number(h[4]) : yearForDate(Number(h[2]), mi, dow, today);
      day = { date: ymd(y, mi, Number(h[2])), header: {}, lessons: [], skipped: 0 };
      days.push(day);
      lesson = null;
      const rest = line.slice(h[0].length);
      const tot = rest.match(/\$\s*([\d,]+(?:\.\d+)?)/);
      if (tot) day.header.total = moneyIn(tot[1]);
      const ln = rest.match(/(\d+)\s+lessons?/i);
      if (ln) day.header.lessons = Number(ln[1]);
      const rl = rest.match(/(\d+)\s+relief/i);
      if (rl) day.header.relief = Number(rl[1]);
      continue;
    }
    if (!day) {
      skipped++;
      continue;
    }
    // Header bits on their own lines: "$252.00", "9 lessons · 1 relief"
    if (!lesson && !TIME_RE.test(line)) {
      const ln = line.match(/(\d+)\s+lessons?/i);
      const rl = line.match(/(\d+)\s+relief/i);
      const tot = line.match(/^\$\s*([\d,]+(?:\.\d+)?)$/);
      if (ln || rl || tot) {
        if (tot) day.header.total = moneyIn(tot[1]);
        if (ln) day.header.lessons = Number(ln[1]);
        if (rl) day.header.relief = Number(rl[1]);
        continue;
      }
    }
    const t = line.match(TIME_RE);
    if (t) {
      lesson = { time: `${t[1]}${t[2] ? `:${t[2]}` : ''}${t[3].toLowerCase()}`, title: t[4].trim(), location: '', minutes: 0, kind: 'group', came: 0, absent: 0, kids: 0, slipPay: null };
      day.lessons.push(lesson);
      continue;
    }
    if (!lesson) {
      day.skipped++;
      continue;
    }
    const pay = line.match(/^\$\s*([\d,]+(?:\.\d+)?)$/);
    if (pay) {
      lesson.slipPay = moneyIn(pay[1]);
      continue;
    }
    if (/\bmin\b|group|private|relief/i.test(line) && !/came|per child|fixed rate/i.test(line)) {
      const parts = line.split('·').map((p) => p.trim());
      lesson.location = parts[0] || '';
      const mm = line.match(/(\d+)\s*min/i);
      if (mm) lesson.minutes = Number(mm[1]);
      lesson.kind = /private/i.test(line) ? 'private' : /relief/i.test(line) ? 'relief' : 'group';
      continue;
    }
    if (/came|absent|per child|fixed rate/i.test(line)) {
      const came = line.match(/(\d+)\s+came/i);
      const absent = line.match(/(\d+)\s+absent/i);
      const times = line.match(/(\d+)\s*[×x]\s*\$/i);
      const fixed = line.match(/fixed rate for\s+(\d+)/i);
      lesson.came = came ? Number(came[1]) : 0;
      lesson.absent = absent ? Number(absent[1]) : 0;
      lesson.kids = times ? Number(times[1]) : fixed ? Number(fixed[1]) : lesson.came + lesson.absent;
      continue;
    }
    day.skipped++;
  }
  return days.map((d) => {
    const lessons = d.lessons.map((l) => ({ ...l, pay: lessonPay(l.kind, l.kids) }));
    const sum = lessonsSummary(lessons);
    const warnings = [];
    lessons.forEach((l) => {
      if (l.slipPay != null && Math.abs(l.slipPay - l.pay) >= 0.005) warnings.push(`${l.time} ${l.title}: page says $${l.slipPay.toFixed(2)}, rule gives $${l.pay.toFixed(2)}`);
    });
    if (d.header.lessons != null && d.header.lessons !== lessons.length) warnings.push(`Header says ${d.header.lessons} lessons, found ${lessons.length}`);
    const slipSum = lessons.reduce((s, l) => s + (l.slipPay || 0), 0);
    if (d.header.total != null && lessons.every((l) => l.slipPay != null) && Math.abs(d.header.total - slipSum) >= 0.005) warnings.push(`Header says $${d.header.total.toFixed(2)}, lessons add to $${slipSum.toFixed(2)}`);
    if (d.skipped) warnings.push(`${d.skipped} line${d.skipped === 1 ? '' : 's'} not understood`);
    return { date: d.date, header: d.header, lessons, amount: sum.total, students: sum.kids, absent: sum.absent, relief: sum.relief, priv: sum.priv, warnings };
  }).filter((d) => d.lessons.length || d.header.total != null);
}
// The record saved for one parsed day.
export const lessonDayRecord = (date, lessons, extra = {}) => ({
  date,
  swimMode: 'lessons',
  amount: lessonsTotal(lessons),
  lessons: lessons.map((l) => ({ time: l.time || '', title: l.title || '', location: l.location || '', minutes: l.minutes || 0, kind: l.kind || 'group', came: l.came || 0, absent: l.absent || 0, kids: l.kids || 0, pay: lessonPay(l.kind, l.kids), slipPay: l.slipPay ?? null })),
  outside: extra.outside || 0,
  outsideDiscount: extra.outsideDiscount || 0,
});

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

// Happy Fish pays a month in arrears: swim days from 1–31 January are
// February's salary. The salary for a period key is therefore the month
// before's swim total (a whole year: the 12 months before each of its months, ÷ 12).
export const earnedMonthFor = (pk) => {
  const d = new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)) - 2, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
};
export function swimSalaryFor(swim, pk) {
  const days = daysOf(swim);
  if (/^\d{4}$/.test(pk)) {
    let sum = 0;
    for (let m = 0; m < 12; m++) sum += swimTotals(days, m === 0 ? Number(pk) - 1 : Number(pk), m === 0 ? 11 : m - 1).total;
    return Math.round((sum / 12) * 100) / 100;
  }
  const { year, monthIndex } = earnedMonthFor(pk);
  return swimTotals(days, year, monthIndex).total;
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
    const fallback = LOCATION_BY_DAY[dayKeyOf(it.date)];
    if (swimModeOf(it) === 'lessons') {
      for (const l of lessonList(it)) {
        const at = locationOfText(l.location) || fallback;
        if (at) totals[at] += l.kids || 0;
      }
      continue;
    }
    const s = schoolStudents(it);
    const loc = fallback;
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
// A teaching day: classes are set for that weekday, or it has been taught before.
export const teachesOnDate = (days, ds, classDays = new Set()) => classDays.has(dayKeyOf(ds)) || weekdayEarnStats(days, dayKeyOf(ds)).n > 0;
export function estimateForDate(days, ds) {
  const key = dayKeyOf(ds);
  const w = weekdayEarnStats(days, key);
  if (w.n) return { amount: w.avg, basis: `average of your last ${w.n} ${DAY_LABELS[key]}${w.n === 1 ? '' : 's'}` };
  const o = overallStats(days);
  if (o.n) return { amount: o.avg, basis: `average of your last ${o.n} swim days` };
  return { amount: 0, basis: 'no history for that day yet' };
}
// The month so far, plus an estimate for each teaching day to come, minus away days.
export function monthAwayProjection(days, away, year, monthIndex, classDays = new Set(), today = todayStr()) {
  const actual = swimTotals(days, year, monthIndex).total;
  const awaySet = new Set(away.map((a) => a.date));
  let toCome = 0;
  let toComeDays = 0;
  let awayValue = 0;
  let awayCount = 0;
  const n = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= n; d++) {
    const ds = ymd(year, monthIndex, d);
    if (ds <= today || !teachesOnDate(days, ds, classDays)) continue;
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
// Start a note from what's saved; else the last note for the same weekday
// (classes repeat weekly), re-matched to this week's classes by their time;
// else one block per class scheduled that day (schedule: [{ time, level }]).
export function reliefBlocksFor(a, away, schedule = []) {
  if (Array.isArray(a.blocks) && a.blocks.some(blockFilled)) return a.blocks.map((b) => ({ ...blankBlock(), ...b }));
  const fresh = schedule.length ? schedule.map((s) => ({ ...blankBlock(), ...s })) : [blankBlock()];
  const key = dayKeyOf(a.date);
  const prev = away.filter((x) => x.date !== a.date && dayKeyOf(x.date) === key && (x.blocks || []).some(blockFilled)).sort((x, y) => y.date.localeCompare(x.date))[0];
  if (!prev) return fresh;
  const prevBlocks = prev.blocks.filter(blockFilled);
  const used = new Set();
  const merged = fresh.map((b) => {
    const i = prevBlocks.findIndex((x, ix) => !used.has(ix) && String(x.time || '').trim() === String(b.time || '').trim());
    if (i === -1) return b;
    used.add(i);
    const out = { ...b };
    for (const k of ['safety', 'games', 'formation', 'remarks']) if (String(prevBlocks[i][k] || '').trim()) out[k] = prevBlocks[i][k];
    return out;
  });
  prevBlocks.forEach((x, ix) => !used.has(ix) && merged.push({ ...blankBlock(), ...x })); // classes that no longer match still come along
  return merged.some(blockFilled) ? merged : fresh;
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
