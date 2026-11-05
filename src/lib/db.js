import { get, push, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db } from '../firebase';
import { continuesInto, currentMonthKey, isYearKey, itemCats, monthlyOf, recurOf } from './budget';

/*
 * Data layout (Firebase Realtime Database)
 *
 * users/{username}/ledgers/{ledgerId}: true
 * codes/{CODE}: ledgerId
 * ledgers/{ledgerId}/meta:    { name, owner, partner, code, currency, createdAt }
 * ledgers/{ledgerId}/members: { username: joinedAt }   (only owner + partner, enforced by rules)
 * ledgers/{ledgerId}/tabs/{tabId}: { name, order }
 * ledgers/{ledgerId}/items/{tabId}/{itemId}: { name, amount (per month), category, note, order, updatedBy, updatedAt }
 * presence/{ledgerId}/{username}/{connectionId}: { tab, editing, since, at }
 *
 * Every edit writes only the single field that changed, so two people editing
 * different fields never overwrite each other.
 */

export const MAX_MEMBERS = 2;
export const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
export const normalizeUsername = (s) => s.trim().toLowerCase();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I lookalikes

function randomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

async function reserveCode(ledgerId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const result = await runTransaction(ref(db, `codes/${code}`), (current) =>
      current === null ? ledgerId : undefined,
    );
    if (result.committed) return code;
  }
  throw new Error('Could not generate a share code, please try again.');
}

export async function loginUser(username) {
  const createdRef = ref(db, `users/${username}/createdAt`);
  const snap = await get(createdRef);
  if (!snap.exists()) await set(createdRef, serverTimestamp());
}

export async function createLedger(owner, name) {
  const ledgerId = push(ref(db, 'ledgers')).key;
  const code = await reserveCode(ledgerId);
  const tabId = push(ref(db, `ledgers/${ledgerId}/tabs`)).key;
  const month = currentMonthKey();
  await update(ref(db), {
    [`ledgers/${ledgerId}/meta`]: { name, owner, code, currency: '$', createdAt: serverTimestamp() },
    [`ledgers/${ledgerId}/members/${owner}`]: Date.now(),
    [`ledgers/${ledgerId}/periods/${month}`]: { createdAt: Date.now(), tabs: { [tabId]: { name: 'General', order: Date.now() } } },
    [`users/${owner}/ledgers/${ledgerId}`]: true,
  });
  return ledgerId;
}

export async function joinWithCode(username, rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) throw new Error('That code doesn’t look right.');

  const codeSnap = await get(ref(db, `codes/${code}`));
  if (!codeSnap.exists()) throw new Error('No shared account found for that code.');
  const ledgerId = codeSnap.val();

  const metaSnap = await get(ref(db, `ledgers/${ledgerId}/meta`));
  if (!metaSnap.exists()) throw new Error('That shared account no longer exists.');
  if (metaSnap.child('deletedAt').exists()) throw new Error('That account is in the bin. Ask someone in it to restore it first.');

  if (metaSnap.child('owner').val() !== username) {
    // Each account has one partner slot. The transaction makes sure two people
    // can't both take it at the same moment; the rules also refuse to overwrite it.
    let taken = false;
    await runTransaction(ref(db, `ledgers/${ledgerId}/meta/partner`), (partner) => {
      taken = false;
      if (partner === username) return; // already the partner, nothing to write
      if (partner) {
        taken = true;
        return;
      }
      return username;
    });
    if (taken) throw new Error(`This account is already shared by ${MAX_MEMBERS} people.`);
  }

  await update(ref(db), {
    [`ledgers/${ledgerId}/members/${username}`]: Date.now(),
    [`users/${username}/ledgers/${ledgerId}`]: true,
  });
  return ledgerId;
}

// Only the partner is ever removed (the owner can't leave their own account),
// so this also frees the partner slot.
export function removeMember(ledgerId, username) {
  return update(ref(db), {
    [`ledgers/${ledgerId}/members/${username}`]: null,
    [`ledgers/${ledgerId}/meta/partner`]: null,
    [`users/${username}/ledgers/${ledgerId}`]: null,
  });
}

export function unlinkLedger(username, ledgerId) {
  return set(ref(db, `users/${username}/ledgers/${ledgerId}`), null);
}

export async function rotateCode(ledgerId, oldCode) {
  const code = await reserveCode(ledgerId);
  await update(ref(db), {
    [`ledgers/${ledgerId}/meta/code`]: code,
    ...(oldCode ? { [`codes/${oldCode}`]: null } : {}),
  });
  return code;
}

