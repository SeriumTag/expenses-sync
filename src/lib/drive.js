// Grab driving: rides, petrol and other car costs, worked out per car-payment
// cycle (the 14th to the 13th). Ported from the Body Log app's Drive tab.
//
// drive = { rides: { id: { date, time, dateTime, amount, erp?, note? } },
//           items: { id: { type: 'petrol' | 'other' | 'earn', date, amount, ... } },
//           settings: { carTarget } }

// Grab keeps a cut of every fare: about 95.3% of the trip amount lands.
export const GRAB_NET_RATE = 0.953;
export const grabNet = (gross) => gross * GRAB_NET_RATE;
export const DEFAULT_CAR_TARGET = 1932;
export const OTHER_CATEGORIES = ['Cashcard top-up', 'Servicing', 'LTA', 'Other'];

const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayMs = 86400000;
const asDate = (s) => new Date(`${s}T00:00:00`);

export const ridesOf = (drive) => Object.entries(drive?.rides || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));
export const itemsOf = (drive) => Object.entries(drive?.items || {}).map(([id, it]) => ({ id, ...it })).sort((a, b) => a.date.localeCompare(b.date));
export const carTargetOf = (drive) => Number(drive?.settings?.carTarget) || DEFAULT_CAR_TARGET;

// A cycle is labelled by the month it ends in: 14th of the month before to
// the 13th of this one. monthIndex is 0-based.
export function cycleRange(year, monthIndex) {
  return { start: fmtDate(new Date(year, monthIndex - 1, 14)), end: fmtDate(new Date(year, monthIndex, 13)) };
}
export const cycleForPeriod = (pk) => cycleRange(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)) - 1);
// The cycle a date belongs to, as a period key ("2026-11" for 14 Oct – 13 Nov).
export function cycleKeyForDate(dateStr) {
  const d = asDate(dateStr);
  const m = new Date(d.getFullYear(), d.getMonth() + (d.getDate() >= 14 ? 1 : 0), 1);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
}

// Petrol logged before the Grab / savings split counts as paid from Grab.
const petrolSplit = (it) => (it.fromGrab == null && it.fromSavings == null ? { grab: Number(it.amount) || 0, savings: 0 } : { grab: Number(it.fromGrab) || 0, savings: Number(it.fromSavings) || 0 });

export function cycleTotals(rides, items, start, end) {
  let earn = 0;
  let fuelGrab = 0;
  let fuelSavings = 0;
  let others = 0;
  let jobs = 0;
  let erp = 0;
  const days = new Set();
  for (const it of items) {
    if (it.date < start || it.date > end) continue;
    if (it.type === 'earn') {
      // Old per-day totals, kept as history.
      earn += Number(it.amount) || 0;
      days.add(it.date);
      jobs += Number(it.jobs) || 0;
    } else if (it.type === 'petrol') {
      const s = petrolSplit(it);
      fuelGrab += s.grab;
      fuelSavings += s.savings;
    } else if (it.type === 'other') others += Number(it.amount) || 0;
  }
  for (const r of rides) {
    if (r.date < start || r.date > end) continue;
    earn += Number(r.amount) || 0;
    erp += Number(r.erp) || 0;
    days.add(r.date);
    jobs += 1;
  }
  const earnNet = grabNet(earn);
  return { earn, earnNet, fuelGrab, fuelSavings, others, erp, fuel: fuelGrab + fuelSavings, net: earnNet - fuelGrab, days: days.size, jobs, start, end };
}

// The Grab income for a period: this cycle's net after petrol from the Grab
// wallet. A whole year is its twelve cycles averaged per month (incomes are monthly).
export function grabIncomeFor(drive, pk) {
  const rides = ridesOf(drive);
  const items = itemsOf(drive);
  if (/^d{4}$/.test(pk)) {
    let sum = 0;
    for (let m = 0; m < 12; m++) {
      const { start, end } = cycleRange(Number(pk), m);
      sum += cycleTotals(rides, items, start, end).net;
    }
    return Math.round((sum / 12) * 100) / 100;
  }
  const { start, end } = cycleForPeriod(pk);
  return Math.round(cycleTotals(rides, items, start, end).net * 100) / 100;
}

