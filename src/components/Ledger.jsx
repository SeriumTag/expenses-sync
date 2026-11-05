import { useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebase';
import { useConnected } from '../hooks/useConnected';
import { PresenceContext, usePresence } from '../hooks/usePresence';
import {
  FREQS,
  allSpendCategories,
  budgetItems,
  categoriesIn,
  splitCats,
  yearOf,
  currentMonthKey,
  isYearKey,
  periodLabel,
  previousPeriod,
  shortPeriodLabel,
  sorted,
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
  ensurePeriod,
  moveLedgerToBin,
  periodPath,
  renameTab,
  setTabFriend,
  unlinkLedger,
  newKey,
  patchPath,
  updateItemField,
} from '../lib/db';
import { removeFav, saveFav, setFavIcon, suggestIcon } from '../lib/favs';
import { cleanUpFiles } from '../lib/files';
import { prefs } from '../lib/session';
import { hideSplash } from '../lib/splash';
import { partnerColor } from '../lib/theme';
import { CategoryPage } from './CategoryPage';
import ImportDialog from './ImportDialog';
import ItemBin from './ItemBin';
import Loading from './Loading';
import IconPicker from './IconPicker';
import ItemSheet from './ItemSheet';
import { LogoMark } from './Logo';
import NavBar from './NavBar';
import PeriodSheet from './PeriodSheet';
import BottomNav, { MonthNav, SCREENS } from './BottomNav';
import HomeScreen from './HomeScreen';
import BillsScreen from './BillsScreen';
import CategoriesScreen from './CategoriesScreen';
import QuickSpend from './QuickSpend';
import Welcome from './Welcome';
import StatementImport from './StatementImport';
import BringItemsDialog from './BringItemsDialog';
import { CatPermContext, canEditCategories } from '../lib/catPerm';
import { PersonSheet, SalaryStrip } from './SalaryStrip';
import ShareDialog from './ShareDialog';
import MascotPicker from './MascotPicker';
import DriveScreen from './drive/DriveScreen';
import WeightScreen from './extras/WeightScreen';
import BitcoinScreen from './extras/BitcoinScreen';
import { grabIncomeFor } from '../lib/drive';
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
  const [dialog, setDialog] = useState(null); // 'share' | 'theme' | 'import' | 'period' | 'statement' | 'bring' | 'spend'
  const [sheet, setSheet] = useState(null); // { type: 'item', tabId, itemId } | { type: 'person', id }
  const [catView, setCatView] = useState(() => prefs.get('catTab')); // category picked on the Category tab (remembered)
  // Which bottom tab is showing (remembered on this device).
  // Older versions had Spending and Savings tabs; they're part of Bills now.
  const [screen, setScreenState] = useState(() => {
    const s = prefs.get('screen');
    return s === 'spending' || s === 'savings' ? 'bills' : SCREENS.some((x) => x.key === s) ? s : 'home';
  });
  const [billsGroup, setBillsGroup] = useState('all'); // group filter on Bills
  const [billsScroll, setBillsScroll] = useState(null); // { key } section to scroll to on Bills
  const [page, setPage] = useState(null); // { type: 'drive' | 'weight' | 'bitcoin', pid } — a person's own page, open over the screens
  const [spendOpen, setSpendOpen] = useState(null); // budget to open on the Spending tab
  const [groupMenu, setGroupMenu] = useState(false);
  // The short tour: once per device, and from the menu.
  const [welcome, setWelcome] = useState(() => !prefs.get('welcomed'));
  const closeWelcome = () => {
    prefs.set('welcomed', true);
    setWelcome(false);
  };
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

  // A month that isn't set up yet builds itself from the months before it:
  // recurring items, groups and income carry on; one-time items stay behind.
  const canBuild = Boolean(data) && !periodExists && !isYearKey(pk) && Boolean(prevKey);
  const building = useRef(null);
  useEffect(() => {
    if (!canBuild || building.current === pk) return;
    building.current = pk;
    ensurePeriod(ledgerId, periods, pk)
      .catch(console.error)
      .finally(() => {
        if (building.current === pk) building.current = null;
      });
  }, [canBuild, pk, ledgerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Grab incomes aren't typed in: each month's is that month's car-payment
  // cycle from the Drive page (net after petrol). Keep the stored amounts in
  // step, so every total (and the other phone) sees the same figure.
  useEffect(() => {
    if (!data?.periods) return;
    const patch = {};
    for (const [key, p] of Object.entries(data.periods)) {
      for (const [pid, person] of Object.entries(p?.people || {})) {
        for (const [iid, inc] of Object.entries(person?.incomes || {})) {
          if (!inc?.grab) continue;
          const amount = grabIncomeFor(data.drive?.[pid], key);
          if (Math.abs((Number(inc.amount) || 0) - amount) > 0.005) patch[`periods/${key}/people/${pid}/incomes/${iid}/amount`] = amount;
        }
      }
    }
    if (Object.keys(patch).length) patchPath(`ledgers/${ledgerId}`, patch);
  }, [data?.periods, data?.drive, ledgerId]);

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
  // Every category that exists anywhere (for people who can only pick one).
  const knownCats = (() => {
    const seen = new Map();
    const add = (name) => name && !seen.has(name.toLowerCase()) && seen.set(name.toLowerCase(), name);
    categoryNames.forEach(add);
    Object.values(periods).forEach((p) =>
      Object.values(p?.items || {}).forEach((tab) =>
        Object.values(tab || {}).forEach((it) => {
          splitCats(it?.category).forEach(add);
          Object.values(it?.parts || {}).forEach((pt) => splitCats(pt?.category).forEach(add));
        }),
      ),
    );
    allSpendCategories(data.spending).forEach(add);
    Object.values(data.categories || {}).forEach((c) => add(c?.label));
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  })();
  const catPerm = { canEdit: canEditCategories(meta, username), known: knownCats, owner: meta.owner };
  const partnerOnline = partner ? Boolean(presence.others[partner]) : false;
  const prevLabel = prevKey ? shortPeriodLabel(prevKey) : '';

  const changeView = (v) => {
    setView(v);
    prefs.set('view', v);
  };
  const selectPeriod = (k) => {
    setPeriodSel(k === nowKey ? null : k);
  };
  const openItem = (tid, iid) => setSheet({ type: 'item', tabId: tid, itemId: iid });
  const setScreen = (k) => {
    setScreenState(k);
    prefs.set('screen', k);
    setGroupMenu(false);
    window.scrollTo(0, 0);
  };
  // Home's cards jump to a section of Bills.
  const gotoScreen = (k, section) => {
    setScreen(k);
    if (section) setBillsScroll({ key: section });
  };
  const pickGroup = (id) => {
    setBillsGroup(id);
    setGroupMenu(false);
    if (id !== 'all') setActiveTab(id);
  };
  // ‹ › step one month (or one year when a whole year is shown).
  const stepPeriod = (dir) => {
    if (isYearKey(pk)) return selectPeriod(String(Number(pk) + dir));
    const d = new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)) - 1 + dir, 1);
    selectPeriod(monthKey(d.getFullYear(), d.getMonth()));
  };
  // A person's own pages: Drive (from their Grab income), Weight log and
  // Bitcoin (added from their sheet). Opened from the sheet or their Home tile.
  const openPage = (type, pid) => {
    setSheet(null);
    setPage({ type, pid });
    window.scrollTo(0, 0);
  };
  const addExtra = (kind, pid) => {
    patchPath(`ledgers/${ledgerId}/extras/${pid}`, { [kind]: true });
    openPage(kind, pid);
  };
  // Takes the page off the person (Home icon and sheet button); its data is kept.
  const removeExtra = (kind, pid, name) => {
    const label = kind === 'weight' ? 'the Weight log' : 'Bitcoin';
    if (!confirmTwice(`Remove ${label} from ${name || 'this person'}? Everything logged is kept, so adding it again brings it back.`, label)) return;
    patchPath(`ledgers/${ledgerId}/extras/${pid}`, { [kind]: null });
    setPage(null);
  };
  const personNameOf = (pid) => period?.people?.[pid]?.name || Object.values(periods).map((p) => p?.people?.[pid]?.name).find(Boolean) || '';
  // "Log a spend" opens a quick sheet over whatever screen is showing.
  const logSpend = (budgetId) => {
    setSpendOpen(budgetId || null);
    setDialog('spend');
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
    return id;
  }

  // New things open straight in their card, ready to fill in.
  // opts.tabId: the group to add to (default: the current one); opts.recur: 'once' for a one-time bill.
  function addExpense(kind = 'bill', opts = {}) {
    let tid = (opts.tabId && tabs.some((t) => t.id === opts.tabId) && opts.tabId) || tabId;
    if (!tid) {
      tid = addTab(base, 'General');
      setActiveTab(tid);
    }
    // New items go to the top of the list.
    const id = addItem(base, tid, username, topOrder(period.items?.[tid]));
    if (kind === 'budget') {
      updateItemField(base, tid, id, 'budget', true, username);
      updateItemField(base, tid, id, 'budgetMode', 'spent', username); // starts as "No fixed budget"
    }
    if (kind === 'savings') updateItemField(base, tid, id, 'track', true, username);
    if (opts.recur === 'once') {
      updateItemField(base, tid, id, 'recur', 'once', username);
      updateItemField(base, tid, id, 'startMonth', pk, username);
    }
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
  // The Category tab shows one category at a time; links on its page switch it.
  const openCategory = (key) => {
    setCatView(key);
    prefs.set('catTab', key);
    if (screen !== 'category') setScreen('category');
    else window.scrollTo(0, 0);
  };
  const labelOfCat = (key) => favs?.[key]?.label || categoryList.find((c) => c.key === key)?.label || data.categories?.[key]?.label || key;
  // Every category: those used this month, plus category pages with nothing in them now.
  const allCats = [...categoryList];
  Object.entries(data.categories || {}).forEach(([key, c]) => {
    if (c?.label && !allCats.some((x) => x.key === key)) allCats.push({ key, label: c.label, count: 0, spendCount: 0, total: 0 });
  });
  const shownCat = allCats.some((c) => c.key === catView) ? catView : allCats[0]?.key || null;
  const catLabel = shownCat ? labelOfCat(shownCat) : null;
  const currentGroup = tabs.find((t) => t.id === billsGroup) || null;

  return (
    <PresenceContext.Provider value={presence}>
      <CatPermContext.Provider value={catPerm}>
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
          onHelp={() => setWelcome(true)}
          accountName={meta.name}
        />

        {!connected && <div className="banner">You’re offline. Changes are saved and will sync when you reconnect.</div>}

        {(
          <main className="screen">
            <MonthNav
              label={periodLabel(pk)}
              onPrev={() => stepPeriod(-1)}
              onNext={() => stepPeriod(1)}
              onPick={() => setDialog('period')}
              isNow={pk === nowKey}
              onToday={() => selectPeriod(nowKey)}
            />

            {!page && canBuild && <p className="muted center-text">Setting up {periodLabel(pk)}…</p>}
            {!page && !periodExists && !canBuild && (
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

            {page?.type === 'drive' && (
              <DriveScreen
                ledgerId={ledgerId}
                pk={pk}
                personId={page.pid}
                personName={personNameOf(page.pid)}
                drive={data.drive?.[page.pid]}
                currency={currency}
                onBack={() => setPage(null)}
              />
            )}
            {page?.type === 'weight' && (
              <WeightScreen
                ledgerId={ledgerId}
                personId={page.pid}
                personName={personNameOf(page.pid)}
                data={data.weight?.[page.pid]}
                onBack={() => setPage(null)}
                onRemove={() => removeExtra('weight', page.pid, personNameOf(page.pid))}
              />
            )}
            {page?.type === 'bitcoin' && (
              <BitcoinScreen
                ledgerId={ledgerId}
                personId={page.pid}
                personName={personNameOf(page.pid)}
                data={data.bitcoin?.[page.pid]}
                onBack={() => setPage(null)}
                onRemove={() => removeExtra('bitcoin', page.pid, personNameOf(page.pid))}
              />
            )}

            {periodExists && !page && screen === 'home' && (
              <HomeScreen
                pk={pk}
                period={period}
                tabs={tabs}
                ctx={budgetCtx}
                currency={currency}
                username={username}
                onLogSpend={logSpend}
                onAddBill={() => {
                  setScreen('bills');
                  addExpense('bill');
                }}
                onGoto={gotoScreen}
                onOpenPerson={(id) => setSheet({ type: 'person', id })}
                onAddPerson={addPerson}
                extras={data.extras}
                weight={data.weight}
                bitcoin={data.bitcoin}
                onOpenPage={openPage}
              />
            )}

            {periodExists && !page && screen === 'bills' && (
              <BillsScreen
                base={base}
                pk={pk}
                period={period}
                tabs={tabs}
                prevPeriod={prevPeriod}
                prevLabel={prevLabel}
                currency={currency}
                username={username}
                view={view}
                onViewChange={changeView}
                ctx={budgetCtx}
                group={currentGroup ? billsGroup : 'all'}
                onGroup={pickGroup}
                scrollTo={billsScroll}
                onOpenItem={openItem}
                onAdd={addExpense}
                onImport={() => setDialog('statement')}
                onAddTab={() => {
                  const id = handleAddTab();
                  if (id) pickGroup(id);
                }}
                groupMenu={
                  currentGroup && (
                    <span className="list-menu-wrap">
                      <button className="chip" onClick={() => setGroupMenu((o) => !o)} aria-expanded={groupMenu} aria-label={`Options for the group ${currentGroup.name || 'Untitled'}`}>
                        ⋯
                      </button>
                      {groupMenu && (
                        <>
                          <div className="menu-scrim" onClick={() => setGroupMenu(false)} />
                          <div className="list-menu" role="menu">
                            <button role="menuitem" onClick={renameGroup}>
                              <span className="menu-ico">✏️</span> Rename “{currentGroup.name || 'Untitled'}”
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => {
                                setGroupMenu(false);
                                setDialog('groupFriend');
                              }}
                            >
                              <span className="menu-ico">🧸</span> Choose a character…
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => {
                                setGroupMenu(false);
                                setDialog('bring');
                              }}
                            >
                              <span className="menu-ico">📥</span> Bring items from another month…
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => {
                                setGroupMenu(false);
                                setDialog('import');
                              }}
                            >
                              <span className="menu-ico">📋</span> Paste from a spreadsheet
                            </button>
                            <button role="menuitem" className="danger" onClick={handleDeleteTab}>
                              <span className="menu-ico">🗑</span> Delete the whole group “{currentGroup.name || 'Untitled'}”
                            </button>
                          </div>
                        </>
                      )}
                    </span>
                  )
                }
              />
            )}

            {periodExists && !page && screen === 'category' && (
              <CategoriesScreen categories={allCats} favs={favs} selected={shownCat} onSelect={openCategory}>
                {shownCat && (
                  <CategoryPage
                    ledgerId={ledgerId}
                    pk={pk}
                    period={period}
                    periods={periods}
                    catKeyValue={shownCat}
                    label={catLabel}
                    catData={data.categories?.[shownCat]}
                    tracks={data.tracks}
                    currency={currency}
                    view={view}
                    onViewChange={changeView}
                    ctx={budgetCtx}
                    key={shownCat}
                    onOpenCategory={openCategory}
                    fav={favs?.[shownCat]}
                    onFav={() => setIconPick({ key: shownCat, label: catLabel })}
                    onOpenItem={openItem}
                  />
                )}
              </CategoriesScreen>
            )}
          </main>
        )}

        <BottomNav
          screen={screen}
          onChange={(k) => {
            setPage(null);
            setScreen(k);
          }}
        />

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
            groups={tabs.map((t) => ({ id: t.id, name: t.name }))}
            onMoved={(toTab) => {
              setSheet({ type: 'item', tabId: toTab, itemId: sheet.itemId });
              setActiveTab(toTab);
            }}
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
            drive={data.drive?.[sheet.id]}
            extras={data.extras?.[sheet.id]}
            onOpenDrive={() => openPage('drive', sheet.id)}
            onOpenExtra={(kind) => (data.extras?.[sheet.id]?.[kind] ? openPage(kind, sheet.id) : addExtra(kind, sheet.id))}
            onClose={() => setSheet(null)}
          />
        )}
        {dialog === 'period' && (
          <PeriodSheet ledgerId={ledgerId} periods={periods} current={pk} currency={currency} onSelect={selectPeriod} onClose={() => setDialog(null)} />
        )}
        {dialog === 'bring' && currentTab && (
          <BringItemsDialog
            ledgerId={ledgerId}
            periods={periods}
            pk={pk}
            tabId={tabId}
            tabName={currentTab.name}
            currency={currency}
            username={username}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'statement' && (
          <StatementImport
            ledgerId={ledgerId}
            budgets={budgetItems(period, tabs).map((b) => ({ id: b.id, name: b.item.name }))}
            spending={data.spending}
            importRules={data.importRules}
            currency={currency}
            username={username}
            onAddBudget={() => {
              setDialog(null);
              addExpense('budget');
            }}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'spend' && (
          <QuickSpend
            ledgerId={ledgerId}
            pk={pk}
            period={period}
            tabs={tabs}
            spending={data.spending}
            currency={currency}
            username={username}
            startWith={spendOpen}
            onAddBudget={() => {
              setDialog(null);
              addExpense('budget');
            }}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'groupFriend' && currentGroup && (
          <MascotPicker
            title={`Character for ${currentGroup.name || 'this group'}`}
            current={currentGroup.friend || null}
            allowNone
            onChoose={(key) => setTabFriend(ledgerId, periods, pk, currentGroup.id, key)}
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
        {welcome && <Welcome onDone={closeWelcome} />}
        {dialog === 'theme' && <ThemeDialog theme={theme} onChange={onThemeChange} onClose={() => setDialog(null)} />}
      </div>
      </CatPermContext.Provider>
    </PresenceContext.Provider>
  );
}
