import { useState } from 'react';
import { MONTHS, monthlyOf, sorted } from '../lib/budget';
import { copyItemsToMonth } from '../lib/db';
import { formatMoney } from '../lib/format';
import Modal from './Modal';

const monthName = (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

// Bring items from any other month into this group: tick them, then Copy here
// (new items) or Move here (removed from that month).
export default function BringItemsDialog({ ledgerId, periods, pk, tabId, tabName, currency, username, onClose }) {
  const months = Object.keys(periods || {})
    .filter((k) => /^\d{4}-\d{2}$/.test(k) && k !== pk)
    .sort()
    .reverse();
  const [from, setFrom] = useState(months[0] || '');
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const source = periods?.[from];
  const groups = sorted(source?.tabs).map((t) => ({ ...t, items: sorted(source?.items?.[t.id]) })).filter((g) => g.items.length);
  const toggle = (key) =>
    setPicked((p) => {
      const next = new Set(p);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  async function bring(move) {
    const entries = [...picked].map((k) => {
      const [t, i] = k.split('|');
      return { tabId: t, itemId: i };
    });
    if (!entries.length) return;
    if (move && !window.confirm(`Move ${entries.length} item(s) here? They'll be removed from ${monthName(from)}.`)) return;
    setBusy(true);
    try {
      await copyItemsToMonth(ledgerId, periods, from, entries, pk, tabId, { move, username });
      setDone(`${move ? 'Moved' : 'Copied'} ${entries.length} item${entries.length === 1 ? '' : 's'} from ${monthName(from)} into ${tabName || 'this group'}.`);
      setPicked(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Bring items into ${tabName || 'this group'}`} onClose={onClose}>
      {months.length === 0 ? (
        <p className="muted">There are no other months yet.</p>
      ) : (
        <>
          <label className="field">
            <span>From month</span>
            <select
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPicked(new Set());
                setDone('');
              }}
            >
              {months.map((k) => (
                <option key={k} value={k}>
                  {monthName(k)}
                </option>
              ))}
            </select>
          </label>
          {groups.length === 0 && <p className="muted small">Nothing in {from ? monthName(from) : 'that month'}.</p>}
          {groups.map((g) => (
            <section key={g.id} className="bring-group">
              <h4>{g.name || 'Untitled'}</h4>
              {g.items.map((it) => {
                const key = `${g.id}|${it.id}`;
                return (
                  <label key={key} className="bring-row">
                    <input type="checkbox" className="pick" checked={picked.has(key)} onChange={() => toggle(key)} />
                    <span className="bring-name">{it.name || 'Untitled'}</span>
                    <b>{formatMoney(monthlyOf(it), currency)}</b>
                  </label>
                );
              })}
            </section>
          ))}
          {done && <p className="spend-notice">{done}</p>}
          <div className="stmt-actions">
            <button className="btn glass" disabled={!picked.size || busy} onClick={() => bring(true)}>
              Move here
            </button>
            <button className="btn primary" disabled={!picked.size || busy} onClick={() => bring(false)}>
              Copy {picked.size || ''} here
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
