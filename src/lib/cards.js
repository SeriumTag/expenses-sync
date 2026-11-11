// Credit cards: what's put on a card is paid when its bill comes, so it counts
// in the month of the bill, not the month it was used.
//
// ledgers/{lid}/cards/{id} = { name, day, person, order }
//   day = the statement day. POSB on the 15th: used 15 Jan – 14 Feb, billed 15 Feb.
//         HSBC on the 1st: used in January, billed 1 Feb.

const pad = (n) => String(n).padStart(2, '0');

export const cardsList = (cards) =>
  Object.entries(cards || {})
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
export const cardsFor = (cards, personId) => cardsList(cards).filter((c) => c.person === personId);

// The month ('YYYY-MM') whose bill a card purchase on `dateStr` lands in.
export function billMonth(dateStr, card) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr || '')) return null;
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7)) - 1;
  const d = Number(dateStr.slice(8, 10));
  const day = Math.min(28, Math.max(1, Number(card?.day) || 1));
  const next = new Date(y, m + (d >= day ? 1 : 0), 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
}

// Which month a dated spend or bill counts in: its bill month when it went on a
// known card, otherwise its own month.
export function countsInMonth(dateStr, cardId, cards) {
  const card = cardId ? cards?.[cardId] : null;
  if (card) return billMonth(dateStr, card);
  return /^\d{4}-\d{2}/.test(dateStr || '') ? dateStr.slice(0, 7) : null;
}

export const ordinalDay = (n) => {
  const d = Number(n) || 1;
  const s = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  return `${d}${s}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = (key) => (key ? MONTHS[Number(key.slice(5, 7)) - 1] : '');
