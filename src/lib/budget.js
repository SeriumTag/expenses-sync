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
    for (const sp of periodSpends(period, ctx.spending, spendKeyFor(ctx.pk, view))) {
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
export function periodSpends(period, spending, key) {
  const out = [];
  for (const [tabId, items] of Object.entries(period?.items || {})) {
    for (const [id, item] of Object.entries(items || {})) {
      if (!item?.budget) continue;
      for (const sp of spendsIn(spending, id, key)) {
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
  return monthlyOf(item) * 12;
}
export const amountInView = (item, id, view, ctx) =>
  spentMode(item) ? spentInView(id, view, ctx) : view === 'yearly' ? yearlyOf(item, id, ctx) : monthlyOf(item);
export const tabInView = (items, view, ctx) =>
  Object.entries(items || {}).reduce((s, [id, item]) => s + amountInView(item, id, view, ctx), 0);

// ── Salary ──────────────────────────────────────────────────────────
// A person's other incomes besides the main salary, e.g. Grab $1,200/mo:
// person.incomes = { id: { name, amount, order } }, stored monthly.
export const monthlyIncome = (person) =>
  (Number(person?.salary) || 0) + Object.values(person?.incomes || {}).reduce((s, x) => s + (Number(x.amount) || 0), 0);

// Salary (all incomes), spending and what's left, all in `view` (stored monthly).
export function afterExpenses(person, period, view = 'monthly', ctx) {
  const salary = inView(monthlyIncome(person), view);
  const spent = Object.keys(person?.tabs || {}).reduce((s, tabId) => s + tabInView(period?.items?.[tabId], view, ctx), 0);
  return { salary, spent, left: salary - spent };
}

// ── Spending budgets ────────────────────────────────────────────────
// An item ticked "Track spending" (item.budget) is an allowance, e.g. Food
// $300/mo, that day-to-day spends are logged against. Spends are kept per item
// across months: ledgers/{lid}/spending/{itemId}/{id} = { date, note, amount, by, at },
// and each month (or year) only counts its own dates.
export function spendsIn(spending, itemId, pk) {
  const prefix = isYearKey(pk) ? `${pk}-` : pk;
  return Object.entries(spending?.[itemId] || {})
    .map(([id, s]) => ({ id, ...s }))
    .filter((s) => s.date?.startsWith(prefix))
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
  const yearSpent = sumSpends(spendsIn(ctx.spending, itemId, pk.slice(0, 4)));
  if (view === 'yearly') return yearSpent;
  return isYearKey(pk) ? yearSpent / 12 : sumSpends(spendsIn(ctx.spending, itemId, pk));
}

// Budget, spent and left for an item in period `pk` (a whole year counts 12 months).
export function budgetStatus(item, itemId, spending, pk) {
  const spends = spendsIn(spending, itemId, pk);
  const spent = sumSpends(spends);
  if (spentMode(item)) return { budget: spent, spent, left: 0, spends, noBudget: true };
  const budget = monthlyOf(item) * (isYearKey(pk) ? 12 : 1);
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
