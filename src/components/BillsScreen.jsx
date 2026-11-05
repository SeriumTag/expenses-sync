import { useEffect, useState } from 'react';
import { FREQS, amountInView, potBalance, recurOf, setAsideTab, sorted, tabInView, yearOf, yearlyRecurringSetAside } from '../lib/budget';
import { prefs } from '../lib/session';
import { duplicateItems, mergeItems, ordersAfter, reorderItems } from '../lib/db';
import { reordered, useDragSort } from '../hooks/useDragSort';
import { formatMoney } from '../lib/format';
import ItemRow, { matchesSearch } from './ItemRow';

// Every bill on one page, sorted by what kind it is (like the design sample),
// instead of by group. Groups stay as a label on each row and a filter on top.
export const SECTIONS = [
  { key: 'spending', title: 'Spending', icon: '🛍️', hint: 'One-time bills, only in this month.', add: 'bill', recur: 'once' },
  { key: 'recurring', title: 'Recurring', icon: '🔁', hint: 'Monthly and yearly bills.', add: 'bill' },
  { key: 'savings', title: 'Savings', icon: '🐷', hint: 'Money put aside in savings pots.', add: 'savings' },
  { key: 'expenses', title: 'Expenses List', icon: '💸', hint: 'Budgets you log spends against.', add: 'budget' },
];

export const sectionOf = (item) => (item.track ? 'savings' : item.budget ? 'expenses' : recurOf(item) === 'once' ? 'spending' : 'recurring');

