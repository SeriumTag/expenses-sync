import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import InstallPrompt from './components/InstallPrompt';
import Ledger from './components/Ledger';
import Login from './components/Login';
import Modal from './components/Modal';
import SetupNotice from './components/SetupNotice';
import { db, ensureAuth, isConfigured } from './firebase';
import { createLedger, joinWithCode, loginUser } from './lib/db';
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
  const [names, setNames] = useState({});
  const [activeId, setActiveId] = useState(() => prefs.get('ledger'));
  const [pendingJoin, setPendingJoin] = useState(takeJoinParam);
  const [joinError, setJoinError] = useState('');
  const creatingDefault = useRef(false);

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
      onValue(ref(db, `ledgers/${id}/meta/name`), (snap) =>
        setNames((prev) => ({ ...prev, [id]: snap.val() || 'Untitled' })),
      ),
    );
    return () => offs.forEach((off) => off());
  }, [idsKey]);

  const currentId = ledgerIds?.includes(activeId) ? activeId : (ledgerIds?.[0] ?? null);
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
    setNames({});
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
  else if (!currentId) screen = null; // splash still showing
  else
    screen = (
      <Ledger
        key={currentId}
        ledgerId={currentId}
        username={username}
        theme={theme}
        onThemeChange={handleThemeChange}
        ledgers={ledgerIds.map((id) => ({ id, name: names[id] || '…' }))}
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

      <InstallPrompt />
    </>
  );
}
