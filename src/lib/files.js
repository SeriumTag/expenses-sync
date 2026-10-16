import { get, ref, update } from 'firebase/database';
import { db } from '../firebase';
import { newKey } from './db';

// Attachments (photos, PDFs, documents) on items.
//
// - The item keeps a small list: item.files = { fid: { name, type, size, by, at } }.
// - The file itself is stored once, at users/{by}/files/{fid}, and only loaded
//   when someone opens it — so the ledger stays quick to sync.
// - ledgers/{lid}/fileIndex/{fid} = { by, at } lists every file the account
//   has stored. A file no item (in any month, or in the bin) points to any
//   more is cleared out by cleanUpFiles().

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // documents
const IMAGE_MAX_SIDE = 1600; // photos are shrunk to this before upload
const CLEANUP_AFTER_MS = 15 * 60 * 1000; // leave fresh uploads alone

const cache = new Map(); // fid → data URL

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

// Photos: scale down and save as JPEG. Falls back to the original if the
// browser can't decode it.
async function shrinkImage(file) {
  const url = await readAsDataUrl(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs get a white background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL('image/jpeg', 0.82);
    return jpeg.length < url.length ? { data: jpeg, type: 'image/jpeg' } : { data: url, type: file.type };
  } catch {
    return { data: url, type: file.type };
  }
}

const bytesOf = (dataUrl) => Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

// Store a file and attach it to the item at `itemPath` (relative to the ledger).
export async function attachFile(ledgerId, itemPath, file, username) {
  const isImage = file.type.startsWith('image/');
  if (!isImage && file.size > MAX_FILE_BYTES) {
    throw new Error(`“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB. Files can be up to 5 MB.`);
  }
  const { data, type } = isImage ? await shrinkImage(file) : { data: await readAsDataUrl(file), type: file.type };
  if (bytesOf(data) > MAX_FILE_BYTES) throw new Error(`“${file.name}” is too big even after shrinking. Files can be up to 5 MB.`);

  const fid = newKey(`ledgers/${ledgerId}/fileIndex`);
  const at = Date.now();
  let name = file.name || 'Attachment';
  if (isImage && type === 'image/jpeg' && !/\.jpe?g$/i.test(name)) name = name.replace(/\.[^.]+$/, '') + '.jpg';
  const meta = { name, type: type || 'application/octet-stream', size: bytesOf(data), by: username, at };
  // The file first, then the index and the item, so nothing points to a missing file.
  await update(ref(db), {
    [`users/${username}/files/${fid}`]: { data, ledger: ledgerId, name: meta.name, type: meta.type, at },
  });
  await update(ref(db, `ledgers/${ledgerId}`), {
    [`fileIndex/${fid}`]: { by: username, at },
    [`${itemPath}/files/${fid}`]: meta,
  });
  cache.set(fid, data);
  return fid;
}

// The file's data URL (loaded once, then cached for this visit).
export async function loadFile(fid, meta) {
  if (cache.has(fid)) return cache.get(fid);
  const snap = await get(ref(db, `users/${meta.by}/files/${fid}/data`));
  const data = snap.val();
  if (!data) throw new Error('This file is no longer available.');
  cache.set(fid, data);
  return data;
}

export function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const type = head.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export const fileList = (files) =>
  Object.entries(files || {})
    .map(([id, f]) => ({ id, ...f }))
    .sort((a, b) => (a.at || 0) - (b.at || 0));

export function fileSizeLabel(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function fileIcon(type = '', name = '') {
  if (type.startsWith('image/')) return '🖼️';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return '📄';
  if (/sheet|excel|csv/.test(type) || /\.(xlsx?|csv)$/i.test(name)) return '📊';
  if (/word|document/.test(type) || /\.docx?$/i.test(name)) return '📝';
  return '📎';
}

// Every file id still used by an item (and its parts) in any month or in the bin.
function filesInUse(data) {
  const used = new Set();
  const visit = (item) => {
    Object.keys(item?.files || {}).forEach((fid) => used.add(fid));
    Object.values(item?.parts || {}).forEach(visit);
  };
  for (const period of Object.values(data?.periods || {})) {
    for (const tabItems of Object.values(period?.items || {})) Object.values(tabItems || {}).forEach(visit);
  }
  for (const t of Object.values(data?.trash || {})) {
    visit(t.item);
    Object.values(t.items || {}).forEach(visit);
  }
  // Receipts on logged spends (spending/{itemId}/{spendId}/files).
  for (const spends of Object.values(data?.spending || {})) Object.values(spends || {}).forEach(visit);
  return used;
}

// Clear out stored files nothing points to any more (removed attachments,
// items deleted for good). Safe to run from both devices.
export function cleanUpFiles(ledgerId, data) {
  const index = data?.fileIndex;
  if (!index) return null;
  const used = filesInUse(data);
  const patch = {};
  for (const [fid, f] of Object.entries(index)) {
    if (used.has(fid) || Date.now() - (f.at || 0) < CLEANUP_AFTER_MS) continue;
    patch[`ledgers/${ledgerId}/fileIndex/${fid}`] = null;
    if (f.by) patch[`users/${f.by}/files/${fid}`] = null;
    cache.delete(fid);
  }
  return Object.keys(patch).length ? update(ref(db), patch) : null;
}
