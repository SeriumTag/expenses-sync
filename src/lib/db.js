import { get, push, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db } from '../firebase';

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
  await update(ref(db), {
    [`ledgers/${ledgerId}/meta`]: { name, owner, code, currency: '$', createdAt: serverTimestamp() },
    [`ledgers/${ledgerId}/members/${owner}`]: Date.now(),
    [`ledgers/${ledgerId}/tabs/${tabId}`]: { name: 'General', order: Date.now() },
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

// Tab and item creators return the new key immediately so the UI can focus it;
// the write itself shows up locally at once and syncs in the background.
export function addTab(ledgerId, name, order = Date.now()) {
  const tabRef = push(ref(db, `ledgers/${ledgerId}/tabs`));
  set(tabRef, { name, order }).catch(console.error);
  return tabRef.key;
}

export function renameTab(ledgerId, tabId, name) {
  return update(ref(db, `ledgers/${ledgerId}/tabs/${tabId}`), { name });
}

export function deleteTab(ledgerId, tabId) {
  return update(ref(db), {
    [`ledgers/${ledgerId}/tabs/${tabId}`]: null,
    [`ledgers/${ledgerId}/items/${tabId}`]: null,
  });
}

// `amount` is always stored per month; the Monthly/Yearly switch only changes
// how it's shown and typed.
export function addItem(ledgerId, tabId, username) {
  const itemRef = push(ref(db, `ledgers/${ledgerId}/items/${tabId}`));
  set(itemRef, {
    name: '',
    amount: 0,
    category: '',
    note: '',
    order: Date.now(),
    updatedBy: username,
    updatedAt: serverTimestamp(),
  }).catch(console.error);
  return itemRef.key;
}

// Adds many rows in one write (used by "Paste from sheet").
export function addItems(ledgerId, tabId, username, rows) {
  const base = Date.now();
  const patch = {};
  rows.forEach((row, i) => {
    const key = push(ref(db, `ledgers/${ledgerId}/items/${tabId}`)).key;
    patch[`ledgers/${ledgerId}/items/${tabId}/${key}`] = {
      name: row.name,
      amount: row.amount,
      category: row.category || '',
      note: row.note || '',
      order: base + i,
      updatedBy: username,
      updatedAt: serverTimestamp(),
    };
  });
  return update(ref(db), patch);
}

export function updateItemField(ledgerId, tabId, itemId, field, value, username) {
  return update(ref(db, `ledgers/${ledgerId}/items/${tabId}/${itemId}`), {
    [field]: value,
    updatedBy: username,
    updatedAt: serverTimestamp(),
  });
}

export function deleteItem(ledgerId, tabId, itemId) {
  return set(ref(db, `ledgers/${ledgerId}/items/${tabId}/${itemId}`), null);
}