export default function BillsScreen(props) {
  const { base, pk, period, tabs, prevPeriod, prevLabel, currency, username, view, ctx } = props;
  const { group, onGroup, scrollTo, onViewChange, onOpenItem, onAdd, onImport, onAddTab, groupMenu } = props;
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState(() => new Set()); // "tabId:itemId"
  const [expanded, setExpanded] = useState(() => new Set());
  const [showCats] = useState(() => prefs.get('showCats') ?? window.innerWidth > 640);

  const shownTabs = group === 'all' ? tabs : tabs.filter((t) => t.id === group);
  const tabName = (id) => tabs.find((t) => t.id === id)?.name || 'Untitled';
  const entries = shownTabs.flatMap((t) => sorted(period.items?.[t.id]).map((item) => ({ item, tabId: t.id, key: `${t.id}:${item.id}` })));
  const bySection = Object.fromEntries(SECTIONS.map((s) => [s.key, entries.filter((e) => sectionOf(e.item) === s.key)]));
  const total = entries.reduce((sum, e) => sum + amountInView(e.item, e.item.id, view, ctx), 0);
  // Bills priced per year, plus (for all groups) bills that repeat yearly, spread over 12 months.
  const setAside = shownTabs.reduce((sum, t) => sum + setAsideTab(period.items?.[t.id]), 0) + (group === 'all' ? yearlyRecurringSetAside(ctx.periods, yearOf(pk)) : 0);
  const due = /^\d{4}$/.test(pk) ? `${pk}-12` : pk;

  // Home's cards land on their section.
  useEffect(() => {
    if (scrollTo?.key) document.getElementById(`bills-${scrollTo.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollTo]);

  const toggle = (setter, key) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const stopEditing = () => {
    setEditing(false);
    setPicked(new Set());
  };

  // Dragging only works inside one group (order is kept per group): the
  // section's new order is woven back into the group's full order.
  const dropIn = (sectionKey) => ({ id, index }) => {
    if (group === 'all') return;
    const all = sorted(period.items?.[group]).map((r) => r.id);
    const mine = bySection[sectionKey].map((e) => e.item.id);
    const moved = reordered(mine, id, index);
    let i = 0;
    reorderItems(base, group, all.map((rid) => (mine.includes(rid) ? moved[i++] : rid)));
  };
  // One drag helper per section (hooks can't be made in a loop of changing length).
  const drags = {
    spending: useDragSort({ scope: 'bills-spending', onDrop: dropIn('spending') }),
    recurring: useDragSort({ scope: 'bills-recurring', onDrop: dropIn('recurring') }),
    savings: useDragSort({ scope: 'bills-savings', onDrop: dropIn('savings') }),
    expenses: useDragSort({ scope: 'bills-expenses', onDrop: dropIn('expenses') }),
  };

  const chosen = entries.filter((e) => picked.has(e.key));
  const sameGroup = chosen.length > 0 && chosen.every((e) => e.tabId === chosen[0].tabId);

  async function copySelected() {
    // Copies stay in their own group, just after the originals.
    for (const t of tabs) {
      const rows = chosen.filter((e) => e.tabId === t.id).map((e) => e.item);
      if (rows.length) await duplicateItems(base, t.id, rows, ordersAfter(period.items?.[t.id], rows.map((r) => r.id)), username);
    }
    stopEditing();
  }

  async function combine() {
    const tid = chosen[0].tabId;
    const rows = chosen.map((e) => e.item);
    const name = window.prompt('Name for the combined item', rows.map((r) => r.name).join(' + '));
    if (!name?.trim()) return;
    // Combining monthly items also combines them in the months after this one.
    const id = await mergeItems(base, tid, rows, name.trim(), username, { ledgerId: base.split('/')[1], periods: ctx?.periods, pk });
    stopEditing();
    onOpenItem(tid, id);
  }

  const row = (e, drag) => (
    <ItemRow
      key={e.key}
      item={e.item}
      pk={pk}
      prevPeriod={prevPeriod}
      prevLabel={prevLabel}
      currency={currency}
      view={view}
      ctx={ctx}
      showCats={showCats}
      groupName={group === 'all' && tabs.length > 1 ? tabName(e.tabId) : null}
      editing={editing}
      picked={picked.has(e.key)}
      onPick={() => toggle(setPicked, e.key)}
      onOpen={() => onOpenItem(e.tabId, e.item.id)}
      expanded={expanded.has(e.key)}
      onToggle={() => toggle(setExpanded, e.key)}
      dragItem={editing && drag ? drag.itemProps(e.item.id) : null}
      dragHandle={editing && drag ? drag.handleProps(e.item.id) : null}
    />
  );

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length ? tabs.flatMap((t) => sorted(period.items?.[t.id]).filter((it) => matchesSearch(it, words)).map((item) => ({ item, tabId: t.id, key: `${t.id}:${item.id}` }))) : [];

  return (
    <div className="bills">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Bills</h1>
          <span className="muted small">
            {formatMoney(total, currency)}
            {FREQS[view].short} · {entries.length} item{entries.length === 1 ? '' : 's'}
          </span>
        </div>
        <button className="btn glass sm" onClick={onImport}>
          📄 Import
        </button>
      </div>

      <div className="search-box">
        <span aria-hidden="true">🔍</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all bills" aria-label="Search all bills" />
        {query && (
          <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      {words.length > 0 ? (
        <section className="detail search-results">
          {found.length === 0 ? (
            <p className="muted center-text">Nothing matches “{query.trim()}”.</p>
          ) : (
            <>
              <p className="muted small">
                {found.length} found · {formatMoney(found.reduce((sum, e) => sum + amountInView(e.item, e.item.id, view, ctx), 0), currency)}
                {FREQS[view].short}
              </p>
              {found.map((e) => (
                <ItemRow
                  key={e.key}
                  item={e.item}
                  pk={pk}
                  prevPeriod={prevPeriod}
                  prevLabel={prevLabel}
                  currency={currency}
                  view={view}
                  ctx={ctx}
                  groupName={tabName(e.tabId)}
                  onOpen={() => onOpenItem(e.tabId, e.item.id)}
                  onToggle={() => onOpenItem(e.tabId, e.item.id)}
                />
              ))}
            </>
          )}
        </section>
      ) : (
        <>
          {/* Group filter */}
          <div className="group-chips" role="tablist" aria-label="Groups">
            {/* Each chip carries its group's total, so the summary is visible at a glance. */}
            {[{ id: 'all', name: 'All', total: tabs.reduce((sum, t) => sum + tabInView(period.items?.[t.id], view, ctx), 0) }]
              .concat(tabs.map((t) => ({ id: t.id, name: t.name || 'Untitled', total: tabInView(period.items?.[t.id], view, ctx) })))
              .map((g) => (
                <button key={g.id} role="tab" aria-selected={group === g.id} className={`chip group-chip ${group === g.id ? 'active' : ''}`} onClick={() => onGroup(g.id)}>
                  <span className="gc-name">{g.name}</span>
                  <span className="gc-total">
                    {formatMoney(g.total, currency)}
                    {FREQS[view].short}
                  </span>
                </button>
              ))}
            <button className="chip dashed" onClick={onAddTab}>
              ＋ Group
            </button>
            {group !== 'all' && groupMenu}
          </div>

          <div className="bills-tools">
            {editing ? (
              <>
                <button className="btn primary sm" onClick={stopEditing}>
                  Done
                </button>
                <span className="mode-hint-show">{group === 'all' ? 'Tick to copy or combine · pick a group to drag ⠿' : 'Tick to copy or combine · drag ⠿ to move'}</span>
              </>
            ) : (
              <>
                {entries.length > 1 && (
                  <button className="btn ghost sm" onClick={() => setEditing(true)}>
                    Edit list
                  </button>
                )}
                <div className="seg" role="group" aria-label="Show amounts">
                  {Object.entries(FREQS).map(([k, p]) => (
                    <button key={k} className={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => onViewChange(k)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {SECTIONS.map((s) => {
            const list = bySection[s.key];
            const sum = list.reduce((acc, e) => acc + amountInView(e.item, e.item.id, view, ctx), 0);
            const saved = s.key === 'savings' ? list.reduce((acc, e) => acc + potBalance(e.item.id, ctx.tracks?.[e.item.id], ctx.periods, due), 0) : 0;
            const drag = group === 'all' ? null : drags[s.key];
            return (
              <section key={s.key} id={`bills-${s.key}`} className={`home-card bills-section sec-${s.key}`} aria-label={s.title}>
                <div className="home-card-head">
                  <h2>
                    <span aria-hidden="true">{s.icon}</span> {s.title}
                  </h2>
                  <span className="bills-sum">
                    {formatMoney(sum, currency)}
                    <span className="per-small">{FREQS[view].short}</span>
                  </span>
                </div>
                {s.key === 'savings' && list.length > 0 && (
                  <p className="muted small bills-note">
                    <b className="pos">{formatMoney(saved, currency)}</b> saved in {list.length} pot{list.length === 1 ? '' : 's'}
                  </p>
                )}
                {list.length === 0 ? <p className="muted small bills-note">{s.hint}</p> : <div className="ep-rows" {...(drag ? drag.groupProps() : {})}>{list.map((e) => row(e, drag))}</div>}
                {s.key === 'recurring' && setAside > 0 && (
                  <p className="muted small bills-note" title="Yearly bills spread over 12 months">
                    Set aside <b>{formatMoney(setAside, currency)}/mo</b> for yearly bills
                  </p>
                )}
                {!editing && (
                  <button className="btn glass sm bills-add" onClick={() => onAdd(s.add, { recur: s.recur, tabId: group === 'all' ? null : group })}>
                    ＋ Add {s.key === 'expenses' ? 'a budget' : s.key === 'savings' ? 'savings' : s.key === 'spending' ? 'a one-time bill' : 'a bill'}
                  </button>
                )}
              </section>
            );
          })}

          {editing && (
            <div className="select-bar">
              <span>{picked.size ? `${picked.size} ticked` : 'Tick items to copy or combine'}</span>
              <div className="row-gap">
                <button className="btn glass sm" disabled={!picked.size} onClick={copySelected}>
                  Copy{picked.size ? ` ${picked.size}` : ''}
                </button>
                <button className="btn primary sm" disabled={picked.size < 2 || !sameGroup} onClick={combine} title={sameGroup ? '' : 'Only items in the same group can be combined'}>
                  Combine{picked.size >= 2 ? ` ${picked.size}` : ''}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