// Driving time between two dates (inclusive): each day is its first trip to
// its last. Days with fewer than two timed trips have no span and are left out.
export function driveSpan(rides, fromDate, toDate) {
  const byDay = {};
  for (const r of rides) if (r.date >= fromDate && r.date <= toDate && r.dateTime) (byDay[r.date] ||= []).push(r);
  let hours = 0;
  let gross = 0;
  for (const list of Object.values(byDay)) {
    if (list.length < 2) continue;
    const h = (new Date(list[list.length - 1].dateTime) - new Date(list[0].dateTime)) / 3600000;
    if (!(h > 0)) continue;
    hours += h;
    gross += list.reduce((t, r) => t + (Number(r.amount) || 0), 0);
  }
  return { hours, gross };
}

// One day's Grab report: trips, net, net per hour (first to last trip) and
// the minutes between one ride and the next.
export function dayReport(rides, items, date) {
  const dayRides = rides.filter((r) => r.date === date);
  const legacy = items.filter((i) => i.date === date && i.type === 'earn');
  const gross = legacy.reduce((s, i) => s + (Number(i.amount) || 0), 0) + dayRides.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const trips = dayRides.length + legacy.reduce((s, i) => s + (Number(i.jobs) || 1), 0);
  let perHour = null;
  if (dayRides.length >= 2) {
    const h = (new Date(dayRides[dayRides.length - 1].dateTime) - new Date(dayRides[0].dateTime)) / 3600000;
    if (h > 0) perHour = gross / h;
  }
  let prev = null;
  const rows = dayRides.map((r) => {
    let gap = null;
    if (prev && r.dateTime) {
      const mins = Math.round((new Date(r.dateTime) - prev) / 60000);
      if (mins >= 0) gap = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    }
    if (r.dateTime) prev = new Date(r.dateTime);
    return { ...r, gap };
  });
  return {
    rides: rows,
    legacy,
    petrol: items.filter((i) => i.date === date && i.type === 'petrol'),
    other: items.filter((i) => i.date === date && i.type === 'other'),
    gross,
    net: grabNet(gross),
    trips,
    avgNet: trips > 0 ? grabNet(gross / trips) : 0,
    netPerHour: perHour != null ? grabNet(perHour) : null,
    erp: dayRides.reduce((s, r) => s + (Number(r.erp) || 0), 0),
  };
}

// Daily net Grab earnings across a range, for the bar chart.
export function dailyNet(rides, items, start, end) {
  const totals = {};
  for (const it of items) if (it.type === 'earn' && it.date >= start && it.date <= end) totals[it.date] = (totals[it.date] || 0) + (Number(it.amount) || 0);
  for (const r of rides) if (r.date >= start && r.date <= end) totals[r.date] = (totals[r.date] || 0) + (Number(r.amount) || 0);
  const days = [];
  for (let d = asDate(start); d <= asDate(end); d.setDate(d.getDate() + 1)) {
    const ds = fmtDate(d);
    days.push({ date: ds, value: grabNet(totals[ds] || 0) });
  }
  return days;
}

// ── Petrol ──
export const petrolEntries = (items) => items.filter((it) => it.type === 'petrol');

// Grab money that came in between two fills (the fill day up to the day before the next).
function grabEarnedBetween(rides, items, startDate, endDate) {
  let sum = 0;
  for (const r of rides) if (r.date >= startDate && r.date < endDate) sum += Number(r.amount) || 0;
  for (const it of items) if (it.type === 'earn' && it.date >= startDate && it.date < endDate) sum += Number(it.amount) || 0;
  return grabNet(sum);
}

// A "tank" runs from one fill to the next: the litres bought at the first
// carried the car the odometer distance to the second. Needs both odometer
// readings and litres on the first fill.
export function computeFuelCycles(rides, items, entries) {
  const cycles = [];
  for (let i = 1; i < entries.length; i++) {
    const a = entries[i - 1];
    const b = entries[i];
    if (a.odometer == null || b.odometer == null || !(a.litres > 0)) continue;
    const km = b.odometer - a.odometer;
    if (!(km > 0)) continue;
    const earned = grabEarnedBetween(rides, items, a.date, b.date);
    const cost = Number(a.amount) || 0;
    cycles.push({
      from: a.date,
      to: b.date,
      km,
      litres: a.litres,
      cost,
      earned,
      pricePerLitre: cost / a.litres,
      earnPerLitre: earned / a.litres,
      pnlPerLitre: earned / a.litres - cost / a.litres,
    });
  }
  if (!cycles.length) return { cycles: [], fuel: null };
  const sum = (f) => cycles.reduce((t, c) => t + f(c), 0);
  const litres = sum((c) => c.litres);
  const km = sum((c) => c.km);
  const earned = sum((c) => c.earned);
  const cost = sum((c) => c.cost);
  return {
    cycles,
    fuel: {
      litres,
      km,
      earned,
      cost,
      pricePerLitre: cost / litres,
      earnPerLitre: earned / litres,
      pnlPerLitre: earned / litres - cost / litres,
      kmPerLitre: km / litres,
      margin: earned > 0 ? ((earned - cost) / earned) * 100 : null,
    },
  };
}

