import { patchPath, setPath } from './db';

// Icons a favourite category can use.
export const ICONS = [
  '⭐', '🛡️', '🚗', '⛽', '🏠', '💡', '🌐', '📱',
  '💰', '🏦', '💳', '💵', '🛒', '🍽️', '☕', '🍼',
  '👶', '🎓', '🩺', '💊', '✈️', '🚌', '🎬', '🎮',
  '🐾', '🎁', '👕', '💇', '🏋️', '🧾', '🔧', '❤️',
];

const HINTS = [
  [/insur|policy|aia|prudential|tm life/i, '🛡️'],
  [/car|vehicle|parking|road/i, '🚗'],
  [/petrol|fuel|gas/i, '⛽'],
  [/home|house|rent|mortgage|town council/i, '🏠'],
  [/util|electric|water|sp service/i, '💡'],
  [/internet|wifi|broadband/i, '🌐'],
  [/phone|mobile|gomo|giga/i, '📱'],
  [/sav|invest/i, '💰'],
  [/bank|loan/i, '🏦'],
  [/allowance|pocket|cash/i, '💵'],
  [/grocer|market|shop/i, '🛒'],
  [/food|meal|lunch|dinner|eat/i, '🍽️'],
  [/kid|child|baby|school/i, '👶'],
  [/educat|tuition|class|lesson/i, '🎓'],
  [/medic|health|hospital|clinic|medisave/i, '🩺'],
  [/travel|holiday|flight|trip/i, '✈️'],
  [/transport|bus|mrt|ezlink|grab/i, '🚌'],
  [/subscri|netflix|spotify|disney|stream/i, '🎬'],
  [/pet|dog|cat\b/i, '🐾'],
  [/gift|present/i, '🎁'],
];

export const suggestIcon = (label) => HINTS.find(([re]) => re.test(label || ''))?.[1] || '⭐';

// Favourites are personal: users/{username}/favs/{ledgerId}/{categoryKey}
const favPath = (username, ledgerId, key) => `users/${username}/favs/${ledgerId}/${key}`;
export const saveFav = (username, ledgerId, key, label, icon) =>
  patchPath(favPath(username, ledgerId, key), { label, icon, order: Date.now() });
export const setFavIcon = (username, ledgerId, key, icon) => patchPath(favPath(username, ledgerId, key), { icon });
export const removeFav = (username, ledgerId, key) => setPath(favPath(username, ledgerId, key), null);