// ── Bin ──────────────────────────────────────────────────────────────
// A deleted account is only marked (meta.deletedAt), so either member can
// restore it. After BIN_DAYS it's removed for good the next time either of
// them opens the app (there's no server to do it on a timer).
export const BIN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function binDaysLeft(deletedAt) {
  // Capped at BIN_DAYS: the server clock can be a little ahead of this device's.
  return Math.min(BIN_DAYS, Math.max(0, Math.ceil((deletedAt + BIN_DAYS * DAY_MS - Date.now()) / DAY_MS)));
}
export const binExpired = (deletedAt) => Date.now() >= deletedAt + BIN_DAYS * DAY_MS;

export function moveLedgerToBin(ledgerId, username) {
  return update(ref(db, `ledgers/${ledgerId}/meta`), { deletedAt: serverTimestamp(), deletedBy: username });
}

export function restoreLedger(ledgerId) {
  return update(ref(db, `ledgers/${ledgerId}/meta`), { deletedAt: null, deletedBy: null });
}

export async function purgeLedger(ledgerId) {
  const [membersSnap, codeSnap, filesSnap] = await Promise.all([
    get(ref(db, `ledgers/${ledgerId}/members`)),
    get(ref(db, `ledgers/${ledgerId}/meta/code`)),
    get(ref(db, `ledgers/${ledgerId}/fileIndex`)),
  ]);
  const patch = { [`ledgers/${ledgerId}`]: null, [`presence/${ledgerId}`]: null };
  // Attached files are stored under whoever added them; they go too.
  Object.entries(filesSnap.val() || {}).forEach(([fid, f]) => f?.by && (patch[`users/${f.by}/files/${fid}`] = null));
  if (codeSnap.val()) patch[`codes/${codeSnap.val()}`] = null;
  Object.keys(membersSnap.val() || {}).forEach((m) => (patch[`users/${m}/ledgers/${ledgerId}`] = null));
  return update(ref(db), patch);
}

export function updateMeta(ledgerId, patch) {
  return update(ref(db, `ledgers/${ledgerId}/meta`), patch);
}

// ── Budget data (inside a period) ────────────────────────────────────
// `base` is a period's path: ledgers/{ledgerId}/periods/{"2026-09" | "2026"}.
// Tab and item creators return the new key immediately so the UI can focus it;
// the write shows up locally at once and syncs in the background.
export const periodPath = (ledgerId, periodKey) => `ledgers/${ledgerId}/periods/${periodKey}`;

export const patchPath = (path, value) => update(ref(db, path), value);
export const setPath = (path, value) => set(ref(db, path), value);
export const newKey = (path) => push(ref(db, path)).key;

export function addTab(base, name, order = Date.now()) {
  const tabRef = push(ref(db, `${base}/tabs`));
  set(tabRef, { name, order }).catch(console.error);
  return tabRef.key;
}

export function renameTab(base, tabId, name) {
  return update(ref(db, `${base}/tabs/${tabId}`), { name });
}

// A group's character (a plush friend key, or null for none): this month and
// the later months that already have the group, so it stays the same going forward.
export function setTabFriend(ledgerId, periods, pk, tabId, friend) {
  const patch = {};
  for (const [key, p] of Object.entries(periods || {})) {
    if (key >= pk && key.length === pk.length && p?.tabs?.[tabId]) patch[`periods/${key}/tabs/${tabId}/friend`] = friend || null;
  }
  return update(ref(db, `ledgers/${ledgerId}`), patch);
}

export function deleteTab(base, tabId) {
  return update(ref(db, base), { [`tabs/${tabId}`]: null, [`items/${tabId}`]: null });
}

// The date an item is recorded with: today, or the 1st of the month (or
// year) being shown when that isn't now. It's only a record; totals ignore it.
const todayKey = () => new Date().toLocaleDateString('en-CA');
export function itemDateFor(base) {
  const pk = String(base).split('/').pop();
  const today = todayKey();
  if (!/^\d{4}(-\d{2})?$/.test(pk) || today.startsWith(pk)) return today;
  return pk.length === 4 ? `${pk}-01-01` : `${pk}-01`;
}

const blankItem = (username, date = todayKey()) => ({
  name: '',
  date,
  amount: 0,
  freq: 'monthly',
  category: '',
  note: '',
  order: Date.now(),
  updatedBy: username,
  updatedAt: serverTimestamp(),
});

