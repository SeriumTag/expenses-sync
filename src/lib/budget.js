// Budget maths and period (month / year) helpers.
//
// Every budget lives in a period: "2026-09" (a month) or "2026" (a whole year).
// Copying a period keeps item ids, so the same item can be compared across
// periods and its savings tracked over the year.

import { billMonth, countsInMonth } from './cards.js';

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

// ── Recurrence ───────────────────────────────────────────────────────
// item.recur: 'once' (only its month) | 'monthly' (every month until it ends) |
// 'yearly' (same month every year). Missing = monthly, like items always were.
// item.endMonth: last month it appears ('YYYY-MM'); item.pauses: { 'YYYY-MM': true }.
export const RECURS = {
  once: { label: 'One time', short: 'One-time' },
  monthly: { label: 'Every month', short: 'Monthly' },
  yearly: { label: 'Every year', short: 'Yearly' },
};
export const recurOf = (item) => (RECURS[item?.recur] ? item.recur : 'monthly');
export const isPaused = (item, pk) => Boolean(pk && item?.pauses?.[pk]);
export const endedBy = (item, key) => Boolean(item?.endMonth && key > item.endMonth);

// Whether an item in month `fromKey` carries on into a later month `toKey`.
export function continuesInto(item, fromKey, toKey) {
  if (isYearKey(fromKey) || isYearKey(toKey) || toKey <= fromKey || endedBy(item, toKey)) return false;
  const r = recurOf(item);
  if (r === 'monthly') return true;
  if (r === 'yearly') return toKey.slice(5, 7) === fromKey.slice(5, 7);
  return false;
}

// Months a recurring item will appear in, from `fromKey` on (for the pause chips).
export function nextOccurrences(item, fromKey, count = 12) {
  if (isYearKey(fromKey)) return [];
  const r = recurOf(item);
  if (r === 'once') return [];
  const out = [];
  let y = Number(fromKey.slice(0, 4));
  let m = Number(fromKey.slice(5, 7)) - 1;
  while (out.length < count) {
    const key = monthKey(y, m);
    if (endedBy(item, key)) break;
    out.push(key);
    if (r === 'yearly') y += 1;
    else if (++m > 11) (m = 0), (y += 1);
  }
  return out;
}

