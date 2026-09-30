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
      .pop() ?? null
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

// An item can have several categories, typed "Insurance, Kids".
export function splitCats(value) {
  const seen = new Set();
  const out = [];
  for (const raw of String(value || '').split(',')) {
    const c = raw.trim();
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
  }
  return out;
}

// A part of a merged item has its own categories (older merges: the parent's).
export const partCats = (part, parent) => splitCats(part?.category ?? parent?.category);

export function itemCats(item) {
  if (!item?.parts) return splitCats(item?.category);
  return splitCats(Object.values(item.parts).flatMap((p) => partCats(p, item)).join(','));
}

// What a merged item shows as its category: the shared one, or "Mixed".
export function groupCatLabel(item) {
  const cats = itemCats(item);
  return cats.length === 0 ? '' : cats.length === 1 ? cats[0] : 'Mixed';
}

// The things categories are about: every plain item, and every part of a
// merged item on its own. [{ id, item, parentId, cats }]
export function leaves(items) {
  const out = [];
  for (const it of sorted(items)) {
    if (it.parts) {
      for (const p of sorted(it.parts)) out.push({ id: p.id, item: p, parentId: it.id, parentName: it.name, cats: partCats(p, it) });
    } else out.push({ id: it.id, item: it, parentId: null, cats: splitCats(it.category) });
  }
  return out;
}

// All categories used in a period: [{ key, label, count, total }] (total in `view`)
export function categoriesIn(period, view = 'monthly', ctx) {
  const map = new Map();
  for (const items of Object.values(period?.items || {})) {
    for (const leaf of leaves(items)) {
      for (const label of leaf.cats) {
        const key = catKey(label);
        const c = map.get(key) || { key, label, count: 0, total: 0 };
        c.count += 1;
        c.total += amountInView(leaf.item, leaf.id, view, ctx);
        map.set(key, c);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// Everything in a period with a given category, parts of merged items listed
// individually: [{ tabId, tabName, id, item, parentId, parentName }]
export function itemsInCategory(period, key) {
  const out = [];
  for (const tab of sorted(period?.tabs)) {
    for (const leaf of leaves(period?.items?.[tab.id])) {
      if (leaf.cats.some((c) => catKey(c) === key)) out.push({ tabId: tab.id, tabName: tab.name, ...leaf });
    }
  }
  return out;
}

// Per-tab breakdown by category, biggest first (totals in `view`). An item
// with two categories counts toward both.
export function byCategory(items, view = 'monthly', ctx) {
  const groups = new Map();
  for (const leaf of leaves(items)) {
    for (const label of leaf.cats.length ? leaf.cats : ['Uncategorised']) {
      const key = label.toLowerCase();
      const g = groups.get(key) || { label, total: 0, count: 0 };
      g.total += amountInView(leaf.item, leaf.id, view, ctx);
      g.count += 1;
      groups.set(key, g);
    }
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

// What's in a pot up to and including month `upTo`: the starting amount the
// user already had (track.start = { amount, since: "YYYY-MM" }) plus every
// month saved from `since` onward. Without a start, it's just the saving from
// January of `upTo`'s year.
export function potBalance(itemId, track, periods, upTo) {
  const start = track?.start;
  const since = start?.since || `${upTo.slice(0, 4)}-01`;
  let total = Number(start?.amount) || 0;
  for (let y = Number(since.slice(0, 4)); y <= Number(upTo.slice(0, 4)); y++) {
    total += savingsTotal(savingsMonths(y, itemId, track?.log, periods).filter((m) => m.key >= since && m.key <= upTo));
  }
  return total;
}

// ── Amounts in the chosen view ──────────────────────────────────────
// ctx = { year, tracks, periods }. In the yearly view a savings-tracked item
// counts what was actually put in month by month that year, not monthly × 12.
export function yearlyOf(item, id, ctx) {
  if (item?.track && ctx) return savingsTotal(savingsMonths(ctx.year, id, ctx.tracks?.[id]?.log, ctx.periods));
  return monthlyOf(item) * 12;
}
export const amountInView = (item, id, view, ctx) => (view === 'yearly' ? yearlyOf(item, id, ctx) : monthlyOf(item));
export const tabInView = (items, view, ctx) =>
  Object.entries(items || {}).reduce((s, [id, item]) => s + amountInView(item, id, view, ctx), 0);

// ── Salary ──────────────────────────────────────────────────────────
// Salary, spending and what's left, all in `view` (salary is stored monthly).
export function afterExpenses(person, period, view = 'monthly', ctx) {
  const salary = inView(Number(person?.salary) || 0, view);
  const spent = Object.keys(person?.tabs || {}).reduce((s, tabId) => s + tabInView(period?.items?.[tabId], view, ctx), 0);
  return { salary, spent, left: salary - spent };
}