export function computePetrolStats(rides, items) {
  const entries = petrolEntries(items);
  if (!entries.length) return null;
  let costSum = 0;
  let litreSum = 0;
  for (const e of entries) if (e.litres > 0) {
    costSum += Number(e.amount) || 0;
    litreSum += e.litres;
  }
  let avgSpendPerDay = null;
  if (entries.length > 1) {
    const span = Math.max(1, Math.round((asDate(entries[entries.length - 1].date) - asDate(entries[0].date)) / dayMs));
    avgSpendPerDay = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0) / span;
  }
  const gaps = [];
  for (let i = 1; i < entries.length; i++) {
    const g = Math.round((asDate(entries[i].date) - asDate(entries[i - 1].date)) / dayMs);
    if (g > 0) gaps.push(g);
  }
  const kmGaps = [];
  let prevOdo = null;
  for (const e of entries) {
    if (e.odometer == null) continue;
    if (prevOdo != null && e.odometer - prevOdo > 0) kmGaps.push(e.odometer - prevOdo);
    prevOdo = e.odometer;
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    entries,
    avgPricePerLitre: litreSum > 0 ? costSum / litreSum : null,
    avgSpendPerDay,
    avgDaysBetween: avg(gaps),
    avgKmPerFill: avg(kmGaps),
    ...computeFuelCycles(rides, items, entries),
  };
}

// Petrol burned per hour of driving: tank cost over the hours driven on it.
export function petrolCostPerHour(rides, stats) {
  if (!stats?.cycles?.length) return null;
  let cost = 0;
  let hours = 0;
  for (const c of stats.cycles) {
    const lastDay = fmtDate(new Date(asDate(c.to).getTime() - dayMs));
    const h = driveSpan(rides, c.from, lastDay).hours;
    if (h > 0) {
      cost += c.cost;
      hours += h;
    }
  }
  return hours > 0 ? cost / hours : null;
}

// ── Import from a Body Log backup ({ app: 'body-log', stores: { ... } }) ──
// Only Grab rides and the petrol / other / day-total entries come across.
export function parseBodyLogBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That isn’t a Body Log backup file (it couldn’t be read).');
  }
  const stores = data?.stores || data;
  const rawRides = stores?.['body-log-grab-rides'];
  const rawItems = stores?.['body-log-grab'];
  if (!Array.isArray(rawRides) && !Array.isArray(rawItems)) throw new Error('No Grab data found in that backup.');
  const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const key = (id) => String(id).replace(/[.#$/[\]]/g, '_');
  const rides = {};
  for (const r of rawRides || []) {
    if (!okDate(r?.date) || num(r.amount) == null) continue;
    const time = /^\d{2}:\d{2}/.test(r.time || '') ? r.time.slice(0, 5) : '12:00';
    rides[key(r.id ?? `${r.date}-${time}-${r.amount}`)] = {
      date: r.date,
      time,
      dateTime: r.dateTime || `${r.date}T${time}`,
      amount: num(r.amount),
      ...(num(r.erp) ? { erp: num(r.erp) } : {}),
      ...(r.note ? { note: String(r.note) } : {}),
    };
  }
  const items = {};
  for (const it of rawItems || []) {
    if (!okDate(it?.date) || !['petrol', 'other', 'earn'].includes(it.type)) continue; // swim and anything else stay behind
    const clean = { type: it.type, date: it.date, amount: num(it.amount) || 0 };
    if (it.type === 'petrol') {
      if (num(it.fromGrab) != null) clean.fromGrab = num(it.fromGrab);
      if (num(it.fromSavings) != null) clean.fromSavings = num(it.fromSavings);
      if (num(it.litres)) clean.litres = num(it.litres);
      if (num(it.odometer)) clean.odometer = num(it.odometer);
    } else if (it.type === 'other') {
      clean.category = it.category || 'Other';
      if (it.note) clean.note = String(it.note);
    } else if (num(it.jobs)) clean.jobs = num(it.jobs);
    items[key(it.id ?? `${it.type}-${it.date}-${it.amount}`)] = clean;
  }
  return { rides, items };
}