export function addItem(base, tabId, username, order = Date.now()) {
  const itemRef = push(ref(db, `${base}/items/${tabId}`));
  const startMonth = String(base).split('/').pop();
  set(itemRef, { ...blankItem(username, itemDateFor(base)), recur: 'monthly', startMonth, order }).catch(console.error);
  return itemRef.key;
}

// Copy items (merged ones keep their parts); each copy sits right after its
// original. `orders` maps original id → the copy's order. Returns the new ids.
export function duplicateItems(base, tabId, rows, orders, username) {
  const patch = {};
  const ids = rows.map((row) => {
    const key = push(ref(db, `${base}/items/${tabId}`)).key;
    const { id, updatedAt, updatedBy, ...rest } = row;
    patch[`items/${tabId}/${key}`] = {
      ...rest,
      name: `${row.name || 'Item'} (copy)`,
      order: orders[id],
      track: null,
      updatedBy: username,
      updatedAt: serverTimestamp(),
    };
    return key;
  });
  return update(ref(db, base), patch).then(() => ids);
}

// Order values for items inserted directly after `id` in a tab.
export function ordersAfter(items, ids) {
  const list = Object.entries(items || {})
    .map(([id, it]) => ({ id, order: it.order || 0 }))
    .sort((a, b) => a.order - b.order);
  const out = {};
  for (const id of ids) {
    const i = list.findIndex((x) => x.id === id);
    const here = list[i]?.order ?? Date.now();
    const next = list[i + 1]?.order;
    out[id] = next === undefined ? here + 1 : here + (next - here) / 2;
  }
  return out;
}

export const topOrder = (items) => Math.min(Date.now(), ...Object.values(items || {}).map((i) => i.order || 0)) - 1;

// Adds many rows in one write (used by "Paste from sheet").
export function addItems(base, tabId, username, rows, freq = 'monthly') {
  const start = Date.now();
  const patch = {};
  rows.forEach((row, i) => {
    const key = push(ref(db, `${base}/items/${tabId}`)).key;
    patch[`items/${tabId}/${key}`] = {
      ...blankItem(username, itemDateFor(base)),
      name: row.name,
      amount: row.amount,
      freq,
      category: row.category || '',
      note: row.note || '',
      order: start + i,
    };
  });
  return update(ref(db, base), patch);
}

export function updateItemField(base, tabId, itemId, field, value, username) {
  return update(ref(db, `${base}/items/${tabId}/${itemId}`), {
    [field]: value,
    updatedBy: username,
    updatedAt: serverTimestamp(),
  });
}

export function deleteItem(base, tabId, itemId) {
  return set(ref(db, `${base}/items/${tabId}/${itemId}`), null);
}

// ── Item bin ─────────────────────────────────────────────────────────
// Deleted items are kept at ledgers/{id}/trash for BIN_DAYS with enough
// context (month, head category) to put them back where they were.
const trashEntry = (item, itemId, periodKey, tab, username) => ({
  item,
  itemId,
  periodKey,
  tabId: tab.id,
  tabName: tab.name || '',
  tabOrder: tab.order ?? null,
  deletedAt: serverTimestamp(),
  deletedBy: username,
});

export function trashItem(ledgerId, periodKey, tab, itemId, item, username) {
  const trashId = push(ref(db, `ledgers/${ledgerId}/trash`)).key;
  return update(ref(db, `ledgers/${ledgerId}`), {
    [`periods/${periodKey}/items/${tab.id}/${itemId}`]: null,
    [`trash/${trashId}`]: trashEntry(item, itemId, periodKey, tab, username),
  }).then(() => trashId);
}

// Deleting a head category puts each of its items in the bin; restoring one
// brings the head category back too.
export function trashTab(ledgerId, periodKey, tab, items, username) {
  const patch = {
    [`periods/${periodKey}/tabs/${tab.id}`]: null,
    [`periods/${periodKey}/items/${tab.id}`]: null,
  };
  for (const [itemId, item] of Object.entries(items || {})) {
    patch[`trash/${push(ref(db, `ledgers/${ledgerId}/trash`)).key}`] = trashEntry(item, itemId, periodKey, tab, username);
  }
  return update(ref(db, `ledgers/${ledgerId}`), patch);
}

