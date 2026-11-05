import { createContext, useContext } from 'react';

// The plush friends from the design's banner (public/friends/, made by
// scripts/extract-friends.mjs). Each person picks one to greet them.
export const FRIENDS = [
  { key: 'duffy', name: 'Duffy' },
  { key: 'shelliemay', name: 'ShellieMay' },
  { key: 'gelatoni', name: 'Gelatoni' },
  { key: 'stellalou', name: 'StellaLou' },
  { key: 'cookieann', name: 'CookieAnn' },
  { key: 'linabell', name: 'LinaBell' },
  { key: 'olumel', name: "'Olu Mel" },
].map((f) => ({ ...f, src: `/friends/${f.key}.webp` }));

export const DEFAULT_MASCOT = 'duffy';
export const isMascot = (key) => FRIENDS.some((f) => f.key === key);
export const friendOf = (key) => FRIENDS.find((f) => f.key === key) || FRIENDS[0];

// { friend, onPick } — the signed-in person's character, and a way to open the picker.
export const MascotContext = createContext({ friend: FRIENDS[0], onPick: null });
export const useMascot = () => useContext(MascotContext);
