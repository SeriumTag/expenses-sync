import { useMemo, useRef, useState } from 'react';
import { FREQS, byCategory, setAsideTab, sorted, tabInView } from '../lib/budget';
import { prefs } from '../lib/session';
import { duplicateItems, mergeItems, ordersAfter, reorderItems, updateItemField } from '../lib/db';
import { reordered, useDragSort } from '../hooks/useDragSort';
import { formatMoney } from '../lib/format';
import ItemRow from './ItemRow';

export default function ItemList(props) {
  const { base, pk, tabId, items, prevPeriod, prevLabel, categories, currency, username, focusId, view } = props;
  const { onViewChange, onAdd, onImport, onOpenItem, ctx } = props;
  const [mode, setMode] = useState('normal'); // 'normal' | 'select' | 'reorder'
  const [menuOpen, setMenuOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const rows = useMemo(() => sorted(items), [items]);
  const groups = useMemo(() => byCategory(items, view, ctx), [items, view, ctx]);
  const selecting = mode === 'select';

  // Skip writes to a row the other person just deleted, so it isn't half-recreated.
  const saver = (itemId) => (field) => (value) => {
    if (!itemsRef.current?.[itemId]) return;
    return updateItemField(base, tabId, itemId, field, value, username);
  };

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
    const name = window.prompt('Name for the merged item', chosen.map((r) => r.name).join(' + '));
    if (!name?.trim()) return;
    const id = await mergeItems(base, tabId, chosen, name.trim(), username);
    switchMode('normal');
    onOpenItem(tabId, id);
  }

  if (rows.length === 0) {
    return (
      <div className="ep-empty">
        <div className="ep-empty-icon">🧺</div>
        <p>No items in this head category yet.</p>
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
    <div className={`ep-list mode-${mode} ${showCats ? '' : 'hide-cats'}`}>
      <datalist id={`categories-${tabId}`}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="ep-head">
        <div className="row-gap">
          {mode === 'normal' && (
            <>
              <button className="btn primary sm" onClick={onAdd}>
                ＋ Add item
              </button>
              <button className="btn ghost sm" onClick={() => switchMode('select')}>
                Select
              </button>
              <span className="list-menu-wrap">
                <button className="btn ghost sm more-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="More list options" aria-expanded={menuOpen}>
                  ⋯
                </button>
                {menuOpen && (
                  <>
                    <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
                    <div className="list-menu" role="menu">
                      <button role="menuitem" onClick={() => switchMode('reorder')}>
                        <span className="menu-ico">⇅</span> Reorder items
                      </button>
                      <button role="menuitem" onClick={toggleCats}>
                        <span className="menu-ico">🏷</span> {showCats ? 'Hide category tags' : 'Show category tags'}
                      </button>
                    </div>
                  </>
                )}
              </span>
            </>
          )}
          {mode !== 'normal' && (
            <>
              <button className="btn primary sm" onClick={() => switchMode('normal')}>
                {mode === 'reorder' ? 'Done' : 'Cancel'}
              </button>
              <span className="mode-hint">{mode === 'reorder' ? 'Drag ⠿ to move items' : 'Tap items to copy or merge'}</span>
            </>
          )}
        </div>
        {mode === 'normal' && (
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
      {rows.map((item, i) => (
        <ItemRow
          key={item.id}
          item={item}
          index={i}
          pk={pk}
          tabId={tabId}
          prevPeriod={prevPeriod}
          prevLabel={prevLabel}
          currency={currency}
          view={view}
          save={saver(item.id)}
          focus={focusId === item.id}
          mode={mode}
          picked={picked.has(item.id)}
          onPick={() => togglePick(item.id)}
          onOpen={() => onOpenItem(tabId, item.id)}
          expanded={expanded.has(item.id)}
          onToggle={() => toggleExpand(item.id)}
          dragItem={mode === 'select' ? null : drag.itemProps(item.id)}
          dragHandle={mode === 'select' ? null : drag.handleProps(item.id)}
          ctx={ctx}
        />
      ))}
      </div>

      {selecting ? (
        <div className="select-bar">
          <span>{picked.size ? `${picked.size} selected` : 'Tap items to copy or merge'}</span>
          <div className="row-gap">
            <button className="btn glass sm" disabled={!picked.size} onClick={copySelected}>
              Copy{picked.size ? ` ${picked.size}` : ''}
            </button>
            <button className="btn primary sm" disabled={picked.size < 2} onClick={merge}>
              Merge{picked.size >= 2 ? ` ${picked.size}` : ''}
            </button>
          </div>
        </div>
      ) : (
        <div className="ep-foot">
          <div className="row-gap">
            <button className="btn glass" onClick={onAdd}>
              ＋ Add item
            </button>
            <button className="btn ghost sm" onClick={onImport}>
              Paste from sheet
            </button>
          </div>
          <span className="ep-total">
            {FREQS[view].label} total <b>{formatMoney(tabInView(items, view, ctx), currency)}</b>
          </span>
        </div>
      )}

      {setAside > 0 && !selecting && (
        <div className="set-aside" title="The yearly bills in this list, spread over 12 months">
          <span>
            <b>Set aside for yearly bills</b>
            <span className="muted small"> · so they’re covered when due</span>
          </span>
          <span className="set-aside-amt">
            {formatMoney(setAside, currency)}
            <span className="per-small">/mo</span>
            <span className="muted small"> ({formatMoney(setAside * 12, currency)}/yr)</span>
          </span>
        </div>
      )}

      {groups.length > 1 && !selecting && (
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
