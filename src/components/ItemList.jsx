import { useMemo, useState } from 'react';
import { FREQS, byCategory, setAsideTab, sorted, tabInView } from '../lib/budget';
import { prefs } from '../lib/session';
import { duplicateItems, mergeItems, ordersAfter, reorderItems } from '../lib/db';
import { reordered, useDragSort } from '../hooks/useDragSort';
import { formatMoney } from '../lib/format';
import ItemRow from './ItemRow';

export default function ItemList(props) {
  const { base, pk, tabId, items, prevPeriod, prevLabel, currency, username, view } = props;
  const { onViewChange, onAdd, onImport, onOpenItem, ctx } = props;
  const [mode, setMode] = useState('normal'); // 'normal' | 'edit' (tick, copy, combine, move)
  const [menuOpen, setMenuOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set());

  const rows = useMemo(() => sorted(items), [items]);
  const groups = useMemo(() => byCategory(items, view, ctx), [items, view, ctx]);
  const editing = mode === 'edit';

  const togglePick = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const switchMode = (next) => {
    setMode((m) => (m === next ? 'normal' : next));
    setPicked(new Set());
    setMenuOpen(false);
  };

  // Category tags on rows can be hidden for a cleaner list (remembered on this
  // device). Phones start with them hidden so name and amount fit on one line.
  const [showCats, setShowCats] = useState(() => prefs.get('showCats') ?? window.innerWidth > 640);
  const toggleCats = () => {
    setShowCats((v) => {
      prefs.set('showCats', !v);
      return !v;
    });
    setMenuOpen(false);
  };
  const setAside = useMemo(() => setAsideTab(items), [items]);

  // Merged items can be opened up in the list to show their parts.
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Drag an item by its number (or its grip in Reorder mode) to a new place.
  const drag = useDragSort({
    scope: `items-${tabId}`,
    onDrop: ({ id, index }) =>
      reorderItems(
        base,
        tabId,
        reordered(
          rows.map((r) => r.id),
          id,
          index,
        ),
      ),
  });

  async function copySelected() {
    const chosen = rows.filter((r) => picked.has(r.id));
    await duplicateItems(base, tabId, chosen, ordersAfter(items, chosen.map((r) => r.id)), username);
    switchMode('normal');
  }

  async function merge() {
    const chosen = rows.filter((r) => picked.has(r.id));
    const name = window.prompt('Name for the combined item', chosen.map((r) => r.name).join(' + '));
    if (!name?.trim()) return;
    const id = await mergeItems(base, tabId, chosen, name.trim(), username);
    switchMode('normal');
    onOpenItem(tabId, id);
  }

  if (rows.length === 0) {
    return (
      <div className="ep-empty">
        <div className="ep-empty-icon">🧺</div>
        <p>Nothing in this group yet.</p>
        <div className="row-gap center">
          <button className="btn primary" onClick={onAdd}>
            ＋ Add the first one
          </button>
          <button className="btn glass" onClick={onImport}>
            Paste from sheet
          </button>
        </div>
      </div>
    );
  }

  const maxGroup = Math.max(...groups.map((g) => g.total), 0);

  return (
    <div className={`ep-list mode-${mode}`}>
      <div className="ep-head">
        {editing ? (
          <div className="row-gap">
            <button className="btn primary sm" onClick={() => switchMode('normal')}>
              Done
            </button>
            <span className="mode-hint-show">Tick to copy or combine · drag ⠿ to move</span>
          </div>
        ) : (
          <div className="row-gap">
            <button className="btn primary sm" onClick={onAdd}>
              ＋ Add
            </button>
            {rows.length > 1 && (
              <button className="btn ghost sm" onClick={() => switchMode('edit')}>
                Edit list
              </button>
            )}
            <span className="list-menu-wrap">
              <button className="btn ghost sm more-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="More list options" aria-expanded={menuOpen}>
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
                  <div className="list-menu" role="menu">
                    <button role="menuitem" onClick={toggleCats}>
                      <span className="menu-ico">🏷</span> {showCats ? 'Hide categories' : 'Show categories'}
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onImport();
                      }}
                    >
                      <span className="menu-ico">📋</span> Paste from a spreadsheet
                    </button>
                  </div>
                </>
              )}
            </span>
          </div>
        )}
        {!editing && (
          <div className="seg" role="group" aria-label="Show amounts">
            {Object.entries(FREQS).map(([k, p]) => (
              <button key={k} className={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => onViewChange(k)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ep-rows" {...drag.groupProps()}>
      {rows.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          pk={pk}
          prevPeriod={prevPeriod}
          prevLabel={prevLabel}
          currency={currency}
          view={view}
          showCats={showCats}
          editing={editing}
          picked={picked.has(item.id)}
          onPick={() => togglePick(item.id)}
          onOpen={() => onOpenItem(tabId, item.id)}
          expanded={expanded.has(item.id)}
          onToggle={() => toggleExpand(item.id)}
          dragItem={editing ? drag.itemProps(item.id) : null}
          dragHandle={editing ? drag.handleProps(item.id) : null}
          ctx={ctx}
        />
      ))}
      </div>

      {editing ? (
        <div className="select-bar">
          <span>{picked.size ? `${picked.size} ticked` : 'Tick items to copy or combine'}</span>
          <div className="row-gap">
            <button className="btn glass sm" disabled={!picked.size} onClick={copySelected}>
              Copy{picked.size ? ` ${picked.size}` : ''}
            </button>
            <button className="btn primary sm" disabled={picked.size < 2} onClick={merge}>
              Combine{picked.size >= 2 ? ` ${picked.size}` : ''}
            </button>
          </div>
        </div>
      ) : (
        <div className="ep-foot">
          <button className="btn glass sm" onClick={onAdd}>
            ＋ Add
          </button>
          <span className="ep-total">
            {FREQS[view].label} total <b>{formatMoney(tabInView(items, view, ctx), currency)}</b>
          </span>
        </div>
      )}

      {setAside > 0 && !editing && (
        <div className="set-aside" title="The yearly bills in this list, spread over 12 months">
          <span>
            <b>Save monthly for yearly bills</b>
            <span className="muted small"> · so they’re covered when due</span>
          </span>
          <span className="set-aside-amt">
            {formatMoney(setAside, currency)}
            <span className="per-small">/mo</span>
            <span className="muted small"> ({formatMoney(setAside * 12, currency)}/yr)</span>
          </span>
        </div>
      )}

      {groups.length > 1 && !editing && (
        <section className="cat-breakdown" aria-label="Totals by category">
          <h3>By category</h3>
          {groups.map((g) => (
            <div key={g.label} className="cat-row">
              <span className="cat-name">
                {g.label} <span className="muted small">· {g.count}</span>
              </span>
              <span className="cat-bar">
                <span style={{ width: `${maxGroup ? (g.total / maxGroup) * 100 : 0}%` }} />
              </span>
              <span className="cat-amt">
                {formatMoney(g.total, currency)}
                <span className="muted small">{FREQS[view].short}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
