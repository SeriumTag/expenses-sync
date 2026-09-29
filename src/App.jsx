import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import AccountsDialog from './components/AccountsDialog';
import { BinList } from './components/BinDialog';
import InstallPrompt from './components/InstallPrompt';
import Ledger from './components/Ledger';
import Loading from './components/Loading';
import Login from './components/Login';
import Modal from './components/Modal';
import SetupNotice from './components/SetupNotice';
import { db, ensureAuth, isConfigured } from './firebase';
import { binExpired, createLedger, joinWithCode, loginUser, purgeLedger, unlinkLedger } from './lib/db';
import { cachedTheme, clearSession, loadSession, prefs, rememberProfile, saveSession } from './lib/session';
import { hideSplash } from './lib/splash';
import { DEFAULT_THEME, applyTheme, isHex } from './lib/theme';

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
  const [username, setUsername] = useState(loadSession);
  const [theme, setTheme] = useState(() => (username && cachedTheme(username)) || DEFAULT_THEME);
  const [ledgerIds, setLedgerIds] = useState(null);
  const [metas, setMetas] = useState({}); // ledgerId → meta (null if the account no longer exists)
  const [binOpen, setBinOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [activeId, setActiveId] = useState(() => prefs.get('ledger'));
  const [pendingJoin, setPendingJoin] = useState(takeJoinParam);
  const [joinError, setJoinError] = useState('');
  const creatingDefault = useRef(false);
  const purging = useRef(new Set());

  useLayoutEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    if (!isConfigured) return hideSplash();
    ensureAuth().then(
      () => setAuthReady(true),
      (e) => setFatal(`Could not connect to Firebase: ${e.message}`),
    );
  }, []);

  useEffect(() => {
    if (fatal || (authReady && !username)) hideSplash();
  }, [fatal, authReady, username]);

  useEffect(() => {
    if (!authReady || !username) return;
    setLedgerIds(null);
    return onValue(
      ref(db, `users/${username}/ledgers`),
      (snap) => setLedgerIds(Object.keys(snap.val() || {})),
      (err) => setFatal(`Database error: ${err.message}. Check your database rules.`),
    );
  }, [authReady, username]);

  // Theme is stored on the user so it follows them to other devices.
  useEffect(() => {
    if (!authReady || !username) return;
    return onValue(ref(db, `users/${username}/theme`), (snap) => {
      if (!isHex(snap.val())) return;
      setTheme(snap.val());
      rememberProfile(username, { theme: snap.val() });
    });
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
      onValue(ref(db, `ledgers/${id}/meta`), (snap) => setMetas((prev) => ({ ...prev, [id]: snap.val() }))),
    );
    return () => offs.forEach((off) => off());
  }, [idsKey]);

  const metasReady = Boolean(ledgerIds) && ledgerIds.every((id) => id in metas);
  const activeIds = metasReady ? ledgerIds.filter((id) => metas[id] && !metas[id].deletedAt) : [];
  const binned = metasReady
    ? ledgerIds.filter((id) => metas[id]?.deletedAt).map((id) => ({ id, meta: metas[id] }))
    : [];
  const currentId = activeIds.includes(activeId) ? activeId : (activeIds[0] ?? null);

  // Tidy up: forget links to accounts that no longer exist, and permanently
  // delete accounts that have been in the bin longer than 7 days.
  useEffect(() => {
    if (!metasReady || !username) return;
    for (const id of ledgerIds) {
      if (purging.current.has(id)) continue;
      const meta = metas[id];
      if (meta === null) {
        purging.current.add(id);
        unlinkLedger(username, id).catch(() => {});
      } else if (meta.deletedAt && binExpired(meta.deletedAt)) {
        purging.current.add(id);
        purgeLedger(id).catch(() => purging.current.delete(id));
      }
    }
  }, [metasReady, ledgerIds, metas, username]);

  // Nothing to show but the bin: lift the splash so the "no accounts" screen is visible.
  const onlyBin = metasReady && ledgerIds.length > 0 && activeIds.length === 0;
  useEffect(() => {
    if (onlyBin) hideSplash();
  }, [onlyBin]);
  useEffect(() => {
    if (currentId) prefs.set('ledger', currentId);
  }, [currentId]);

  const handleLogin = async (name) => {
    await loginUser(name);
    saveSession(name);
    rememberProfile(name);
    setTheme(cachedTheme(name) || DEFAULT_THEME);
    setUsername(name);
  };

  const handleLogout = () => {
    clearSession();
    prefs.set('ledger', null);
    setUsername(null);
    setLedgerIds(null);
    setMetas({});
    setBinOpen(false);
    setActiveId(null);
    setTheme(DEFAULT_THEME);
  };

  const handleThemeChange = (hex) => {
    setTheme(hex);
    rememberProfile(username, { theme: hex });
    set(ref(db, `users/${username}/theme`), hex).catch(() => {});
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

  let screen;
  if (!isConfigured) screen = <SetupNotice />;
  else if (fatal)
    screen = (
      <div className="center-screen">
        <div className="card">
          <h2>Something went wrong</h2>
          <p className="error">{fatal}</p>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  else if (!username) screen = <Login onLogin={handleLogin} ready={authReady} pendingJoin={pendingJoin} />;
  else if (onlyBin)
    screen = (
      <div className="center-screen">
        <div className="card no-accounts">
          <h2>No expense accounts</h2>
          <p className="muted">Everything is in the bin. Restore an account, or start a new one.</p>
          <button
            className="btn primary block"
            onClick={() => {
              const name = window.prompt('Name for the new expense account', 'My Expenses');
              if (name?.trim()) handleCreate(name.trim());
            }}
          >
            ＋ New expense account
          </button>
          <h3 className="bin-title">Bin</h3>
          <BinList items={binned} onRestored={setActiveId} />
          <button className="btn ghost block" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
    );
  else if (!currentId)
    screen = (
      <Loading
        label="Loading your expenses…"
        detail={
          !authReady
            ? 'Still connecting to the server.'
            : !ledgerIds
              ? 'Still loading your accounts.'
              : 'Still loading account details.'
        }
        onSignOut={handleLogout}
      />
    );
  else
    screen = (
      <Ledger
        key={currentId}
        ledgerId={currentId}
        username={username}
        theme={theme}
        onThemeChange={handleThemeChange}
        ledgers={activeIds.map((id) => ({ id, name: metas[id]?.name || 'Untitled' }))}
        binCount={binned.length}
        onOpenBin={() => setBinOpen(true)}
        onManageAccounts={() => setAccountsOpen(true)}
        onSwitch={setActiveId}
        onCreate={handleCreate}
        onJoin={handleJoin}
        onLogout={handleLogout}
      />
    );

  return (
    <>
      {screen}

      {pendingJoin && username && currentId && (
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

      {accountsOpen && username && (
        <AccountsDialog
          accounts={activeIds.map((id) => ({ id, name: metas[id]?.name || 'Untitled', owner: metas[id]?.owner }))}
          currentId={currentId}
          username={username}
          binCount={binned.length}
          onOpen={setActiveId}
          onCreate={() => {
            const name = window.prompt('Name for the new expense account', 'Our Expenses');
            if (name?.trim()) handleCreate(name.trim());
          }}
          onOpenBin={() => setBinOpen(true)}
          onClose={() => setAccountsOpen(false)}
        />
      )}

      {binOpen && username && (
        <Modal title="Bin" onClose={() => setBinOpen(false)}>
          <BinList
            items={binned}
            onRestored={(id) => {
              setActiveId(id);
              setBinOpen(false);
            }}
          />
        </Modal>
      )}

      <InstallPrompt />
    </>
  );
}
