// Budget maths and period (month / year) helpers.
//
// Every budget lives in a period: "2026-09" (a month) or "2026" (a whole year).
// Copying a period keeps item ids, so the same item can be compared across
// periods and its savings tracked over the year.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');

export const monthKey = (year, monthIndex) => `${year}-${pad2(monthIndex + 1)}`;
export function currentMonthKey() {
  const d = new Date();
  return monthKey(d.getFullYear(), d.getMonth());
}
export const isYearKey = (k) => /^\d{4}$/.test(k);
export const yearOf = (k) => Number(String(k).slice(0, 4));
export const monthIndexOf = (k) => (isYearKey(k) ? null : Number(k.slice(5, 7)) - 1);

export function periodLabel(k) {
  if (!k) return '';
  return isYearKey(k) ? `${k} · Whole year` : `${MONTHS[monthIndexOf(k)]} ${yearOf(k)}`;
}
export const shortPeriodLabel = (k) => (isYearKey(k) ? k : MONTHS[monthIndexOf(k)]);

// The closest earlier period of the same kind (month→month, year→year).
export function previousPeriod(k, existing) {
  return (
    existing
      .filter((x) => isYearKey(x) === isYearKey(k) && x < k)
      .sort()
      .at(-1) ?? null
  );
}

// ── Amounts ──────────────────────────────────────────────────────────
// An item (or a part of a merged item) has an amount and how often it's paid.
// Everything is compared and totalled as a monthly equivalent.
export function partMonthly(p) {
  const a = Number(p?.amount) || 0;
  return p?.freq === 'yearly' ? a / 12 : a;
}
export function monthlyOf(item) {
  if (item?.parts) return Object.values(item.parts).reduce((s, p) => s + partMonthly(p), 0);
  return partMonthly(item);
}
export const sumTab = (items) => Object.values(items || {}).reduce((s, i) => s + monthlyOf(i), 0);

// How much of an item is billed yearly, as a monthly amount: what to put
// aside each month so the yearly bills are covered when they come.
export function setAsideOf(item) {
  if (item?.parts) return Object.values(item.parts).reduce((s, p) => s + (p.freq === 'yearly' ? partMonthly(p) : 0), 0);
  return item?.freq === 'yearly' ? partMonthly(item) : 0;
}
export const setAsideTab = (items) => Object.values(items || {}).reduce((s, i) => s + setAsideOf(i), 0);

export const FREQS = {
  monthly: { label: 'Monthly', short: '/mo', tiny: 'Mo' },
  yearly: { label: 'Yearly', short: '/yr', tiny: 'Yr' },
};
// Amount of `monthly` expressed in the chosen view.
export const inView = (monthly, view) => (view === 'yearly' ? monthly * 12 : monthly);

export const sorted = (obj) =>
  Object.entries(obj || {})
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

// ── Categories ───────────────────────────────────────────────────────
export const normCat = (name) => (name || '').trim().toLowerCase();
// Firebase keys can't contain . # $ [ ] /
export const catKey = (name) => normCat(name).replace(/[.#$[\]/]/g, '_') || '_';

// All categories used in a period: [{ key, label, count, monthly }]
export function categoriesIn(period) {
  const map = new Map();
  for (const items of Object.values(period?.items || {})) {
    for (const item of Object.values(items || {})) {
      const label = (item.category || '').trim();
      if (!label) continue;
      const key = catKey(label);
      const c = map.get(key) || { key, label, count: 0, monthly: 0 };
      c.count += 1;
      c.monthly += monthlyOf(item);
      map.set(key, c);
    }
  }
  return [...map.values()].sort((a, b) => b.monthly - a.monthly);
}

// Items in a period with a given category: [{ tabId, tabName, id, item }]
export function itemsInCategory(period, key) {
  const out = [];
  for (const tab of sorted(period?.tabs)) {
    for (const item of sorted(period?.items?.[tab.id])) {
      if (item.category && catKey(item.category) === key) out.push({ tabId: tab.id, tabName: tab.name, id: item.id, item });
    }
  }
  return out;
}

// Per-tab breakdown by category, biggest first.
export function byCategory(items) {
  const groups = new Map();
  for (const item of Object.values(items || {})) {
    const label = (item.category || '').trim() || 'Uncategorised';
    const key = label.toLowerCase();
    const g = groups.get(key) || { label, total: 0, count: 0 };
    g.total += monthlyOf(item);
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

// ── Comparing with the previous period ──────────────────────────────
export function findItem(period, itemId) {
  for (const [tabId, items] of Object.entries(period?.items || {})) {
    if (items?.[itemId]) return { tabId, item: items[itemId] };
  }
  return null;
}

// null = nothing to compare against; { isNew } or { diff } (monthly) otherwise.
export function compareItem(item, itemId, prevPeriod) {
  if (!prevPeriod) return null;
  const before = findItem(prevPeriod, itemId);
  if (!before) return { isNew: true };
  const diff = Math.round((monthlyOf(item) - monthlyOf(before.item)) * 100) / 100;
  return diff ? { diff } : null;
}

// ── Savings tracking ────────────────────────────────────────────────
// A tracked item's log is kept per month ("2026-02": 150). Months without an
// entry fall back to that month's budget, if there is one.
export function savingsMonths(year, itemId, log, periods) {
  return MONTHS.map((label, i) => {
    const key = monthKey(year, i);
    const logged = log?.[key];
    const fromBudget = periods?.[key] ? findItem(periods[key], itemId) : null;
    const value = logged ?? (fromBudget ? Math.round(monthlyOf(fromBudget.item) * 100) / 100 : null);
    return { key, label, value, logged: logged !== undefined && logged !== null, planned: fromBudget ? monthlyOf(fromBudget.item) : null };
  });
}
export const savingsTotal = (months) => months.reduce((s, m) => s + (Number(m.value) || 0), 0);

// ── Salary ──────────────────────────────────────────────────────────
export function afterExpenses(person, period) {
  const spent = Object.keys(person?.tabs || {}).reduce((s, tabId) => s + sumTab(period?.items?.[tabId]), 0);
  return { salary: Number(person?.salary) || 0, spent, left: (Number(person?.salary) || 0) - spent };
}
