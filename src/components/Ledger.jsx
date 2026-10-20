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
  isYearKey,
  periodLabel,
  previousPeriod,
  shortPeriodLabel,
  sorted,
  setAsideTab,
  sumTab,
  monthKey,
} from '../lib/budget';
import {
  BIN_DAYS,
  addItem,
  copyPeriod,
  topOrder,
  addTab,
  binExpired,
  deleteTab,
  purgeTrashed,
  restoreTrashed,
  trashTab,
  migrateToPeriod,
  startEmptyPeriod,
  moveLedgerToBin,
  periodPath,
  renameTab,
  unlinkLedger,
  newKey,
  patchPath,
  updateItemField,
} from '../lib/db';
import { removeFav, saveFav, setFavIcon, suggestIcon } from '../lib/favs';
import { cleanUpFiles } from '../lib/files';
import { formatMoney } from '../lib/format';
import { prefs } from '../lib/session';
import { hideSplash } from '../lib/splash';
import { hueFor, partnerColor } from '../lib/theme';
import { CategoriesSheet, CategoryPage } from './CategoryPage';
import ImportDialog from './ImportDialog';
import ItemBin from './ItemBin';
import ItemList from './ItemList';
import Loading from './Loading';
import IconPicker from './IconPicker';
import ItemSheet from './ItemSheet';
import LiveInput from './LiveInput';
import { LogoMark } from './Logo';
import NavBar from './NavBar';
import PeriodSheet from './PeriodSheet';
import PotIcon from './PotIcon';
import { SavingsPanel, trackedItems } from './SavingsSheet';
import { BudgetsPanel, budgetItems } from './BudgetsSheet';
import BottomNav, { MonthNav } from './BottomNav';
import HomeScreen from './HomeScreen';
import { PersonSheet, SalaryStrip } from './SalaryStrip';
import ShareDialog from './ShareDialog';
import ThemeDialog from './ThemeDialog';
import { confirmTwice } from '../lib/confirm';

const EMPTY_PERIOD = {};

