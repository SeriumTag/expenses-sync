import { createContext, useContext } from 'react';

// Who may create or rename categories in this account. By default only the
// owner can; everyone else picks from the categories that already exist.
export const CatPermContext = createContext({ canEdit: true, known: [] });
export const useCatPerm = () => useContext(CatPermContext);

export function canEditCategories(meta, username) {
  if (!meta?.owner || meta.anyoneCategories === true) return true;
  return meta.owner === username;
}

// Case-insensitive match against existing names, returning their spelling.
export function matchKnown(name, known) {
  const n = String(name || '').trim().toLowerCase();
  return n ? known.find((k) => k.toLowerCase() === n) || null : null;
}
