import { useState } from 'react';
import { BIN_DAYS, binDaysLeft, purgeLedger, restoreLedger } from '../lib/db';

// List of deleted accounts with Restore / Delete forever. Used in a modal and
// on the "no accounts" screen.
export function BinList({ items, onRestored }) {
  const [busy, setBusy] = useState(null);

  if (!items.length) return <p className="muted bin-empty">The bin is empty.</p>;

  return (
    <div className="bin-list">
      {items.map(({ id, meta }) => {
        const left = binDaysLeft(meta.deletedAt || Date.now());
        return (
          <div key={id} className="bin-row">
            <div className="bin-info">
              <b>{meta.name || 'Untitled'}</b>
              <span className="muted small">
                Deleted by {meta.deletedBy || 'someone'} ·{' '}
                <span className={left <= 1 ? 'bin-soon' : ''}>
                  {left <= 1 ? 'deleted for good within a day' : `${left} days left`}
                </span>
              </span>
            </div>
            <button
              className="btn sm primary"
              disabled={busy === id}
              onClick={async () => {
                setBusy(id);
                await restoreLedger(id);
                setBusy(null);
                onRestored?.(id);
              }}
            >
              Restore
            </button>
            <button
              className="btn sm danger"
              disabled={busy === id}
              onClick={async () => {
                if (!window.confirm(`Delete “${meta.name || 'Untitled'}” forever? This can’t be undone, for you or anyone it’s shared with.`)) return;
                setBusy(id);
                await purgeLedger(id);
                setBusy(null);
              }}
            >
              Delete forever
            </button>
          </div>
        );
      })}
      <p className="muted small">Accounts in the bin are deleted for good after {BIN_DAYS} days.</p>
    </div>
  );
}