export default function Ledger({ ledgerId, username, theme, onThemeChange, ledgers, onSwitch, onCreate, onJoin, onLogout, binCount, onOpenBin, onManageAccounts }) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [newTabId, setNewTabId] = useState(null);
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [binOpen, setBinOpen] = useState(false);
  const [undo, setUndo] = useState(null); // { trashId, label } just after deleting an item
  const undoTimer = useRef(null);
  const purgingTrash = useRef(false);
  const [focusItemId, setFocusItemId] = useState(null);
  const [dialog, setDialog] = useState(null); // 'share' | 'theme' | 'import' | 'period' | 'categories'
  const [sheet, setSheet] = useState(null); // { type: 'item', tabId, itemId } | { type: 'person', id }
  const [catView, setCatView] = useState(null); // category key being viewed
  const [catTrail, setCatTrail] = useState([]); // categories hopped through, for Back
  // Which bottom tab is showing (remembered on this device).
  const [screen, setScreenState] = useState(() => prefs.get('screen') || 'home');
  const [spendOpen, setSpendOpen] = useState(null); // budget to open on the Spending tab
  const [groupMenu, setGroupMenu] = useState(false);
  const [nowKey, setNowKey] = useState(currentMonthKey);
  const [periodSel, setPeriodSel] = useState(null); // a month/year picked in the picker (null = today's month)
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
  // Items in the bin longer than 7 days are deleted for good (checked
  // whenever someone has the account open).
  useEffect(() => {
    if (!data?.trash || purgingTrash.current) return;
    const expired = Object.entries(data.trash)
      .filter(([, t]) => t.deletedAt && binExpired(t.deletedAt))
      .map(([id]) => id);
    if (!expired.length) return;
    purgingTrash.current = true;
    purgeTrashed(ledgerId, expired)
      .catch(() => {})
      .finally(() => (purgingTrash.current = false));
  }, [data?.trash, ledgerId]);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // Clear out attached files that nothing uses any more (a few seconds after
  // changes settle, so it doesn't run on every keystroke).
  useEffect(() => {
    if (!data?.fileIndex) return undefined;
    const t = setTimeout(() => cleanUpFiles(ledgerId, data)?.catch(() => {}), 5000);
    return () => clearTimeout(t);
  }, [data, ledgerId]);

  // Favourites are personal, so they live under the user, per account.
  useEffect(
    () => onValue(ref(db, `users/${username}/favs/${ledgerId}`), (snap) => setFavs(snap.val())),
    [username, ledgerId],
  );

  const pColor = partnerColor(theme, partnerTheme);
  useEffect(() => {
    document.documentElement.style.setProperty('--partner', pColor);
  }, [pColor]);

  // The app opens on today's month, even before anything is added to it.
  // Picking another month from the picker shows that one until the app is
  // reopened. If the month changes while the app is open, follow it.
  useEffect(() => {
    const check = () => setNowKey(currentMonthKey());
    const timer = setInterval(check, 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const periods = data?.periods || {};
  const periodKeys = Object.keys(periods);
  const pk = periodSel || nowKey;
  const periodExists = Boolean(periods[pk]);
  const period = periods[pk] || EMPTY_PERIOD;
  const base = periodPath(ledgerId, pk);
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

  if (!data) return <Loading label="Opening your account…" detail="Still loading this account." onSignOut={onLogout} />;

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

  const currency = meta.currency ?? '$';
  const budgetCtx = { year: yearOf(pk), tracks: data.tracks, periods, spending: data.spending, pk };
  const categoryList = categoriesIn(period, view, budgetCtx);
  const categoryNames = categoryList.map((c) => c.label);
  const grandTotal = tabs.reduce((sum, t) => sum + tabInView(period.items?.[t.id], view, budgetCtx), 0);
  const itemCount = tabs.reduce((n, t) => n + Object.keys(period.items?.[t.id] || {}).length, 0);
  const totalSetAside = tabs.reduce((sum, t) => sum + setAsideTab(period.items?.[t.id]), 0);
  const partnerOnline = partner ? Boolean(presence.others[partner]) : false;
  const prevLabel = prevKey ? shortPeriodLabel(prevKey) : '';
  const potCount = trackedItems(period, tabs).length;
  const budgetCount = budgetItems(period, tabs).length;

  const changeView = (v) => {
    setView(v);
    prefs.set('view', v);
  };
  const selectPeriod = (k) => {
    setPeriodSel(k === nowKey ? null : k);
    setCatView(null);
  };
  const openItem = (tid, iid) => setSheet({ type: 'item', tabId: tid, itemId: iid });
  const setScreen = (k) => {
    setScreenState(k);
    prefs.set('screen', k);
    setCatView(null);
    setGroupMenu(false);
    window.scrollTo(0, 0);
  };
  // ‹ › step one month (or one year when a whole year is shown).
  const stepPeriod = (dir) => {
    if (isYearKey(pk)) return selectPeriod(String(Number(pk) + dir));
    const d = new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)) - 1 + dir, 1);
    selectPeriod(monthKey(d.getFullYear(), d.getMonth()));
  };
  const logSpend = (budgetId) => {
    setSpendOpen(budgetId || null);
    setScreen('spending');
  };

  // Set up the month being shown: a copy of an earlier one, or empty.
  async function createPeriod(fromKey) {
    setCreatingPeriod(true);
    try {
      if (fromKey) await copyPeriod(ledgerId, periods[fromKey], [pk]);
      else await startEmptyPeriod(ledgerId, pk);
    } finally {
      setCreatingPeriod(false);
    }
  }

  function handleAddTab() {
    const name = window.prompt('Name for the new group (e.g. Home, Car, Kids)');
    if (!name?.trim()) return;
    const id = addTab(base, name.trim());
    setActiveTab(id);
  }

  // New things open straight in their card, ready to fill in.
  function addExpense(kind = 'bill') {
    let tid = tabId;
    if (!tid) {
      tid = addTab(base, 'General');
      setActiveTab(tid);
    }
    setCatView(null);
    // New items go to the top of the list.
    const id = addItem(base, tid, username, topOrder(period.items?.[tid]));
    if (kind === 'budget') updateItemField(base, tid, id, 'budget', true, username);
    if (kind === 'savings') updateItemField(base, tid, id, 'track', true, username);
    openItem(tid, id);
  }

  function addPerson() {
    const id = newKey(`${base}/people`);
    patchPath(`${base}/people/${id}`, { name: '', salary: 0, order: Date.now() }).then(() => setSheet({ type: 'person', id }));
  }

  function renameGroup() {
    setGroupMenu(false);
    const name = window.prompt('Group name', currentTab?.name || '');
    if (name?.trim()) renameTab(base, tabId, name.trim());
  }

  function handleDeleteTab() {
    const count = Object.keys(period.items?.[tabId] || {}).length;
    const viewer = Object.entries(presence.others).find(([, o]) => o.tab === `${pk}:${tabId}`)?.[0];
    const warning = [
      `Delete the whole group “${currentTab.name || 'Untitled'}” from ${periodLabel(pk)}${count ? `, with all ${count} item(s) in it` : ''}?`,
      count ? `The items go to the bin for ${BIN_DAYS} days, where you can restore them.` : '',
      viewer ? `${viewer} is viewing it right now.` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    setGroupMenu(false);
    if (!confirmTwice(warning, `the whole group “${currentTab.name || 'Untitled'}”${count ? ` and its ${count} item(s)` : ''}`)) return;
    if (count) trashTab(ledgerId, pk, currentTab, period.items?.[tabId], username);
    else deleteTab(base, tabId);
  }

  // "Moved to bin · Undo" for a few seconds after deleting an item.
  function showUndo(trashId, label) {
    clearTimeout(undoTimer.current);
    setUndo({ trashId, label });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }
  async function undoDelete() {
    const entry = data.trash?.[undo?.trashId];
    setUndo(null);
    if (entry) await restoreTrashed(ledgerId, undo.trashId, entry);
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
    if (confirmTwice(msg, `the account “${meta.name || 'Untitled'}”`)) {
      setDialog(null);
      moveLedgerToBin(ledgerId, username);
    }
  }

  const sheetItem = sheet?.type === 'item' ? period.items?.[sheet.tabId]?.[sheet.itemId] : null;
  const sheetPerson = sheet?.type === 'person' ? period.people?.[sheet.id] : null;
  const openCategory = (key) => {
    setDialog(null);
    setCatTrail([]);
    setCatView(key);
    window.scrollTo(0, 0);
  };
  // From one category page to another (an item's other category): Back returns here.
  const hopCategory = (key) => {
    setCatTrail((t) => [...t, catView]);
    setCatView(key);
    window.scrollTo(0, 0);
  };
  const catBack = () => {
    setCatView(catTrail[catTrail.length - 1] ?? null);
    setCatTrail((t) => t.slice(0, -1));
    window.scrollTo(0, 0);
  };
  const labelOfCat = (key) => favs?.[key]?.label || categoryList.find((c) => c.key === key)?.label || data.categories?.[key]?.label || key;
  const catLabel = catView ? labelOfCat(catView) : null;

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
          binCount={binCount + Object.keys(data.trash || {}).length}
          onTheme={() => setDialog('theme')}
          onShare={() => setDialog('share')}
          onNewAccount={newAccount}
          onManageAccounts={onManageAccounts}
          onOpenBin={() => setBinOpen(true)}
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
            key={catView}
            onBack={catBack}
            backLabel={catTrail.length ? labelOfCat(catTrail[catTrail.length - 1]) : null}
            onOpenCategory={hopCategory}
            fav={favs?.[catView]}
            onFav={() => setIconPick({ key: catView, label: catLabel })}
            onOpenItem={openItem}
          />
        ) : (
          <main className="screen">
            <MonthNav
              label={periodLabel(pk)}
              onPrev={() => stepPeriod(-1)}
              onNext={() => stepPeriod(1)}
              onPick={() => setDialog('period')}
              isNow={pk === nowKey}
              onToday={() => selectPeriod(nowKey)}
            />

            {!periodExists && (
              <section className="new-month">
                <div className="new-month-icon" aria-hidden="true">
                  🗓️
                </div>
                <h2>{periodLabel(pk)} is a fresh start</h2>
                <p className="muted">Nothing has been added for this {isYearKey(pk) ? 'year' : 'month'} yet.</p>
                <div className="row-gap center">
                  {prevKey && (
                    <button className="btn primary" disabled={creatingPeriod} onClick={() => createPeriod(prevKey)}>
                      Copy from {periodLabel(prevKey)}
                    </button>
                  )}
                  <button className={`btn ${prevKey ? 'glass' : 'primary'}`} disabled={creatingPeriod} onClick={() => createPeriod(null)}>
                    Start empty
                  </button>
                </div>
                {prevKey && <p className="muted small">Copying brings over your groups, bills and income. Changes will be highlighted.</p>}
              </section>
            )}

            {periodExists && screen === 'home' && (
              <HomeScreen
                pk={pk}
                period={period}
                tabs={tabs}
                ctx={budgetCtx}
                currency={currency}
                partner={partner}
                partnerOnline={partnerOnline}
                onLogSpend={logSpend}
                onAddBill={() => {
                  setScreen('bills');
                  addExpense('bill');
                }}
                onGoto={setScreen}
                onOpenPerson={(id) => setSheet({ type: 'person', id })}
                onAddPerson={addPerson}
              />
            )}

            {periodExists && screen === 'bills' && (
              <>
                <div className="screen-head">
                  <div>
                    <h1 className="screen-title">Expenses</h1>
                    <span className="muted small">
                      {formatMoney(grandTotal, currency)}
                      {FREQS[view].short} · {itemCount} item{itemCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {categoryList.length > 0 && (
                    <button className="btn glass sm" onClick={() => setDialog('categories')}>
                      Categories
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

                <section className="row">
                  <h2 className="row-title">Groups</h2>
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
                          onClick={() => {
                            setActiveTab(t.id);
                            setGroupMenu(false);
                          }}
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
                      <span>New group</span>
                    </button>
                  </div>
                </section>

                {currentTab && (
                  <section className="detail">
                    <div className="detail-head">
                      <h2 className="detail-title-text">{currentTab.name || 'Untitled'}</h2>
                      <span className="list-menu-wrap">
                        <button
                          className="btn ghost sm"
                          onClick={() => setGroupMenu((o) => !o)}
                          aria-expanded={groupMenu}
                          aria-label={`Options for the group ${currentTab.name || 'Untitled'}`}
                        >
                          ⋯ Group
                        </button>
                        {groupMenu && (
                          <>
                            <div className="menu-scrim" onClick={() => setGroupMenu(false)} />
                            <div className="list-menu right" role="menu">
                              <button role="menuitem" onClick={renameGroup}>
                                <span className="menu-ico">✏️</span> Rename this group
                              </button>
                              <button role="menuitem" className="danger" onClick={handleDeleteTab}>
                                <span className="menu-ico">🗑</span> Delete the whole group “{currentTab.name || 'Untitled'}”
                              </button>
                            </div>
                          </>
                        )}
                      </span>
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
                      onAdd={() => addExpense('bill')}
                      onImport={() => setDialog('import')}
                      onOpenItem={openItem}
                      ctx={budgetCtx}
                    />
                  </section>
                )}
              </>
            )}

            {periodExists && screen === 'spending' && (
              <>
                <div className="screen-head">
                  <div>
                    <h1 className="screen-title">Spending</h1>
                    <span className="muted small">Log what you spend and see what’s left</span>
                  </div>
                  {budgetCount > 0 && (
                    <button className="btn glass sm" onClick={() => addExpense('budget')}>
                      ＋ New budget
                    </button>
                  )}
                </div>
                <BudgetsPanel
                  key={`${pk}:${spendOpen || ''}`}
                  ledgerId={ledgerId}
                  pk={pk}
                  period={period}
                  tabs={tabs}
                  spending={data.spending}
                  currency={currency}
                  username={username}
                  startOpen={spendOpen}
                  onOpenItem={openItem}
                  onAddBudget={() => addExpense('budget')}
                />
              </>
            )}

            {periodExists && screen === 'savings' && (
              <>
                <div className="screen-head">
                  <div>
                    <h1 className="screen-title">Savings</h1>
                    <span className="muted small">Money put aside, month by month</span>
                  </div>
                  {potCount > 0 && (
                    <button className="btn glass sm" onClick={() => addExpense('savings')}>
                      ＋ New savings
                    </button>
                  )}
                </div>
                <SavingsPanel
                  ledgerId={ledgerId}
                  username={username}
                  pk={pk}
                  period={period}
                  tabs={tabs}
                  tracks={data.tracks}
                  periods={periods}
                  currency={currency}
                  onOpenItem={openItem}
                  onAddSavings={() => addExpense('savings')}
                />
              </>
            )}
          </main>
        )}

        <BottomNav screen={catView ? 'bills' : screen} onChange={setScreen} />

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
            spending={data.spending}
            otherBudgets={budgetItems(period, tabs).map((b) => ({ id: b.id, name: b.item.name }))}
            categories={categoryNames}
            currency={currency}
            username={username}
            view={view}
            siblings={period.items?.[sheet.tabId]}
            onOpenItem={(id) => setSheet({ type: 'item', tabId: sheet.tabId, itemId: id })}
            tab={period.tabs?.[sheet.tabId]}
            onTrashed={showUndo}
            onClose={() => setSheet(null)}
          />
        )}
        {binOpen && (
          <ItemBin
            ledgerId={ledgerId}
            trash={data.trash}
            currency={currency}
            accountBinCount={binCount}
            onOpenAccountBin={onOpenBin}
            onRestored={(e) => {
              if (e.periodKey !== pk) selectPeriod(e.periodKey);
              setActiveTab(e.tabId);
            }}
            onClose={() => setBinOpen(false)}
          />
        )}
        {undo && (
          <div className="undo-toast" role="status">
            <span>
              “{undo.label}” moved to the bin
            </span>
            <button onClick={undoDelete}>Undo</button>
          </div>
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
            onRemove={() => confirmTwice(`Remove “${iconPick.label}” from your favourites?`, `“${iconPick.label}” from favourites`) && removeFav(username, ledgerId, iconPick.key)}
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