export async function restoreTrashed(ledgerId, trashId, entry) {
  const tabPath = `periods/${entry.periodKey}/tabs/${entry.tabId}`;
  const patch = {
    [`trash/${trashId}`]: null,
    [`periods/${entry.periodKey}/items/${entry.tabId}/${entry.itemId}`]: entry.item,
  };
  const tabSnap = await get(ref(db, `ledgers/${ledgerId}/${tabPath}`));
  if (!tabSnap.exists()) patch[tabPath] = { name: entry.tabName || 'Restored', order: entry.tabOrder ?? Date.now() };
  return update(ref(db, `ledgers/${ledgerId}`), patch);
}

export function purgeTrashed(ledgerId, trashIds) {
  const patch = {};
  trashIds.forEach((id) => (patch[id] = null));
  return update(ref(db, `ledgers/${ledgerId}/trash`), patch);
}

// Merge several items into one item whose parts are the originals.
// Each part keeps its own categories, so category pages can still list it on
// its own; the merged item shows the shared category or "Mixed".
export function mergeItems(base, tabId, rows, name, username, forward) {
  const key = push(ref(db, `${base}/items/${tabId}`)).key;
  const parts = {};
  rows.forEach((r, i) => {
    if (r.parts) {
      // Merging a merged item: bring its parts along.
      Object.entries(r.parts).forEach(([pid, p], j) => {
        parts[pid] = { ...p, category: p.category ?? r.category ?? '', order: i + j / 100 };
      });
    } else {
      parts[r.id] = {
        name: r.name || '',
        amount: Number(r.amount) || 0,
        freq: r.freq || 'monthly',
        note: r.note || '',
        category: r.category || '',
        order: i,
        ...(r.files ? { files: r.files } : {}), // attachments stay with their part
      };
    }
  });
  // Attachments on merged items being merged again move to the new item.
  const files = Object.assign({}, ...rows.filter((r) => r.parts && r.files).map((r) => r.files));
  const patch = {
    [`items/${tabId}/${key}`]: {
      ...blankItem(username),
      name,
      category: '',
      order: Math.min(...rows.map((r) => r.order || Date.now())),
      ...(Object.keys(files).length ? { files } : {}),
      parts,
    },
  };
  rows.forEach((r) => (patch[`items/${tabId}/${r.id}`] = null));
  return update(ref(db, base), patch)
    .then(() => forward && mergeForward(forward, rows, key, patch[`items/${tabId}/${key}`]))
    .then(() => key);
}

// Undo a merge: each part becomes an item again.
// ── Moving things between groups, items and spends ──────────────────
const withoutId = ({ id, ...rest }) => rest; // eslint-disable-line no-unused-vars

// Move an item to another group (same month). It keeps its id, so its
// savings log, spends and attachments stay linked.
export function moveItem(base, fromTab, toTab, itemId, item, order = Date.now()) {
  if (fromTab === toTab) return Promise.resolve();
  return update(ref(db, base), {
    [`items/${fromTab}/${itemId}`]: null,
    [`items/${toTab}/${itemId}`]: { ...withoutId(item), order },
  });
}

// Turn an item into a spend under a budget, e.g. "Mummy" into a Credit Card
// spend. Its date, amount, categories and attachments come along.
export function itemToSpend(ledgerId, periodKey, tabId, itemId, item, budgetId, username) {
  const spendId = newKey(`ledgers/${ledgerId}/spending/${budgetId}`);
  const amount = item.parts ? Math.round(monthlyOf(item) * 100) / 100 : Number(item.amount) || 0;
  return update(ref(db, `ledgers/${ledgerId}`), {
    [`periods/${periodKey}/items/${tabId}/${itemId}`]: null,
    [`spending/${budgetId}/${spendId}`]: {
      date: item.date || new Date().toLocaleDateString('en-CA'),
      note: item.name || null,
      amount,
      category: itemCats(item).join(', ') || null,
      files: item.files || null,
      by: username || null,
      at: Date.now(),
    },
  });
}

// Turn a spend into its own item (bill, spending budget or savings) in a
// group of the month being shown.
export function spendToItem(ledgerId, periodKey, budgetId, spendId, spend, tabId, kind, username, order = Date.now()) {
  const itemId = newKey(`ledgers/${ledgerId}/periods/${periodKey}/items/${tabId}`);
  return update(ref(db, `ledgers/${ledgerId}`), {
    [`spending/${budgetId}/${spendId}`]: null,
    [`periods/${periodKey}/items/${tabId}/${itemId}`]: {
      ...blankItem(username, spend.date || undefined),
      name: spend.note || '',
      amount: Number(spend.amount) || 0,
      category: spend.category || '',
      files: spend.files || null,
      budget: kind === 'budget' || null,
      track: kind === 'savings' || null,
      order,
    },
  }).then(() => itemId);
}

