import { get, push, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db } from '../firebase';
import { currentMonthKey } from './budget';

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
  const [membersSnap, codeSnap] = await Promise.all([
    get(ref(db, `ledgers/${ledgerId}/members`)),
    get(ref(db, `ledgers/${ledgerId}/meta/code`)),
  ]);
  const patch = { [`ledgers/${ledgerId}`]: null, [`presence/${ledgerId}`]: null };
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

export function deleteTab(base, tabId) {
  return update(ref(db, base), { [`tabs/${tabId}`]: null, [`items/${tabId}`]: null });
}

const blankItem = (username) => ({
  name: '',
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
  set(itemRef, { ...blankItem(username), order }).catch(console.error);
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
      ...blankItem(username),
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

// Merge several items into one item whose parts are the originals.
// Each part keeps its own categories, so category pages can still list it on
// its own; the merged item shows the shared category or "Mixed".
export function mergeItems(base, tabId, rows, name, username) {
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
      };
    }
  });
  const patch = {
    [`items/${tabId}/${key}`]: {
      ...blankItem(username),
      name,
      category: '',
      order: Math.min(...rows.map((r) => r.order || Date.now())),
      parts,
    },
  };
  rows.forEach((r) => (patch[`items/${tabId}/${r.id}`] = null));
  return update(ref(db, base), patch).then(() => key);
}

// Undo a merge: each part becomes an item again.
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
