import { BIN_DAYS, moveLedgerToBin } from '../lib/db';
import Modal from './Modal';

// Every expense account this user belongs to, with Open and Delete.
export default function AccountsDialog({ accounts, currentId, username, binCount, onOpen, onCreate, onOpenBin, onClose }) {
  function remove(account) {
    const msg = [
      `Delete “${account.name}”?`,
      'Anyone it’s shared with loses access too.',
      `It goes to the bin for ${BIN_DAYS} days, where it can be restored. After that it’s deleted for good.`,
    ].join('\n\n');
    if (window.confirm(msg)) moveLedgerToBin(account.id, username);
  }

  return (
    <Modal title="Your expense accounts" onClose={onClose}>
      <div className="acct-list">
        {accounts.map((a) => (
          <div key={a.id} className={`acct-row ${a.id === currentId ? 'current' : ''}`}>
            <div className="acct-info">
              <b>{a.name}</b>
              <span className="muted small">
                {a.id === currentId ? 'Open now' : a.owner === username ? 'Created by you' : `Shared by ${a.owner || 'someone'}`}
              </span>
            </div>
            {a.id !== currentId && (
              <button
                className="btn glass sm"
                onClick={() => {
                  onOpen(a.id);
                  onClose();
                }}
              >
                Open
              </button>
            )}
            <button className="btn danger sm" onClick={() => remove(a)}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="row-gap between acct-actions">
        <button className="btn primary sm" onClick={onCreate}>
          ＋ New account
        </button>
        <button
          className="btn ghost sm"
          onClick={() => {
            onClose();
            onOpenBin();
          }}
        >
          🗑 Bin{binCount ? ` (${binCount})` : ''}
        </button>
      </div>
    </Modal>
  );
}
