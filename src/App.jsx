import { useCallback, useEffect, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import Ledger from './components/Ledger';
import Login from './components/Login';
import Modal from './components/Modal';
import SetupNotice from './components/SetupNotice';
import { db, ensureAuth, isConfigured } from './firebase';
import { createLedger, joinWithCode, loginUser } from './lib/db';

const LS_USER = 'expense-sync:user';
const LS_LEDGER = 'expense-sync:ledger';

const storage = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
  del: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  },
};

// A scanned QR / shared link opens the app as /?join=CODE. Take the code and
// tidy the address bar.
function takeJoinParam() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('join');
  if (code) {
    url.searchParams.delete('join');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  return code ? code.toUpperCase() : null;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [username, setUsername] = useState(() => storage.get(LS_USER));
  const [ledgerIds, setLedgerIds] = useState(null);
  const [names, setNames] = useState({});
  const [activeId, setActiveId] = useState(() => storage.get(LS_LEDGER));
  const [pendingJoin, setPendingJoin] = useState(takeJoinParam);
  const [joinError, setJoinError] = useState('');
  const creatingDefault = useRef(false);

  useEffect(() => {
    if (!isConfigured) return;
    ensureAuth().then(
      () => setAuthReady(true),
      (e) => setFatal(`Could not connect to Firebase: ${e.message}`),
    );
  }, []);

  useEffect(() => {
    if (!authReady || !username) return;
    setLedgerIds(null);
    return onValue(
      ref(db, `users/${username}/ledgers`),
      (snap) => setLedgerIds(Object.keys(snap.val() || {})),
      (err) => setFatal(`Database error: ${err.message}. Check your database rules.`),
    );
  }, [authReady, username]);

  // Everyone always has at least one account (first login, or after leaving the only one).
  useEffect(() => {
    if (!username || !ledgerIds || ledgerIds.length > 0 || creatingDefault.current) return;
    creatingDefault.current = true;
    createLedger(username, 'My Expenses')
      .catch((e) => setFatal(e.message))
      .finally(() => (creatingDefault.current = false));
  }, [username, ledgerIds]);

  const idsKey = ledgerIds?.join(',') ?? '';
  useEffect(() => {
    if (!idsKey) return;
    const offs = idsKey.split(',').map((id) =>
      onValue(ref(db, `ledgers/${id}/meta/name`), (snap) =>
        setNames((prev) => ({ ...prev, [id]: snap.val() || 'Untitled' })),
      ),
    );
    return () => offs.forEach((off) => off());
  }, [idsKey]);

  const currentId = ledgerIds?.includes(activeId) ? activeId : (ledgerIds?.[0] ?? null);
  useEffect(() => {
    if (currentId) storage.set(LS_LEDGER, currentId);
  }, [currentId]);

  const handleLogin = async (name) => {
    await loginUser(name);
    storage.set(LS_USER, name);
    setUsername(name);
  };

  const handleLogout = () => {
    storage.del(LS_USER);
    storage.del(LS_LEDGER);
    setUsername(null);
    setLedgerIds(null);
    setNames({});
    setActiveId(null);
  };

  const handleJoin = useCallback(
    async (code) => {
      const id = await joinWithCode(username, code);
      setActiveId(id);
    },
    [username],
  );

  const handleCreate = async (name) => {
    setActiveId(await createLedger(username, name));
  };

  if (!isConfigured) return <SetupNotice />;
  if (fatal)
    return (
      <div className="center-screen">
        <div className="card">
          <h2>Something went wrong</h2>
          <p className="error">{fatal}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  if (!username) return <Login onLogin={handleLogin} ready={authReady} pendingJoin={pendingJoin} />;
  if (!currentId) return <div className="center-screen muted">Loading your expenses…</div>;

  return (
    <>
      <Ledger
        key={currentId}
        ledgerId={currentId}
        username={username}
        ledgers={ledgerIds.map((id) => ({ id, name: names[id] || '…' }))}
        onSwitch={setActiveId}
        onCreate={handleCreate}
        onJoin={handleJoin}
        onLogout={handleLogout}
      />

      {pendingJoin && (
        <Modal title="Join shared account" onClose={() => setPendingJoin(null)}>
          <p>
            Join the expense account shared with code <b className="code-inline">{pendingJoin}</b>?
          </p>
          {joinError && <p className="error">{joinError}</p>}
          <div className="row-gap end">
            <button className="btn ghost" onClick={() => setPendingJoin(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  await handleJoin(pendingJoin);
                  setPendingJoin(null);
                } catch (e) {
                  setJoinError(e.message);
                }
              }}
            >
              Join
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