export function splitItem(base, tabId, itemId, item, username) {
  const patch = { [`items/${tabId}/${itemId}`]: null };
  Object.entries(item.parts || {}).forEach(([pid, p], i) => {
    patch[`items/${tabId}/${pid}`] = {
      ...blankItem(username),
      name: p.name || '',
      amount: Number(p.amount) || 0,
      freq: p.freq || 'monthly',
      note: p.note || '',
      category: p.category ?? item.category ?? '',
      order: (item.order || Date.now()) + i,
    };
    // Each part keeps its attachments; the merged item's own go to the first.
    const files = { ...(i === 0 ? item.files : null), ...p.files };
    if (Object.keys(files).length) patch[`items/${tabId}/${pid}`].files = files;
  });
  return update(ref(db, base), patch);
}

// Put items in a new order (ids in the order they should appear).
export function reorderItems(base, tabId, ids) {
  const patch = {};
  ids.forEach((id, i) => (patch[`items/${tabId}/${id}/order`] = (i + 1) * 1000));
  return update(ref(db, base), patch);
}

// The order of entries on a category page is kept with the category.
export function reorderCategoryEntries(ledgerId, catKeyValue, ids) {
  const patch = {};
  ids.forEach((id, i) => (patch[`entries/${id}/order`] = (i + 1) * 1000));
  return update(ref(db, `ledgers/${ledgerId}/categories/${catKeyValue}`), patch);
}

// Move one id up (-1) or down (+1) in a list; returns the new list of ids.
export function moved(ids, id, dir) {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Copy a whole period (head categories, items, salaries) to other periods.
// Keys are kept so items can be compared and tracked across periods.
export function copyPeriod(ledgerId, period, targetKeys) {
  const { tabs = null, items = null, people = null } = period || {};
  const patch = {};
  for (const k of targetKeys) patch[`ledgers/${ledgerId}/periods/${k}`] = { tabs, items, people, createdAt: Date.now() };
  return update(ref(db), patch);
}

export function startEmptyPeriod(ledgerId, periodKey) {
  const tabKey = push(ref(db, `ledgers/${ledgerId}/periods/${periodKey}/tabs`)).key;
  return set(ref(db, `ledgers/${ledgerId}/periods/${periodKey}`), {
    createdAt: Date.now(),
    tabs: { [tabKey]: { name: 'General', order: Date.now() } },
  });
}

export function deletePeriod(ledgerId, periodKey) {
  return set(ref(db, `ledgers/${ledgerId}/periods/${periodKey}`), null);
}

// Accounts made before months existed kept tabs/items at the top level.
// Move them into a period; old amounts were monthly.
export function migrateToPeriod(ledgerId, data, periodKey) {
  const items = {};
  for (const [tabId, tabItems] of Object.entries(data.items || {})) {
    items[tabId] = {};
    for (const [id, it] of Object.entries(tabItems || {})) {
      const { date, ...rest } = it;
      items[tabId][id] = { freq: 'monthly', ...rest };
    }
  }
  return update(ref(db, `ledgers/${ledgerId}`), {
    [`periods/${periodKey}`]: { tabs: data.tabs || null, items, createdAt: Date.now() },
    tabs: null,
    items: null,
  });
}

// ── Recurring items across months ────────────────────────────────────
// Every month is stored on its own; an item keeps the same id in each month it
// appears in, which is what links a recurring item from month to month.

const monthKeysOf = (periods) => Object.keys(periods || {}).filter((k) => !isYearKey(k)).sort();
const laterMonths = (periods, pk) => (isYearKey(pk) ? [] : monthKeysOf(periods).filter((k) => k > pk));
const tabOf = (period, itemId) => Object.entries(period?.items || {}).find(([, list]) => list?.[itemId])?.[0];

// The same day of the month, in month `key` (the 31st becomes the 30th, 28th…).
export function dateIn(date, key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || isYearKey(key)) return date || null;
  const last = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
  return `${key}-${String(Math.min(Number(date.slice(8, 10)), last)).padStart(2, '0')}`;
}
// An item as it appears in month `key`: its date moved to that month.
const itemIn = (it, key) => (it?.date ? { ...it, date: dateIn(it.date, key) } : it);

