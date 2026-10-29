import { useMemo, useState } from 'react';
import { MONTHS, spendsIn, splitCats } from '../lib/budget';
import { catStyle } from '../lib/catStyle';
import { formatMoney } from '../lib/format';
import { budgetItems } from './BudgetsSheet';
import Donut from './Donut';

const dayName = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const PALETTE = ['#ff7d9c', '#ff9a5a', '#5fc9a7', '#9b8cff', '#e9a800', '#4fb3d9', '#e85d7e', '#8cc98a'];

// Every spend this month across budgets: a donut by category ("Where it went")
// and a searchable, filterable list ("Recent spends"). Tapping a slice or a
// chip filters the list; tapping a spend opens its budget's card.
export default function SpendingOverview({ pk, period, tabs, spending, currency, onOpenItem }) {
  const [filter, setFilter] = useState(null); // category key
  const [query, setQuery] = useState('');

  const all = useMemo(
    () =>
      budgetItems(period, tabs)
        .flatMap((b) =>
          spendsIn(spending, b.id, pk).map((s) => {
            const label = splitCats(s.category)[0] || b.item.name || 'Other';
            return { ...s, budgetId: b.id, tabId: b.tabId, budgetName: b.item.name || 'Untitled', catLabel: label, catKey: label.toLowerCase() };
          }),
        )
        .sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0)),
    [period, tabs, spending, pk],
  );

  // One slice per category; colours from the design's palette, never two alike.
  const segments = useMemo(() => {
    const map = new Map();
    for (const s of all) {
      const g = map.get(s.catKey) || { key: s.catKey, label: s.catLabel, value: 0 };
      g.value += Number(s.amount) || 0;
      map.set(s.catKey, g);
    }
    const used = new Set();
    return [...map.values()]
      .sort((a, b) => b.value - a.value)
      .map((g) => {
        let color = catStyle(g.label).color;
        if (used.has(color)) color = PALETTE.find((c) => !used.has(c)) || color;
        used.add(color);
        return { ...g, color };
      });
  }, [all]);
  const colorOf = (key) => segments.find((s) => s.key === key)?.color;

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = all.filter(
    (s) =>
      (!filter || s.catKey === filter) &&
      words.every((w) => [s.note, s.category, s.budgetName].filter(Boolean).join(' ').toLowerCase().includes(w)),
  );

  if (!all.length) return null;

  return (
    <>
      <Donut
        subtitle="Tap a category to filter the spends below."
        segments={segments}
        currency={currency}
        active={filter}
        onPick={setFilter}
      />

      <section className="home-card recent-card" aria-label="Recent spends">
        <div className="home-card-head">
          <div>
            <h2>Recent spends</h2>
            <p className="muted small donut-sub">
              {list.length} spend{list.length === 1 ? '' : 's'}
              {filter ? ` in ${segments.find((s) => s.key === filter)?.label}` : ''}
              {words.length ? ` matching “${query.trim()}”` : ''} · {formatMoney(list.reduce((t, s) => t + (Number(s.amount) || 0), 0), currency)}
            </p>
          </div>
        </div>
        <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search spends… e.g. bubble tea" aria-label="Search spends" />
        <div className="chips" role="group" aria-label="Filter by category">
          <button className={`chip ${!filter ? 'active' : ''}`} onClick={() => setFilter(null)}>
            ✿ All
          </button>
          {segments.map((s) => (
            <button key={s.key} className={`chip ${filter === s.key ? 'active' : ''}`} onClick={() => setFilter(filter === s.key ? null : s.key)}>
              {catStyle(s.label).icon} {s.label}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="empty-note">🌷 Nothing here — try another filter or search.</p>
        ) : (
          list.map((s) => {
            const st = catStyle(s.catLabel);
            return (
              <button key={`${s.budgetId}:${s.id}`} className="tx" onClick={() => onOpenItem(s.tabId, s.budgetId)}>
                <span className="tx-icon" style={{ background: st.bg, boxShadow: `inset 0 0 0 2px ${colorOf(s.catKey) || st.color}33` }}>
                  {st.icon}
                </span>
                <span className="tx-main">
                  <b>{s.note || 'Spend'}</b>
                  <span>
                    {s.catLabel !== s.budgetName ? `${s.catLabel} · ` : ''}
                    {s.budgetName} · {dayName(s.date)}
                    {s.files ? ' · 📎' : ''}
                  </span>
                </span>
                <span className="tx-amt">−{formatMoney(Number(s.amount) || 0, currency)}</span>
              </button>
            );
          })
        )}
      </section>
    </>
  );
}
