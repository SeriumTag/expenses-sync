import { useMemo, useRef } from 'react';
import { usePresenceCtx } from '../hooks/usePresence';
import { deleteItem, updateItemField } from '../lib/db';
import { PERIODS, byCategory, formatMoney, parseAmount, round2, sumItems } from '../lib/format';
import LiveInput from './LiveInput';

const FIELDS = ['name', 'category', 'note', 'amount'];

export default function ItemList({
  ledgerId,
  tabId,
  items,
  categories,
  currency,
  username,
  focusId,
  view,
  onViewChange,
  onAdd,
  onImport,
}) {
  const { lockFor, colorFor } = usePresenceCtx();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const { factor, short } = PERIODS[view];

  const rows = useMemo(
    () =>
      Object.entries(items || {})
        .map(([id, item]) => ({ id, ...item }))
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [items],
  );
  const groups = useMemo(() => byCategory(items), [items]);

  // Skip writes to a row the other person just deleted, so it isn't half-recreated.
  const save = (itemId, field) => (value) => {
    if (!itemsRef.current?.[itemId]) return;
    return updateItemField(ledgerId, tabId, itemId, field, value, username);
  };

  // You type in whatever period is showing; it's stored per month.
  const amountProps = {
    format: (v) => (v ? String(round2(v * factor)) : ''),
    parse: (text) => {
      const n = parseAmount(text);
      return n === undefined ? undefined : n / factor;
    },
    display: (v) => formatMoney((Number(v) || 0) * factor, currency),
  };

  if (rows.length === 0) {
    return (
      <div className="ep-empty">
        <div className="ep-empty-icon">🧾</div>
        <p>No items in this tab yet.</p>
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
    <div className="ep-list">
      <datalist id={`categories-${tabId}`}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="ep-head">
        <span />
        <span>Item · Category · Note</span>
        <div className="seg" role="group" aria-label="Show amounts">
          {Object.entries(PERIODS).map(([key, p]) => (
            <button key={key} className={view === key ? 'on' : ''} aria-pressed={view === key} onClick={() => onViewChange(key)}>
              {p.label}
            </button>
          ))}
        </div>
        <span />
      </div>

      {rows.map((item, i) => {
        const editor = FIELDS.map((f) => lockFor(`item:${item.id}:${f}`)).find(Boolean);
        return (
          <div
            key={item.id}
            className={`ep ${editor ? 'remote' : ''}`}
            style={editor ? { '--c': colorFor(editor.user) } : undefined}
          >
            <span className="ep-num">{i + 1}</span>
            <div className="ep-main">
              <LiveInput
                className="ep-name"
                fieldKey={`item:${item.id}:name`}
                value={item.name || ''}
                onSave={save(item.id, 'name')}
                placeholder="What is it?"
                autoFocusOnMount={focusId === item.id}
              />
              <div className="ep-sub">
                <LiveInput
                  className="ep-cat"
                  fieldKey={`item:${item.id}:category`}
                  value={item.category || ''}
                  onSave={save(item.id, 'category')}
                  placeholder="Category"
                  list={`categories-${tabId}`}
                  maxLength={40}
                />
                <LiveInput
                  className="ep-note"
                  fieldKey={`item:${item.id}:note`}
                  value={item.note || ''}
                  onSave={save(item.id, 'note')}
                  placeholder="Add a note"
                  maxLength={2000}
                  multiline
                />
              </div>
            </div>
            <LiveInput
              key={view}
              className="ep-amount"
              inputMode="decimal"
              fieldKey={`item:${item.id}:amount`}
              value={item.amount}
              {...amountProps}
              onSave={save(item.id, 'amount')}
              placeholder="0.00"
              aria-label={`${PERIODS[view].label} amount`}
            />
            <button
              className="icon-btn ep-del"
              title={editor ? `${editor.user} is editing this` : 'Delete'}
              aria-label="Delete item"
              disabled={Boolean(editor)}
              onClick={() => deleteItem(ledgerId, tabId, item.id)}
            >
              ✕
            </button>
          </div>
        );
      })}

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
          {PERIODS[view].label} total <b>{formatMoney(sumItems(items) * factor, currency)}</b>
        </span>
      </div>

      {groups.length > 1 && (
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
                {formatMoney(g.total * factor, currency)}
                <span className="muted small">{short}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
