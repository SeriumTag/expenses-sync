import { useMemo, useRef } from 'react';
import { usePresenceCtx } from '../hooks/usePresence';
import { deleteItem, updateItemField } from '../lib/db';
import { formatMoney, parseAmount, sumItems } from '../lib/format';
import LiveInput from './LiveInput';

const FIELDS = ['date', 'name', 'amount'];

export default function ItemList({ ledgerId, tabId, items, currency, username, focusId, onAdd }) {
  const { lockFor, colorFor } = usePresenceCtx();
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const rows = useMemo(
    () =>
      Object.entries(items || {})
        .map(([id, item]) => ({ id, ...item }))
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [items],
  );

  // Skip writes to a row the other person just deleted, so it isn't half-recreated.
  const save = (itemId, field) => (value) => {
    if (!itemsRef.current?.[itemId]) return;
    return updateItemField(ledgerId, tabId, itemId, field, value, username);
  };

  if (rows.length === 0) {
    return (
      <div className="ep-empty">
        <div className="ep-empty-icon">🧾</div>
        <p>No expenses in this tab yet.</p>
        <button className="btn primary" onClick={onAdd}>
          ＋ Add the first one
        </button>
      </div>
    );
  }

  return (
    <div className="ep-list">
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
                placeholder="What was it for?"
                autoFocusOnMount={focusId === item.id}
              />
              <LiveInput
                className="ep-date"
                type="date"
                fieldKey={`item:${item.id}:date`}
                value={item.date || ''}
                onSave={save(item.id, 'date')}
                aria-label="Date"
              />
            </div>
            <LiveInput
              className="ep-amount"
              inputMode="decimal"
              fieldKey={`item:${item.id}:amount`}
              value={item.amount}
              parse={parseAmount}
              format={(v) => (v ? String(v) : '')}
              display={(v) => formatMoney(v, currency)}
              onSave={save(item.id, 'amount')}
              placeholder="0.00"
              aria-label="Amount"
            />
            <button
              className="icon-btn ep-del"
              title={editor ? `${editor.user} is editing this` : 'Delete'}
              aria-label="Delete expense"
              disabled={Boolean(editor)}
              onClick={() => deleteItem(ledgerId, tabId, item.id)}
            >
              ✕
            </button>
          </div>
        );
      })}

      <div className="ep-foot">
        <button className="btn glass" onClick={onAdd}>
          ＋ Add expense
        </button>
        <span className="ep-total">
          Tab total <b>{formatMoney(sumItems(items), currency)}</b>
        </span>
      </div>
    </div>
  );
}