// Apply a { 'a/b': value } patch to a copy of an object (null removes).
function applyPatch(obj, patch) {
  const out = JSON.parse(JSON.stringify(obj || {}));
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split('/');
    let node = out;
    keys.slice(0, -1).forEach((k) => (node = node[k] && typeof node[k] === 'object' ? node[k] : (node[k] = {})));
    const last = keys[keys.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = value;
  }
  return out;
}

// A new month, built from the latest earlier month: its groups and income, every
// item that carries on into it, and yearly items from the same month in earlier
// years. One-time and ended items stay behind. Returns null when there's no
// earlier month to build from.
export function buildPeriod(periods, key) {
  if (isYearKey(key)) return null;
  const earlier = monthKeysOf(periods).filter((k) => k < key);
  const fromKey = earlier[earlier.length - 1];
  if (!fromKey) return null;
  const from = periods[fromKey];
  const tabs = { ...(from.tabs || {}) };
  const items = {};
  const put = (tid, id, it) => ((items[tid] = items[tid] || {})[id] = it);
  for (const [tid, list] of Object.entries(from.items || {})) {
    for (const [id, it] of Object.entries(list || {})) if (continuesInto(it, fromKey, key)) put(tid, id, itemIn(it, key));
  }
  // Yearly items live only in their own month: look back at earlier years.
  for (const k of earlier) {
    if (k.slice(5, 7) !== key.slice(5, 7)) continue;
    for (const [tid, list] of Object.entries(periods[k]?.items || {})) {
      for (const [id, it] of Object.entries(list || {})) {
        if (recurOf(it) !== 'yearly' || !continuesInto(it, k, key)) continue;
        put(tid, id, itemIn(it, key));
        if (!tabs[tid]) tabs[tid] = periods[k].tabs?.[tid] || { name: 'Yearly', order: Date.now() };
      }
    }
  }
  return { tabs, items, people: from.people || null, createdAt: Date.now(), builtFrom: fromKey };
}

// Create a month that doesn't exist yet from the months before it. A
// transaction, so two phones opening the same new month don't both write it.
export async function ensurePeriod(ledgerId, periods, key) {
  if (periods?.[key]) return true;
  const data = buildPeriod(periods, key);
  if (!data) return false;
  await runTransaction(ref(db, `ledgers/${ledgerId}/periods/${key}`), (current) => (current === null ? data : undefined));
  return true;
}

// Save fields of an item in this month and, if it recurs, in every later month
// it belongs in (earlier months keep their values as history). Later months
// that already exist but don't have it yet get it too — so an item added (or
// made recurring) in November also shows in a December that's already set up.
// A date keeps its day and moves into each month (repeats on the 14th, etc.).
// patch: { field: value } — nested fields like 'parts/abc/amount' work too.
export function saveItemForward(ledgerId, periods, pk, tabId, itemId, patch, username) {
  const out = {};
  const add = (k, t) => {
    for (const [field, value] of Object.entries(patch)) {
      out[`periods/${k}/items/${t}/${itemId}/${field}`] = field === 'date' && k !== pk ? dateIn(value, k) : value;
    }
    out[`periods/${k}/items/${t}/${itemId}/updatedBy`] = username || null;
  };
  add(pk, tabId);
  const current = periods?.[pk]?.items?.[tabId]?.[itemId];
  if (!current || isYearKey(pk)) return update(ref(db, `ledgers/${ledgerId}`), out);
  const next = applyPatch(current, patch); // the item as it will be after this change
  if (recurOf(next) !== 'once') {
    for (const k of laterMonths(periods, pk)) {
      const t = tabOf(periods[k], itemId);
      if (t) add(k, t);
      else if (continuesInto(next, pk, k)) {
        // Not there yet: add the whole item (in the same group, made if missing).
        if (!periods[k].tabs?.[tabId]) out[`periods/${k}/tabs/${tabId}`] = periods[pk].tabs?.[tabId] || { name: 'General', order: Date.now() };
        out[`periods/${k}/items/${tabId}/${itemId}`] = { ...itemIn(next, k), updatedBy: username || null };
      }
    }
  }
  return update(ref(db, `ledgers/${ledgerId}`), out);
}

// The months after `pk` that already have this item.
export const laterCopies = (periods, pk, itemId) => laterMonths(periods, pk).filter((k) => tabOf(periods[k], itemId));