// What to put aside each month for yearly-recurring bills (amount ÷ 12), from
// any month of the year (each item counted once).
export function yearlyRecurringSetAside(periods, year) {
  const seen = new Map();
  for (const [key, p] of Object.entries(periods || {})) {
    if (isYearKey(key) || !key.startsWith(`${year}-`)) continue;
    for (const items of Object.values(p?.items || {})) {
      for (const [id, it] of Object.entries(items || {})) {
        if (recurOf(it) === 'yearly' && !seen.has(id)) seen.set(id, monthlyOf(it) / 12);
      }
    }
  }
  return [...seen.values()].reduce((a, b) => a + b, 0);
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

// A part of a combined item gets the head item's categories (e.g. Car) plus any
// extra ones of its own.
export const partCats = (part, parent) => splitCats([parent?.category, part?.category].filter(Boolean).join(','));

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

// All categories used in a period: [{ key, label, count, spendCount, total }]
// (total in `view`). Counts the Category box on items and parts, and the
// categories typed on spends (e.g. Food → Rice), unless the spend's own budget
// already has that category (then its budget amount is counted, not twice).
export function categoriesIn(period, view = 'monthly', ctx) {
  const map = new Map();
  const entry = (label) => {
    const key = catKey(label);
    if (!map.has(key)) map.set(key, { key, label, count: 0, spendCount: 0, total: 0 });
    return map.get(key);
  };
  for (const items of Object.values(period?.items || {})) {
    for (const leaf of leaves(items)) {
      for (const label of leaf.cats) {
        const c = entry(label);
        c.count += 1;
        c.total += amountInView(leaf.item, leaf.id, view, ctx);
      }
    }
  }
  if (ctx?.pk) {
    for (const sp of periodSpends(period, ctx.spending, spendKeyFor(ctx.pk, view), ctx.cards)) {
      for (const label of splitCats(sp.category)) {
        if (sp.budgetCats.some((c) => catKey(c) === catKey(label))) continue;
        const c = entry(label);
        c.spendCount += 1;
        c.total += Number(sp.amount) || 0;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// Which spends a view covers: the month shown, or its whole year in the yearly view.
export const spendKeyFor = (pk, view) => (view === 'yearly' ? String(pk).slice(0, 4) : pk);

// Every spend logged against the spending budgets of a period, with its budget:
// [{ ...spend, budgetId, budgetName, budgetCats, tabId }]
export function periodSpends(period, spending, key, cards) {
  const out = [];
  for (const [tabId, items] of Object.entries(period?.items || {})) {
    for (const [id, item] of Object.entries(items || {})) {
      if (!item?.budget) continue;
      for (const sp of spendsIn(spending, id, key, cards)) {
        out.push({ ...sp, budgetId: id, budgetName: item.name || 'Untitled', budgetCats: splitCats(item.category), tabId });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
}

// The spends with a given category (left out when their own budget already has
// it, as in categoriesIn).
export function spendsInCategory(period, key, spending, spendKey) {
  return periodSpends(period, spending, spendKey).filter(
    (sp) => splitCats(sp.category).some((c) => catKey(c) === key) && !sp.budgetCats.some((c) => catKey(c) === key),
  );
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
// Months that haven't come yet count as nothing saved — even if an amount is
// budgeted or typed in — until the month arrives. `entered` keeps what was typed.
export function savingsMonths(year, itemId, log, periods) {
  const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
  return MONTHS.map((label, i) => {
    const key = monthKey(year, i);
    const logged = log?.[key];
    const hasLog = logged !== undefined && logged !== null;
    const fromBudget = periods?.[key] ? findItem(periods[key], itemId) : null;
    const future = key > thisMonth;
    const value = future ? null : hasLog ? logged : fromBudget ? Math.round(monthlyOf(fromBudget.item) * 100) / 100 : null;
    return { key, label, value, future, logged: hasLog, entered: hasLog ? logged : null, planned: fromBudget ? monthlyOf(fromBudget.item) : null };
  });
}
export const savingsTotal = (months) => months.reduce((s, m) => s + (Number(m.value) || 0), 0);

// What's in a pot up to and including month `upTo`: the starting amount the
// user already had (track.start = { amount, since: "YYYY-MM" }) plus every
// month saved from `since` onward. Without a start, it's just the saving from
// January of `upTo`'s year.
// Withdrawals from the pot count against it too (from `since`, up to `upTo`).
export function potBalance(itemId, track, periods, upTo) {
  const start = track?.start;
  const since = start?.since || `${upTo.slice(0, 4)}-01`;
  let total = Number(start?.amount) || 0;
  for (let y = Number(since.slice(0, 4)); y <= Number(upTo.slice(0, 4)); y++) {
    total += savingsTotal(savingsMonths(y, itemId, track?.log, periods).filter((m) => m.key >= since && m.key <= upTo));
  }
  const today = new Date().toLocaleDateString('en-CA');
  for (const w of withdrawalList(track)) {
    const month = w.date.slice(0, 7);
    if (month >= since && month <= upTo && w.date <= today) total -= Number(w.amount) || 0;
  }
  return total;
}

// Money taken out of a pot: track.withdrawals = { id: { amount, date: "YYYY-MM-DD", note, by, at } }.
// Newest first.
export function withdrawalList(track) {
  return Object.entries(track?.withdrawals || {})
    .map(([id, w]) => ({ id, ...w, date: w.date || '' }))
    .filter((w) => w.date)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
}

// Total withdrawn in each month of `year` ("YYYY-MM" → amount), up to today.
export function withdrawnByMonth(track, year) {
  const out = {};
  const today = new Date().toLocaleDateString('en-CA');
  for (const w of withdrawalList(track)) {
    if (w.date.startsWith(`${year}-`) && w.date <= today) out[w.date.slice(0, 7)] = (out[w.date.slice(0, 7)] || 0) + (Number(w.amount) || 0);
  }
  return out;
}

// ── Amounts in the chosen view ──────────────────────────────────────
// ctx = { year, tracks, periods }. In the yearly view a savings-tracked item
// counts what was actually put in month by month that year, not monthly × 12.
export function yearlyOf(item, id, ctx) {
  if (item?.track && ctx) return savingsTotal(savingsMonths(ctx.year, id, ctx.tracks?.[id]?.log, ctx.periods));
  // A one-time or once-a-year payment happens once in a year, not 12 times.
  if (recurOf(item) !== 'monthly') return monthlyOf(item);
  return monthlyOf(item) * 12;
}
// A paused item counts nothing in that month. An item whose budget comes from
// another item's amount (item.pool, e.g. Family Meals from Allowances) counts
// nothing either: that other item is already counted. A bill paid by credit
// card counts in the month its card bill comes (see carriedIn).
export const amountInView = (item, id, view, ctx) =>
  isPaused(item, ctx?.pk) || item?.pool || billedLater(item, view, ctx)
    ? 0
    : spentMode(item)
      ? spentInView(id, view, ctx)
      : view === 'yearly'
        ? yearlyOf(item, id, ctx)
        : monthlyOf(item);
export const tabInView = (items, view, ctx) =>
  Object.entries(items || {}).reduce((s, [id, item]) => s + amountInView(item, id, view, ctx), 0);

// ── Credit-card bills ───────────────────────────────────────────────
// The date a bill falls on in month `key` (its own day of the month).
const billDateIn = (item, key) => `${key}-${/^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date.slice(8, 10) : '01'}`;
// The month (YYYY-MM) a card-paid bill in period `key` is actually paid in.
export function cardBillMonth(item, key, cards) {
  const card = item?.card ? cards?.[item.card] : null;
  return card && !isYearKey(key) ? billMonth(billDateIn(item, key), card) : null;
}
// In the monthly view a bill on a card counts when its card bill comes, so it
// counts nothing in its own month if that bill comes later.
function billedLater(item, view, ctx) {
  if (view !== 'monthly' || !ctx?.pk || isYearKey(ctx.pk)) return false;
  const bm = cardBillMonth(item, ctx.pk, ctx.cards);
  return Boolean(bm && bm !== ctx.pk);
}
const prevMonthKey = (key) => {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
// Last month's card-paid bills in a group whose card bill comes this month:
// [{ id, item, amount, fromKey }]
export function carriedIn(periods, pk, tabId, ctx) {
  if (!pk || isYearKey(pk) || !ctx?.cards) return [];
  const from = prevMonthKey(pk);
  const out = [];
  for (const [id, item] of Object.entries(periods?.[from]?.items?.[tabId] || {})) {
    if (!item?.card || item.pool || isPaused(item, from) || spentMode(item)) continue;
    if (cardBillMonth(item, from, ctx.cards) === pk) out.push({ id, item, amount: monthlyOf(item), fromKey: from });
  }
  return out;
}
// A group's total in `view`, with last month's card bills that are paid this month.
export function tabTotal(period, tabId, view, ctx) {
  const own = tabInView(period?.items?.[tabId], view, ctx);
  if (view !== 'monthly') return own;
  return own + carriedIn(ctx?.periods, ctx?.pk, tabId, ctx).reduce((s, x) => s + x.amount, 0);
}

// ── Automatic amounts ───────────────────────────────────────────────
// item.auto = { total }: what's left of a set total after every other item in
// its group, e.g. Allowances = $1,800 − everything else in Combined.
export function autoAmount(items, id) {
  const item = items?.[id];
  const total = Number(item?.auto?.total) || 0;
  const others = Object.entries(items || {}).reduce((s, [oid, it]) => (oid === id || it?.pool ? s : s + monthlyOf(it)), 0);
  // (a part's own automatic amount is handled by autoPartAmount)
  return Math.max(0, Math.round((total - others) * 100) / 100);
}

// ── Salary ──────────────────────────────────────────────────────────
// A person's other incomes besides the main salary, e.g. Grab $1,200/mo:
// person.incomes = { id: { name, amount, order } }, stored monthly.
export const monthlyIncome = (person) =>
  (Number(person?.salary) || 0) + Object.values(person?.incomes || {}).reduce((s, x) => s + (Number(x.amount) || 0), 0);

// Salary (all incomes), spending and what's left, all in `view` (stored monthly).
export function afterExpenses(person, period, view = 'monthly', ctx) {
  const salary = inView(monthlyIncome(person), view);
  const spent = Object.keys(person?.tabs || {}).reduce((s, tabId) => s + tabTotal(period, tabId, view, ctx), 0);
  return { salary, spent, left: salary - spent };
}

// ── Spending budgets ────────────────────────────────────────────────
// An item ticked "Track spending" (item.budget) is an allowance, e.g. Food
// $300/mo, that day-to-day spends are logged against. Spends are kept per item
// across months: ledgers/{lid}/spending/{itemId}/{id} = { date, note, amount, by, at },
// and each month (or year) only counts its own dates.
// A spend put on a credit card counts in the month its card bill comes (cards).
export function spendsIn(spending, itemId, pk, cards) {
  const inKey = (s) => {
    const m = countsInMonth(s.date, s.card, cards);
    return Boolean(m) && (isYearKey(pk) ? m.startsWith(`${pk}-`) : m === pk);
  };
  return Object.entries(spending?.[itemId] || {})
    .map(([id, s]) => ({ id, ...s }))
    .filter(inKey)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
}

// "No fixed budget" (item.budgetMode === 'spent'): instead of a planned
// amount, the item counts as whatever was actually spent.
export const spentMode = (item) => Boolean(item?.budget && item.budgetMode === 'spent');
const sumSpends = (list) => list.reduce((s, x) => s + (Number(x.amount) || 0), 0);

// What a "no fixed budget" item counts as in totals: this month's spends
// (monthly view) or the whole year's (yearly view).
function spentInView(itemId, view, ctx) {
  const pk = ctx?.pk;
  if (!pk) return 0;
  const yearSpent = sumSpends(spendsIn(ctx.spending, itemId, pk.slice(0, 4), ctx.cards));
  if (view === 'yearly') return yearSpent;
  return isYearKey(pk) ? yearSpent / 12 : sumSpends(spendsIn(ctx.spending, itemId, pk, ctx.cards));
}

// An item, or a part inside a combined item, by id: { tabId, item, parent }.
export function findAny(period, id) {
  const top = findItem(period, id);
  if (top) return top;
  for (const [tabId, items] of Object.entries(period?.items || {})) {
    for (const parent of Object.values(items || {})) if (parent?.parts?.[id]) return { tabId, item: parent.parts[id], parent };
  }
  return null;
}
// A part with parts.auto = { total }: the total minus the other parts of its
// combined item (e.g. Combined → Allowances = $1,800 − the other parts).
export function autoPartAmount(parts, pid) {
  const total = Number(parts?.[pid]?.auto?.total) || 0;
  const others = Object.entries(parts || {}).reduce((s, [id, p]) => (id === pid ? s : s + partMonthly(p)), 0);
  return Math.max(0, Math.round((total - others) * 100) / 100);
}

// Items sharing one budget (item.pool = the item, or part, whose amount is the budget).
export function poolOf(period, poolId) {
  const source = findAny(period, poolId);
  const members = [];
  for (const [tabId, items] of Object.entries(period?.items || {})) for (const [id, it] of Object.entries(items || {})) if (it?.pool === poolId) members.push({ id, tabId, item: it });
  return { source, members };
}

// Budget, spent and left for an item in period `pk` (a whole year counts 12 months).
// ctx (optional) = { period, cards }: card spends count in their bill's month,
// and items sharing a pool show the pool's budget and everything spent from it.
export function budgetStatus(item, itemId, spending, pk, ctx) {
  const cards = ctx?.cards;
  const spends = spendsIn(spending, itemId, pk, cards);
  const spent = sumSpends(spends);
  if (item?.pool && ctx?.period) {
    const { source, members } = poolOf(ctx.period, item.pool);
    const budget = source && !isPaused(source.parent || source.item, pk) ? monthlyOf(source.item) * (isYearKey(pk) ? 12 : 1) : 0;
    const poolSpent = members.reduce((s, m) => s + sumSpends(spendsIn(spending, m.id, pk, cards)), 0);
    return { budget, spent: poolSpent, left: budget - poolSpent, spends, ownSpent: spent, pool: { name: source?.item?.name || 'the shared budget', tabId: source?.tabId, count: members.length } };
  }
  if (spentMode(item)) return { budget: spent, spent, left: 0, spends, noBudget: true };
  const budget = isPaused(item, pk) ? 0 : monthlyOf(item) * (isYearKey(pk) ? 12 : 1);
  return { budget, spent, left: budget - spent, spends };
}

// ── Categories on spends ────────────────────────────────────────────
// Totals per category for a list of spends (a spend with two categories
// counts toward both), biggest first. Spends without one are left out.
export function spendCategoryTotals(spends) {
  const map = new Map();
  for (const s of spends || []) {
    for (const c of splitCats(s.category)) {
      const key = c.toLowerCase();
      const g = map.get(key) || { label: c, total: 0, count: 0 };
      g.total += Number(s.amount) || 0;
      g.count += 1;
      map.set(key, g);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// Every category used on any spend, for suggestions while typing.
export function allSpendCategories(spending) {
  const seen = new Map();
  for (const spends of Object.values(spending || {})) {
    for (const s of Object.values(spends || {})) for (const c of splitCats(s.category)) seen.set(c.toLowerCase(), c);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// ── Home stat tiles ─────────────────────────────────────────────────
// From the spends logged against the given budgets in period `pk`:
// today's and this week's total (Mon–today; only when `pk` includes today),
// how many purchases, the biggest one, and an average per day so far.
export function spendStats(spending, budgetIds, pk, today = new Date().toLocaleDateString('en-CA')) {
  const all = budgetIds.flatMap((id) => spendsIn(spending, id, pk));
  const total = all.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const inPeriod = isYearKey(pk) ? today.startsWith(`${pk}-`) : today.startsWith(pk);
  const d = new Date(`${today}T00:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const mondayKey = monday.toLocaleDateString('en-CA');
  const sum = (list) => list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const biggest = all.reduce((b, x) => (!b || (Number(x.amount) || 0) > (Number(b.amount) || 0) ? x : b), null);
  // Days so far: up to today in the current period, otherwise the whole period.
  let days;
  if (isYearKey(pk)) {
    const start = new Date(`${pk}-01-01T00:00:00`);
    const end = inPeriod ? d : new Date(`${pk}-12-31T00:00:00`);
    days = Math.round((end - start) / 86400000) + 1;
  } else {
    days = inPeriod ? d.getDate() : new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)), 0).getDate();
  }
  return {
    total,
    count: all.length,
    today: inPeriod ? sum(all.filter((x) => x.date === today)) : null,
    week: inPeriod ? sum(all.filter((x) => x.date >= mondayKey && x.date <= today)) : null,
    biggest,
    perDay: days > 0 ? total / days : 0,
    inPeriod,
  };
}

// Every budget ("Track spending") item in the period being shown.
export function budgetItems(period, tabs) {
  return tabs.flatMap((t) =>
    sorted(period?.items?.[t.id])
      .filter((item) => item.budget)
      .map((item) => ({ id: item.id, item, tabId: t.id, tabName: t.name })),
  );
}

// Every savings pot ("Track as savings pot") item in the period being shown.
export function trackedItems(period, tabs) {
  return tabs.flatMap((t) =>
    sorted(period?.items?.[t.id])
      .filter((item) => item.track)
      .map((item) => ({ id: item.id, item, tabId: t.id, tabName: t.name })),
  );
}
