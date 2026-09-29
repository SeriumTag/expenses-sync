import { useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebase';
import { useConnected } from '../hooks/useConnected';
import { PresenceContext, usePresence } from '../hooks/usePresence';
import {
  FREQS,
  categoriesIn,
  tabInView,
  yearOf,
  currentMonthKey,
  inView,
  periodLabel,
  previousPeriod,
  shortPeriodLabel,
  sorted,
  setAsideTab,
  sumTab,
} from '../lib/budget';
import {
  BIN_DAYS,
  addItem,
  topOrder,
  addTab,
  deleteTab,
  migrateToPeriod,
  startEmptyPeriod,
  moveLedgerToBin,
  periodPath,
  renameTab,
  unlinkLedger,
} from '../lib/db';
import { removeFav, saveFav, setFavIcon, suggestIcon } from '../lib/favs';
import { formatMoney } from '../lib/format';
import { prefs } from '../lib/session';
import { hideSplash } from '../lib/splash';
import { hueFor, partnerColor } from '../lib/theme';
import { CategoriesSheet, CategoryPage } from './CategoryPage';
import ImportDialog from './ImportDialog';
import ItemList from './ItemList';
import IconPicker from './IconPicker';
import ItemSheet from './ItemSheet';
import LiveInput from './LiveInput';
import { LogoMark } from './Logo';
import NavBar from './NavBar';
import PeriodSheet from './PeriodSheet';
import { PersonSheet, SalaryStrip } from './SalaryStrip';
import ShareDialog from './ShareDialog';
import ThemeDialog from './ThemeDialog';

export default function Ledger({ ledgerId, username, theme, onThemeChange, ledgers, onSwitch, onCreate, onJoin, onLogout, binCount, onOpenBin, onManageAccounts }) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [newTabId, setNewTabId] = useState(null);
  const [focusItemId, setFocusItemId] = useState(null);
  const [dialog, setDialog] = useState(null); // 'share' | 'theme' | 'import' | 'period' | 'categories'
  const [sheet, setSheet] = useState(null); // { type: 'item', tabId, itemId } | { type: 'person', id }
  const [catView, setCatView] = useState(null); // category key being viewed
  const [periodPref, setPeriodPref] = useState(() => prefs.get(`period:${ledgerId}`));
  // Monthly/Yearly display is a personal preference, remembered on this device.
  const [view, setView] = useState(() => (FREQS[prefs.get('view')] ? prefs.get('view') : 'monthly'));
  const [scrolled, setScrolled] = useState(false);
  const [partnerTheme, setPartnerTheme] = useState(null);
  const [favs, setFavs] = useState(null); // this user's favourite categories: key → { label, icon, order }
  const [iconPick, setIconPick] = useState(null); // { key, label } while choosing a favourite's icon
  const migrating = useRef(false);
  const presence = usePresence(ledgerId, username);
  const connected = useConnected();

  // One listener for the whole account; Firebase only sends what changed.
  useEffect(() => onValue(ref(db, `ledgers/${ledgerId}`), (snap) => setData(snap.val() || {})), [ledgerId]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Accounts from before months existed: move their data into this month.
  // Every account needs at least one period. Older accounts either kept their
  // data at the top level (move it into this month) or are empty (start this month).
  useEffect(() => {
    if (!data || data.periods || migrating.current) return;
    if (!data.meta || !data.members?.[username]) return; // deleted, or no longer a member
    migrating.current = true;
    const job =
      data.tabs || data.items ? migrateToPeriod(ledgerId, data, currentMonthKey()) : startEmptyPeriod(ledgerId, currentMonthKey());
    job.catch(console.error).finally(() => (migrating.current = false));
  }, [data, ledgerId, username]);

  const partner = Object.keys(data?.members || {}).find((m) => m !== username) || null;
  useEffect(() => {
    if (!partner) return setPartnerTheme(null);
    return onValue(ref(db, `users/${partner}/theme`), (snap) => setPartnerTheme(snap.val()));
  }, [partner]);
  // Favourites are personal, so they live under the user, per account.
  useEffect(
    () => onValue(ref(db, `users/${username}/favs/${ledgerId}`), (snap) => setFavs(snap.val())),
    [username, ledgerId],
  );

  const pColor = partnerColor(theme, partnerTheme);
  useEffect(() => {
    document.documentElement.style.setProperty('--partner', pColor);
  }, [pColor]);

  // Which period is showing: the saved choice, else this month, else the latest.
  const periods = data?.periods || {};
  const periodKeys = Object.keys(periods);
  const pk = periods[periodPref] ? periodPref : periods[currentMonthKey()] ? currentMonthKey() : periodKeys.sort().at(-1) || null;
  const period = pk ? periods[pk] : null;
  const base = pk ? periodPath(ledgerId, pk) : null;
  const prevKey = pk ? previousPeriod(pk, periodKeys) : null;
  const prevPeriod = prevKey ? periods[prevKey] : null;

  const tabs = useMemo(() => sorted(period?.tabs), [period?.tabs]);
  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0] || null;
  const tabId = currentTab?.id ?? null;

  const { setTab } = presence;
  useEffect(() => setTab(pk && tabId ? `${pk}:${tabId}` : null), [pk, tabId, setTab]);

  const noAccess = Boolean(data) && !data.members?.[username];
  useEffect(() => {
    if (data && (pk || noAccess)) hideSplash();
  }, [data, pk, noAccess]);

  if (!data) return null; // the splash is still covering the screen

  const meta = data.meta || {};
  const members = Object.keys(data.members || {});
  if (noAccess) {
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

  if (!pk) return <div className="center-screen muted">Setting up {meta.name || 'this account'}…</div>;

  const currency = meta.currency ?? '$';
  const budgetCtx = { year: yearOf(pk), tracks: data.tracks, periods };
  const categoryList = categoriesIn(period, view, budgetCtx);
  const categoryNames = categoryList.map((c) => c.label);
  const grandTotal = tabs.reduce((sum, t) => sum + tabInView(period.items?.[t.id], view, budgetCtx), 0);
  const itemCount = tabs.reduce((n, t) => n + Object.keys(period.items?.[t.id] || {}).length, 0);
  const totalSetAside = tabs.reduce((sum, t) => sum + setAsideTab(period.items?.[t.id]), 0);
  const partnerOnline = partner ? Boolean(presence.others[partner]) : false;
  const prevLabel = prevKey ? shortPeriodLabel(prevKey) : '';

  const changeView = (v) => {
    setView(v);
    prefs.set('view', v);
  };
  const selectPeriod = (k) => {
    setPeriodPref(k);
    prefs.set(`period:${ledgerId}`, k);
    setCatView(null);
  };
  const openItem = (tid, iid) => setSheet({ type: 'item', tabId: tid, itemId: iid });

  function handleAddTab() {
    const id = addTab(base, 'New head category');
    setActiveTab(id);
    setNewTabId(id);
  }

  function addExpense() {
    let tid = tabId;
    if (!tid) {
      tid = addTab(base, 'General');
      setActiveTab(tid);
    }
    setCatView(null);
    // New items go to the top of the list, where the Add button is.
    setFocusItemId(addItem(base, tid, username, topOrder(period.items?.[tid])));
  }

  function handleDeleteTab() {
    const count = Object.keys(period.items?.[tabId] || {}).length;
    const viewer = Object.entries(presence.others).find(([, o]) => o.tab === `${pk}:${tabId}`)?.[0];
    const warning = [
      `Delete “${currentTab.name || 'Untitled'}” from ${periodLabel(pk)}${count ? ` with its ${count} item(s)` : ''}?`,
      viewer ? `${viewer} is viewing it right now.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (window.confirm(warning)) deleteTab(base, tabId);
  }

  function newAccount() {
    const name = window.prompt('Name for the new expense account', 'Shared expenses');
    if (name?.trim()) onCreate(name.trim());
  }

  function binThisAccount() {
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

  const sheetItem = sheet?.type === 'item' ? period.items?.[sheet.tabId]?.[sheet.itemId] : null;
  const sheetPerson = sheet?.type === 'person' ? period.people?.[sheet.id] : null;
  const openCategory = (key) => {
    setDialog(null);
    setCatView(key);
    window.scrollTo(0, 0);
  };
  const catLabel = catView ? favs?.[catView]?.label || categoryList.find((c) => c.key === catView)?.label || data.categories?.[catView]?.label || catView : null;

  return (
    <PresenceContext.Provider value={presence}>
      <div className="app">
        <NavBar
          scrolled={scrolled}
          ledgers={ledgers}
          ledgerId={ledgerId}
          onSwitch={onSwitch}
          partner={partner}
          partnerOnline={partnerOnline}
          username={username}
          connected={connected}
          binCount={binCount}
          onTheme={() => setDialog('theme')}
          onShare={() => setDialog('share')}
          onNewAccount={newAccount}
          onManageAccounts={onManageAccounts}
          onOpenBin={onOpenBin}
          onDeleteAccount={binThisAccount}
          onLogout={onLogout}
        />

        {!connected && <div className="banner">You’re offline. Changes are saved and will sync when you reconnect.</div>}

        {catView ? (
          <CategoryPage
            ledgerId={ledgerId}
            pk={pk}
            period={period}
            periods={periods}
            catKeyValue={catView}
            label={catLabel}
            catData={data.categories?.[catView]}
            tracks={data.tracks}
            currency={currency}
            view={view}
            onViewChange={changeView}
            ctx={budgetCtx}
            onBack={() => setCatView(null)}
            fav={favs?.[catView]}
            onFav={() => setIconPick({ key: catView, label: catLabel })}
            onOpenItem={openItem}
          />
        ) : (
          <>
            <section className="hero">
              <div className="hero-bg" aria-hidden="true">
                <LogoMark className="hero-mark" size={360} />
              </div>
              <div className="hero-content">
                <button className="period-chip" onClick={() => setDialog('period')}>
                  <LogoMark size={12} />
                  {periodLabel(pk)} <span aria-hidden="true">▾</span>
                </button>
                <h1 className="hero-title">{meta.name || 'Untitled'}</h1>
                <div className="hero-total">
                  {formatMoney(grandTotal, currency)}
                  <button className="per" onClick={() => changeView(view === 'monthly' ? 'yearly' : 'monthly')} title="Switch monthly / yearly">
                    {FREQS[view].short} ⇅
                  </button>
                </div>
                <p className="hero-meta">
                  <span className="match">
                    {itemCount} item{itemCount === 1 ? '' : 's'}
                  </span>
                  <span className="sep" />
                  <span>
                    {tabs.length} head categor{tabs.length === 1 ? 'y' : 'ies'}
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
                {totalSetAside > 0 && (
                  <p className="hero-setaside" title="All yearly bills, spread over 12 months">
                    Set aside for yearly bills <b>{formatMoney(totalSetAside, currency)}/mo</b>
                  </p>
                )}
                <div className="hero-actions">
                  <button className="btn play" onClick={addExpense}>
                    <span className="play-ico">＋</span> Add expense
                  </button>
                  <button className="btn glass" onClick={() => setDialog('share')}>
                    {members.length > 1 ? '⇄ Synced' : 'Share'}
                  </button>
                  {categoryList.length > 0 && (
                    <button className="btn glass icon-only" onClick={() => setDialog('categories')} title="Categories" aria-label="Categories">
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                        <path
                          d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="count-dot">{categoryList.length}</span>
                    </button>
                  )}
                </div>
                {favs && Object.keys(favs).length > 0 && (
                  <div className="fav-row" aria-label="Favourite categories">
                    {sorted(favs).map((f) => (
                      <button key={f.id} className="fav-pill" onClick={() => openCategory(f.id)} aria-label={`Open ${f.label}`}>
                        <span className="fav-icon">{f.icon}</span>
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
                <SalaryStrip base={base} period={period} currency={currency} view={view} ctx={budgetCtx} onOpen={(id) => setSheet({ type: 'person', id })} />
              </div>
            </section>

            <section className="row">
              <h2 className="row-title">Head categories</h2>
              <div className="cards" role="tablist">
                {tabs.map((t) => {
                  const viewers = Object.entries(presence.others)
                    .filter(([, o]) => o.tab === `${pk}:${t.id}`)
                    .map(([u]) => u);
                  const count = Object.keys(period.items?.[t.id] || {}).length;
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
                        <span key={u} className="card-viewer" title={`${u} is here`}>
                          {u[0].toUpperCase()}
                        </span>
                      ))}
                      <span className="card-name">{t.name || 'Untitled'}</span>
                      <span className="card-total">
                        {formatMoney(tabInView(period.items?.[t.id], view, budgetCtx), currency)}
                        <span className="card-per">{FREQS[view].short}</span>
                      </span>
                    </button>
                  );
                })}
                <button className="card-tab new" onClick={handleAddTab}>
                  <span className="plus">＋</span>
                  <span>New head category</span>
                </button>
              </div>
            </section>

            {currentTab && (
              <section className="detail">
                <div className="detail-head">
                  <LiveInput
                    key={`${pk}:${tabId}`}
                    className="detail-title"
                    fieldKey={`${pk}:tab:${tabId}:name`}
                    value={currentTab.name}
                    onSave={(v) => period.tabs?.[tabId] && renameTab(base, tabId, v)}
                    placeholder="Head category name"
                    autoFocusOnMount={newTabId === tabId}
                  />
                  <button className="icon-btn danger" onClick={handleDeleteTab} title="Delete head category" aria-label="Delete head category">
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
                {prevKey && (
                  <p className="compare-note muted small">
                    Changes are highlighted compared with <b>{periodLabel(prevKey)}</b>.
                  </p>
                )}
                <ItemList
                  key={`${pk}:${tabId}`}
                  base={base}
                  pk={pk}
                  tabId={tabId}
                  items={period.items?.[tabId]}
                  prevPeriod={prevPeriod}
                  prevLabel={prevLabel}
                  categories={categoryNames}
                  currency={currency}
                  username={username}
                  focusId={focusItemId}
                  view={view}
                  onViewChange={changeView}
                  onAdd={addExpense}
                  onImport={() => setDialog('import')}
                  onOpenItem={openItem}
                  ctx={budgetCtx}
                />
              </section>
            )}
          </>
        )}

        {sheetItem && (
          <ItemSheet
            key={sheet.itemId}
            ledgerId={ledgerId}
            base={base}
            pk={pk}
            tabId={sheet.tabId}
            tabName={period.tabs?.[sheet.tabId]?.name}
            itemId={sheet.itemId}
            item={sheetItem}
            periods={periods}
            prevPeriod={prevPeriod}
            prevLabel={prevLabel}
            tracks={data.tracks}
            categories={categoryNames}
            currency={currency}
            username={username}
            view={view}
            siblings={period.items?.[sheet.tabId]}
            onOpenItem={(id) => setSheet({ type: 'item', tabId: sheet.tabId, itemId: id })}
            onClose={() => setSheet(null)}
          />
        )}
        {sheetPerson && (
          <PersonSheet
            base={base}
            pk={pk}
            personId={sheet.id}
            person={sheetPerson}
            period={period}
            tabs={tabs}
            currency={currency}
            view={view}
            ctx={budgetCtx}
            onClose={() => setSheet(null)}
          />
        )}
        {dialog === 'period' && (
          <PeriodSheet ledgerId={ledgerId} periods={periods} current={pk} currency={currency} onSelect={selectPeriod} onClose={() => setDialog(null)} />
        )}
        {dialog === 'categories' && (
          <CategoriesSheet
            categories={categoryList}
            favs={favs}
            currency={currency}
            view={view}
            onOpen={openCategory}
            onFav={(key, label) => setIconPick({ key, label })}
            onClose={() => setDialog(null)}
          />
        )}
        {iconPick && (
          <IconPicker
            label={iconPick.label}
            isFav={Boolean(favs?.[iconPick.key])}
            current={favs?.[iconPick.key]?.icon || suggestIcon(iconPick.label)}
            onPick={(icon) =>
              favs?.[iconPick.key]
                ? setFavIcon(username, ledgerId, iconPick.key, icon)
                : saveFav(username, ledgerId, iconPick.key, iconPick.label, icon)
            }
            onRemove={() => removeFav(username, ledgerId, iconPick.key)}
            onClose={() => setIconPick(null)}
          />
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
            base={base}
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