// Remove an item from the months after `pk` (it stays in `pk` and earlier).
export function removeFromLater(ledgerId, periods, pk, itemId) {
  const out = {};
  for (const k of laterMonths(periods, pk)) {
    const t = tabOf(periods[k], itemId);
    if (t) out[`periods/${k}/items/${t}/${itemId}`] = null;
  }
  return Object.keys(out).length ? update(ref(db, `ledgers/${ledgerId}`), out) : Promise.resolve();
}

// Set (or clear, with null) the last month an item appears in. Copies after
// that month are removed; the others remember the end so it isn't rebuilt.
export function setEndMonth(ledgerId, periods, itemId, endMonth) {
  const out = {};
  for (const k of monthKeysOf(periods)) {
    const t = tabOf(periods[k], itemId);
    if (!t) continue;
    if (endMonth && k > endMonth) out[`periods/${k}/items/${t}/${itemId}`] = null;
    else out[`periods/${k}/items/${t}/${itemId}/endMonth`] = endMonth || null;
  }
  return update(ref(db, `ledgers/${ledgerId}`), out);
}

// Combining carries forward: in each later month that still has the items
// being combined (all monthly), they're replaced by the combined item, made of
// that month's own versions of them.
function mergeForward({ ledgerId, periods, pk }, rows, key, head) {
  if (!periods || rows.some((r) => recurOf(r) !== 'monthly')) return null;
  const out = {};
  for (const k of laterMonths(periods, pk)) {
    const found = rows.map((r) => ({ r, t: tabOf(periods[k], r.id) })).filter((x) => x.t);
    if (!found.length) continue;
    const parts = {};
    found.forEach(({ r, t }, i) => {
      const it = periods[k].items[t][r.id];
      if (it.parts) Object.entries(it.parts).forEach(([pid, p], j) => (parts[pid] = { ...p, order: i + j / 100 }));
      else
        parts[r.id] = {
          name: it.name || '',
          amount: Number(it.amount) || 0,
          freq: it.freq || 'monthly',
          note: it.note || '',
          category: it.category || '',
          order: i,
          ...(it.files ? { files: it.files } : {}),
        };
      out[`periods/${k}/items/${t}/${r.id}`] = null;
    });
    out[`periods/${k}/items/${found[0].t}/${key}`] = { ...head, parts };
  }
  return Object.keys(out).length ? update(ref(db, `ledgers/${ledgerId}`), out) : null;
}

// Copy (or move) items from one month into another month's group. Copies are
// new, independent items. Moving removes them from the first month only.
// entries: [{ tabId, itemId }]; toTabId: a group in the target month, or null
// to use the group with the same name there (created if missing).
export async function copyItemsToMonth(ledgerId, periods, fromKey, entries, toKey, toTabId, { move = false, username } = {}) {
  if (!periods?.[toKey]) await ensurePeriod(ledgerId, periods, toKey);
  const target = (await get(ref(db, `ledgers/${ledgerId}/periods/${toKey}`))).val() || {};
  const out = {};
  const tabsByName = new Map(Object.entries(target.tabs || {}).map(([id, t]) => [String(t.name || '').toLowerCase(), id]));
  const newTabs = new Map();
  let order = Date.now();
  for (const { tabId, itemId } of entries) {
    const it = periods?.[fromKey]?.items?.[tabId]?.[itemId];
    if (!it) continue;
    let tid = toTabId;
    if (!tid) {
      const name = periods[fromKey].tabs?.[tabId]?.name || 'General';
      tid = tabsByName.get(name.toLowerCase()) || newTabs.get(name.toLowerCase());
      if (!tid) {
        tid = newKey(`ledgers/${ledgerId}/periods/${toKey}/tabs`);
        newTabs.set(name.toLowerCase(), tid);
        out[`periods/${toKey}/tabs/${tid}`] = { name, order: Date.now() };
      }
    }
    const id = newKey(`ledgers/${ledgerId}/periods/${toKey}/items/${tid}`);
    const { pauses, endMonth, ...rest } = it; // eslint-disable-line no-unused-vars
    out[`periods/${toKey}/items/${tid}/${id}`] = { ...rest, startMonth: toKey, order: order++, updatedBy: username || null };
    if (move) out[`periods/${fromKey}/items/${tabId}/${itemId}`] = null;
  }
  return update(ref(db, `ledgers/${ledgerId}`), out);
}
