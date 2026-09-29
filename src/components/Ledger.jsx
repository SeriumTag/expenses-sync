import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebase';
import { useConnected } from '../hooks/useConnected';
import { PresenceContext, usePresence } from '../hooks/usePresence';
import { BIN_DAYS, addItem, addTab, deleteTab, moveLedgerToBin, renameTab, unlinkLedger } from '../lib/db';
import { PERIODS, formatMoney, sumItems } from '../lib/format';
import { prefs } from '../lib/session';
import { hideSplash } from '../lib/splash';
import { hueFor, partnerColor } from '../lib/theme';
import ImportDialog from './ImportDialog';
import { isStandalone, showInstallPrompt } from './InstallPrompt';
import ItemList from './ItemList';
import LiveInput from './LiveInput';
import { LogoMark, Wordmark } from './Logo';
import ShareDialog from './ShareDialog';
import ThemeDialog from './ThemeDialog';

export default function Ledger({
  ledgerId,
  username,
  theme,
  onThemeChange,
  ledgers,
  onSwitch,
  onCreate,
  onJoin,
  onLogout,
  binCount,
  onOpenBin,
}) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [newTabId, setNewTabId] = useState(null);
  const [focusItemId, setFocusItemId] = useState(null);
  const [dialog, setDialog] = useState(null); // 'share' | 'theme' | 'import' | null
  // Monthly/Yearly display is a personal preference, remembered on this device.
  const [view, setView] = useState(() => (PERIODS[prefs.get('view')] ? prefs.get('view') : 'monthly'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [partnerTheme, setPartnerTheme] = useState(null);
  const presence = usePresence(ledgerId, username);
  const connected = useConnected();

  // One listener for the whole account; Firebase only sends what changed.
  useEffect(() => onValue(ref(db, `ledgers/${ledgerId}`), (snap) => setData(snap.val() || {})), [ledgerId]);
  useEffect(() => {
    if (data) hideSplash();
  }, [data]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const partner = Object.keys(data?.members || {}).find((m) => m !== username) || null;

  useEffect(() => {
    if (!partner) return setPartnerTheme(null);
    return onValue(ref(db, `users/${partner}/theme`), (snap) => setPartnerTheme(snap.val()));
  }, [partner]);

  const pColor = partnerColor(theme, partnerTheme);
  useEffect(() => {
    document.documentElement.style.setProperty('--partner', pColor);
  }, [pColor]);

  const tabs = useMemo(
    () =>
      Object.entries(data?.tabs || {})
        .map(([id, tab]) => ({ id, ...tab }))
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [data?.tabs],
  );
  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0] || null;
  const tabId = currentTab?.id ?? null;

  const { setTab } = presence;
  useEffect(() => setTab(tabId), [tabId, setTab]);

  if (!data) return null; // the splash is still covering the screen

  const meta = data.meta || {};
  const members = Object.keys(data.members || {});

  if (!data.members?.[username]) {
    return (
      <div className="center-screen">
        <div className="card">
          <h2>You no longer have access</h2>
          <p className="muted">This account was deleted or you were removed from it.</p>
          <button className="btn primary" onClick={() => unlinkLedger(username, ledgerId)}>
            OK
          </button>
        </div>
      </div>
    );
  }

  const currency = meta.currency ?? '$';
  const { factor, short } = PERIODS[view];
  const grandTotal = tabs.reduce((sum, t) => sum + sumItems(data.items?.[t.id]), 0) * factor;
  const categories = [
    ...new Set(
      tabs.flatMap((t) => Object.values(data.items?.[t.id] || {}).map((i) => (i.category || '').trim())).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const changeView = (v) => {
    setView(v);
    prefs.set('view', v);
  };
  const itemCount = tabs.reduce((n, t) => n + Object.keys(data.items?.[t.id] || {}).length, 0);
  const partnerOnline = partner ? Boolean(presence.others[partner]) : false;

  function handleAddTab() {
    const id = addTab(ledgerId, 'New tab');
    setActiveTab(id);
    setNewTabId(id);
  }

  function addExpense() {
    let tid = tabId;
    if (!tid) {
      tid = addTab(ledgerId, 'General');
      setActiveTab(tid);
    }
    setFocusItemId(addItem(ledgerId, tid, username));
  }

  function handleDeleteTab() {
    const count = Object.keys(data.items?.[tabId] || {}).length;
    const viewer = Object.entries(presence.others).find(([, o]) => o.tab === tabId)?.[0];
    const warning = [
      `Delete tab "${currentTab.name || 'Untitled'}"${count ? ` and its ${count} expense(s)` : ''}?`,
      viewer ? `${viewer} is viewing this tab right now.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (window.confirm(warning)) deleteTab(ledgerId, tabId);
  }

  function newAccount() {
    setMenuOpen(false);
    const name = window.prompt('Name for the new expense account', 'Shared expenses');
    if (name?.trim()) onCreate(name.trim());
  }

  function binThisAccount() {
    setMenuOpen(false);
    const others = members.filter((m) => m !== username);
    const msg = [
      `Delete “${meta.name || 'Untitled'}”?`,
      others.length ? `${others.join(', ')} will lose access too.` : '',
      `It goes to the bin for ${BIN_DAYS} days, where ${others.length ? 'either of you' : 'you'} can restore it. After that it’s deleted for good.`,
    ]
      .filter(Boolean)
      .join('\n\n');
    if (window.confirm(msg)) {
      setDialog(null);
      moveLedgerToBin(ledgerId, username);
    }
  }

  const openDialog = (name) => {
    setMenuOpen(false);
    setDialog(name);
  };

  return (
    <PresenceContext.Provider value={presence}>
      <div className="app">
        <header className={`nav ${scrolled ? 'solid' : ''}`}>
          <div className="nav-brand">
            <LogoMark size={20} />
            <Wordmark className="hide-sm" />
          </div>

          {ledgers.length > 1 && (
            <label className="account-pill">
              <select value={ledgerId} onChange={(e) => onSwitch(e.target.value)} aria-label="Expense account">
                {ledgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">▾</span>
            </label>
          )}

          <div className="nav-right">
            {partner && (
              <span
                className={`avatar sq ${partnerOnline ? 'online' : ''}`}
                style={{ '--c': 'var(--partner)' }}
                title={`${partner}: ${partnerOnline ? 'online' : 'offline'}`}
              >
                {partner[0].toUpperCase()}
                <span className="dot" />
              </span>
            )}
            <div className="menu-wrap">
              <button className="me-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Profile menu" aria-expanded={menuOpen}>
                <span className={`avatar sq ${connected ? 'online' : ''}`} style={{ '--c': 'var(--accent)' }}>
                  {username[0].toUpperCase()}
                  <span className="dot" />
                </span>
                <span className={`caret ${menuOpen ? 'up' : ''}`}>▾</span>
              </button>
              {menuOpen && (
                <>
                  <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
                  <div className="menu" role="menu">
                    <div className="menu-head">
                      <span className="avatar sq lg" style={{ '--c': 'var(--accent)' }}>
                        {username[0].toUpperCase()}
                      </span>
                      <div>
                        <b>{username}</b>
                        <span className="muted small">Signed in on this device</span>
                      </div>
                    </div>
                    <button role="menuitem" onClick={() => openDialog('theme')}>
                      <span className="menu-swatch" /> Theme colour
                    </button>
                    <button role="menuitem" onClick={() => openDialog('share')}>
                      <span className="menu-ico">⇄</span> Share &amp; sync
                    </button>
                    <button role="menuitem" onClick={newAccount}>
                      <span className="menu-ico">＋</span> New expense account
                    </button>
                    {!isStandalone() && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          showInstallPrompt();
                        }}
                      >
                        <span className="menu-ico">⬇</span> Add to Home Screen
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenBin();
                      }}
                    >
                      <span className="menu-ico">🗑</span> Bin{binCount ? ` (${binCount})` : ''}
                    </button>
                    <button role="menuitem" className="menu-danger" onClick={binThisAccount}>
                      <span className="menu-ico">✕</span> Delete this account
                    </button>
                    <hr />
                    <button role="menuitem" onClick={onLogout}>
                      Sign out of Expense Sync
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {!connected && <div className="banner">You’re offline. Changes are saved and will sync when you reconnect.</div>}

        <section className="hero">
          <div className="hero-bg" aria-hidden="true">
            <LogoMark className="hero-mark" size={360} />
          </div>
          <div className="hero-content">
            <div className="kicker">
              <LogoMark size={14} />
              <span>{partner ? 'Shared account' : 'Personal account'}</span>
            </div>
            <h1 className="hero-title">{meta.name || 'Untitled'}</h1>
            <div className="hero-total">
              {formatMoney(grandTotal, currency)}
              <button className="per" onClick={() => changeView(view === 'monthly' ? 'yearly' : 'monthly')} title="Switch monthly / yearly">
                {short} ⇅
              </button>
            </div>
            <p className="hero-meta">
              <span className="match">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </span>
              <span className="sep" />
              <span>
                {tabs.length} tab{tabs.length === 1 ? '' : 's'}
              </span>
              <span className="sep" />
              {partner ? (
                <span className="nowrap">
                  with <b>{partner}</b>{' '}
                  <span className={`status-pill ${partnerOnline ? 'live' : ''}`}>{partnerOnline ? 'Live' : 'Offline'}</span>
                </span>
              ) : (
                <span>Just you</span>
              )}
            </p>
            <div className="hero-actions">
              <button className="btn play" onClick={addExpense}>
                <span className="play-ico">＋</span> Add expense
              </button>
              <button className="btn glass" onClick={() => setDialog('share')}>
                {members.length > 1 ? '⇄ Synced' : 'Share'}
              </button>
            </div>
          </div>
        </section>

        <section className="row">
          <h2 className="row-title">Your tabs</h2>
          <div className="cards" role="tablist">
            {tabs.map((t) => {
              const viewers = Object.entries(presence.others)
                .filter(([, o]) => o.tab === t.id)
                .map(([u]) => u);
              const count = Object.keys(data.items?.[t.id] || {}).length;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={t.id === tabId}
                  className={`card-tab ${t.id === tabId ? 'active' : ''}`}
                  style={{ '--h': hueFor(t.id) }}
                  onClick={() => setActiveTab(t.id)}
                >
                  <span className="card-count">
                    {count} item{count === 1 ? '' : 's'}
                  </span>
                  {viewers.map((u) => (
                    <span key={u} className="card-viewer" title={`${u} is on this tab`}>
                      {u[0].toUpperCase()}
                    </span>
                  ))}
                  <span className="card-name">{t.name || 'Untitled'}</span>
                  <span className="card-total">
                    {formatMoney(sumItems(data.items?.[t.id]) * factor, currency)}
                    <span className="card-per">{short}</span>
                  </span>
                </button>
              );
            })}
            <button className="card-tab new" onClick={handleAddTab}>
              <span className="plus">＋</span>
              <span>New tab</span>
            </button>
          </div>
        </section>

        {currentTab && (
          <section className="detail">
            <div className="detail-head">
              <LiveInput
                key={tabId}
                className="detail-title"
                fieldKey={`tab:${tabId}:name`}
                value={currentTab.name}
                onSave={(v) => data.tabs?.[tabId] && renameTab(ledgerId, tabId, v)}
                placeholder="Tab name"
                autoFocusOnMount={newTabId === tabId}
              />
              <button className="icon-btn danger" onClick={handleDeleteTab} title="Delete tab" aria-label="Delete tab">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <ItemList
              key={tabId}
              ledgerId={ledgerId}
              tabId={tabId}
              items={data.items?.[tabId]}
              currency={currency}
              username={username}
              focusId={focusItemId}
              categories={categories}
              view={view}
              onViewChange={changeView}
              onAdd={addExpense}
              onImport={() => setDialog('import')}
            />
          </section>
        )}

        {dialog === 'share' && (
          <ShareDialog
            ledgerId={ledgerId}
            meta={meta}
            members={members}
            username={username}
            onJoin={onJoin}
            onDelete={binThisAccount}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'import' && currentTab && (
          <ImportDialog
            ledgerId={ledgerId}
            tabId={tabId}
            tabName={currentTab.name}
            tabs={tabs}
            onImported={(id) => id && setActiveTab(id)}
            username={username}
            currency={currency}
            view={view}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'theme' && <ThemeDialog theme={theme} onChange={onThemeChange} onClose={() => setDialog(null)} />}
      </div>
    </PresenceContext.Provider>
  );
}
