import { useMemo, useRef, useState } from 'react';
import { FREQS, byCategory, inView, sorted, sumTab } from '../lib/budget';
import { mergeItems, updateItemField } from '../lib/db';
import { formatMoney } from '../lib/format';
import ItemRow from './ItemRow';

export default function ItemList(props) {
  const { base, pk, tabId, items, prevPeriod, prevLabel, categories, currency, username, focusId, view } = props;
  const { onViewChange, onAdd, onImport, onOpenItem } = props;
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const rows = useMemo(() => sorted(items), [items]);
  const groups = useMemo(() => byCategory(items), [items]);

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

  async function merge() {
    const chosen = rows.filter((r) => picked.has(r.id));
    const cats = [...new Set(chosen.map((r) => (r.category || '').trim()).filter(Boolean))];
    const suggestion = cats.length === 1 ? cats[0] : chosen.map((r) => r.name).join(' + ');
    const name = window.prompt('Name for the merged item', suggestion);
    if (!name?.trim()) return;
    const id = await mergeItems(base, tabId, chosen, name.trim(), username);
    setSelecting(false);
    setPicked(new Set());
    onOpenItem(tabId, id);
  }

  if (rows.length === 0) {
    return (
      <div className="ep-empty">
        <div className="ep-empty-icon">🧾</div>
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
    <div className={`ep-list ${selecting ? 'selecting' : ''}`}>
      <datalist id={`categories-${tabId}`}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="ep-head">
        <button
          className={`btn sm ${selecting ? 'primary' : 'ghost'}`}
          onClick={() => {
            setSelecting((s) => !s);
            setPicked(new Set());
          }}
        >
          {selecting ? 'Cancel' : 'Select to merge'}
        </button>
        <div className="seg" role="group" aria-label="Show amounts">
          {Object.entries(FREQS).map(([k, p]) => (
            <button key={k} className={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => onViewChange(k)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

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
          selecting={selecting}
          picked={picked.has(item.id)}
          onPick={() => togglePick(item.id)}
          onOpen={() => onOpenItem(tabId, item.id)}
        />
      ))}

      {selecting ? (
        <div className="select-bar">
          <span>{picked.size ? `${picked.size} selected` : 'Tap items to merge'}</span>
          <button className="btn primary" disabled={picked.size < 2} onClick={merge}>
            Merge{picked.size >= 2 ? ` ${picked.size}` : ''} items
          </button>
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
            {FREQS[view].label} total <b>{formatMoney(inView(sumTab(items), view), currency)}</b>
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
                {formatMoney(inView(g.total, view), currency)}
                <span className="muted small">{FREQS[view].short}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
