import { useState } from 'react';
import { monthlyOf, periodLabel } from '../lib/budget';
import { BIN_DAYS, binDaysLeft, purgeTrashed, restoreTrashed } from '../lib/db';
import { formatMoney } from '../lib/format';
import Modal from './Modal';

// Deleted items of this account (kept 7 days), plus a way to the account bin.
export default function ItemBin({ ledgerId, trash, currency, accountBinCount, onOpenAccountBin, onRestored, onClose }) {
  const [busy, setBusy] = useState(null);
  const entries = Object.entries(trash || {})
    .map(([id, t]) => ({ id, ...t }))
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

  async function restore(e) {
    setBusy(e.id);
    await restoreTrashed(ledgerId, e.id, e);
    setBusy(null);
    onRestored?.(e);
  }

  async function purge(e) {
    if (!window.confirm(`Delete “${e.item?.name || 'this item'}” forever? This can’t be undone.`)) return;
    setBusy(e.id);
    await purgeTrashed(ledgerId, [e.id]);
    setBusy(null);
  }

  return (
    <Modal title="Bin" onClose={onClose}>
      <h3>Deleted items</h3>
      {entries.length === 0 ? (
        <p className="muted bin-empty">No deleted items.</p>
      ) : (
        <div className="bin-list">
          {entries.map((e) => {
            const left = binDaysLeft(e.deletedAt || Date.now());
            return (
              <div key={e.id} className="bin-row">
                <div className="bin-info">
                  <b>{e.item?.name || 'Untitled'}</b>
                  <span className="muted small">
                    {e.tabName || 'Head category'} · {periodLabel(e.periodKey)} · {formatMoney(monthlyOf(e.item), currency)}/mo
                  </span>
                  <span className="muted small">
                    Deleted by {e.deletedBy || 'someone'} ·{' '}
                    <span className={left <= 1 ? 'bin-soon' : ''}>{left <= 1 ? 'gone within a day' : `${left} days left`}</span>
                  </span>
                </div>
                <button className="btn sm primary" disabled={busy === e.id} onClick={() => restore(e)}>
                  Restore
                </button>
                <button className="btn sm danger" disabled={busy === e.id} onClick={() => purge(e)}>
                  Delete forever
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small bin-note">Deleted items are removed for good after {BIN_DAYS} days.</p>
      <button
        className="btn ghost sm"
        onClick={() => {
          onClose();
          onOpenAccountBin();
        }}
      >
        Deleted accounts{accountBinCount ? ` (${accountBinCount})` : ''} ›
      </button>
    </Modal>
  );
}
