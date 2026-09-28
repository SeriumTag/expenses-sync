import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebase';
import { useConnected } from '../hooks/useConnected';
import { PresenceContext, usePresence } from '../hooks/usePresence';
import { addTab, deleteTab, renameTab, unlinkLedger } from '../lib/db';
import { formatMoney, sumItems } from '../lib/format';
import ItemList from './ItemList';
import LiveInput from './LiveInput';
import ShareDialog from './ShareDialog';

export default function Ledger({ ledgerId, username, ledgers, onSwitch, onCreate, onJoin, onLogout }) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [newTabId, setNewTabId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const presence = usePresence(ledgerId, username);
  const connected = useConnected();

  // One listener for the whole account; Firebase only sends what changed.
  useEffect(() => onValue(ref(db, `ledgers/${ledgerId}`), (snap) => setData(snap.val() || {})), [ledgerId]);

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

  if (!data) return <div className="center-screen muted">Loading…</div>;

  const meta = data.meta || {};
  const members = Object.keys(data.members || {}).sort((a, b) =>
    a === meta.owner ? -1 : b === meta.owner ? 1 : 0,
  );

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
  const grandTotal = tabs.reduce((sum, t) => sum + sumItems(data.items?.[t.id]), 0);

  function handleAddTab() {
    const id = addTab(ledgerId, 'New tab');
    setActiveTab(id);
    setNewTabId(id);
  }

  function handleDeleteTab() {
    const count = Object.keys(data.items?.[tabId] || {}).length;
    const viewer = Object.entries(presence.others).find(([, o]) => o.tab === tabId)?.[0];
    const warning = [
      `Delete tab "${currentTab.name || 'Untitled'}"${count ? ` and its ${count} item(s)` : ''}?`,
      viewer ? `${viewer} is viewing this tab right now.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (window.confirm(warning)) deleteTab(ledgerId, tabId);
  }

  function handleSelectLedger(value) {
    if (value !== '__new') return onSwitch(value);
    const name = window.prompt('Name for the new expense account', 'Shared expenses');
    if (name?.trim()) onCreate(name.trim());
  }

  return (
    <PresenceContext.Provider value={presence}>
      <div className="app">
        <header className="topbar">
          <span className="logo-sm">💸</span>
          <select
            className="ledger-select"
            value={ledgerId}
            onChange={(e) => handleSelectLedger(e.target.value)}
            aria-label="Expense account"
          >
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="__new">+ New account…</option>
          </select>

          <div className="people">
            {members.map((m) => {
              const isMe = m === username;
              const online = isMe ? connected : Boolean(presence.others[m]);
              return (
                <span
                  key={m}
                  className={`person ${online ? 'online' : ''}`}
                  style={{ '--c': presence.colorFor(m) }}
                  title={`${m}${isMe ? ' (you)' : ''}: ${online ? 'online' : 'offline'}`}
                >
                  <span className="avatar">
                    {m[0].toUpperCase()}
                    <span className="dot" />
                  </span>
                  <span className="pname">{isMe ? 'You' : m}</span>
                </span>
              );
            })}
          </div>

          <div className="topbar-actions">
            <button className="btn primary sm" onClick={() => setShareOpen(true)}>
              {members.length > 1 ? 'Synced' : 'Share'}
            </button>
            <button className="btn ghost sm" onClick={onLogout} title={`Logged in as ${username}`}>
              Log out
            </button>
          </div>
        </header>

        {!connected && <div className="banner">You’re offline. Changes are saved and will sync when you reconnect.</div>}

        <nav className="tabs" aria-label="Tabs">
          {tabs.map((t) => {
            const viewers = Object.entries(presence.others)
              .filter(([, o]) => o.tab === t.id)
              .map(([u]) => u);
            return (
              <button
                key={t.id}
                className={`tab ${t.id === tabId ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                <span className="tab-name">{t.name || 'Untitled'}</span>
                <span className="tab-total">{formatMoney(sumItems(data.items?.[t.id]), currency)}</span>
                {viewers.map((u) => (
                  <span
                    key={u}
                    className="viewer-dot"
                    style={{ '--c': presence.colorFor(u) }}
                    title={`${u} is on this tab`}
                  />
                ))}
              </button>
            );
          })}
          <button className="tab add" onClick={handleAddTab}>
            + Tab
          </button>
        </nav>

        <main>
          {currentTab ? (
            <section className="panel">
              <div className="panel-head">
                <LiveInput
                  key={tabId}
                  className="tab-title"
                  fieldKey={`tab:${tabId}:name`}
                  value={currentTab.name}
                  onSave={(v) => data.tabs?.[tabId] && renameTab(ledgerId, tabId, v)}
                  placeholder="Tab name"
                  autoFocusOnMount={newTabId === tabId}
                />
                <button className="icon-btn danger" onClick={handleDeleteTab} title="Delete tab" aria-label="Delete tab">
                  🗑
                </button>
              </div>
              <ItemList
                key={tabId}
                ledgerId={ledgerId}
                tabId={tabId}
                items={data.items?.[tabId]}
                currency={currency}
                username={username}
              />
            </section>
          ) : (
            <div className="panel empty">
              <p className="muted">No tabs yet.</p>
              <button className="btn primary" onClick={handleAddTab}>
                Create your first tab
              </button>
            </div>
          )}

          <footer className="grand">
            <span>All tabs total</span>
            <b>{formatMoney(grandTotal, currency)}</b>
          </footer>
        </main>

        {shareOpen && (
          <ShareDialog
            ledgerId={ledgerId}
            meta={meta}
            members={members}
            username={username}
            onJoin={onJoin}
            onClose={() => setShareOpen(false)}
          />
        )}
      </div>
    </PresenceContext.Provider>
  );
}
