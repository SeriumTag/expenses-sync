import { useMemo, useRef, useState } from 'react';
import { usePresenceCtx } from '../hooks/usePresence';
import { addItem, deleteItem, updateItemField } from '../lib/db';
import { formatMoney, parseAmount, sumItems } from '../lib/format';
import LiveInput from './LiveInput';

const FIELDS = ['date', 'name', 'amount'];

export default function ItemList({ ledgerId, tabId, items, currency, username }) {
  const { lockFor, colorFor } = usePresenceCtx();
  const [focusId, setFocusId] = useState(null);
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

  return (
    <div className="items">
      <div className="item-head">
        <span>Date</span>
        <span>Item</span>
        <span className="num">Amount</span>
        <span />
      </div>

      {rows.length === 0 && <p className="muted empty-row">No items yet. Add your first expense below.</p>}

      {rows.map((item) => {
        const editor = FIELDS.map((f) => lockFor(`item:${item.id}:${f}`)).find(Boolean);
        return (
          <div
            key={item.id}
            className={`item-row ${editor ? 'remote-editing' : ''}`}
            style={editor ? { '--c': colorFor(editor.user) } : undefined}
          >
            <LiveInput
              className="f-date"
              type="date"
              fieldKey={`item:${item.id}:date`}
              value={item.date || ''}
              onSave={save(item.id, 'date')}
              aria-label="Date"
            />
            <LiveInput
              className="f-name"
              fieldKey={`item:${item.id}:name`}
              value={item.name || ''}
              onSave={save(item.id, 'name')}
              placeholder="What was it for?"
              autoFocusOnMount={focusId === item.id}
            />
            <LiveInput
              className="f-amount"
              inputMode="decimal"
              fieldKey={`item:${item.id}:amount`}
              value={item.amount}
              parse={parseAmount}
              format={(v) => (v ? String(v) : '')}
              display={(v) => (Number(v) || 0).toFixed(2)}
              onSave={save(item.id, 'amount')}
              placeholder="0.00"
              aria-label="Amount"
            />
            <button
              className="icon-btn f-del"
              title={editor ? `${editor.user} is editing this row` : 'Delete item'}
              aria-label="Delete item"
              disabled={Boolean(editor)}
              onClick={() => deleteItem(ledgerId, tabId, item.id)}
            >
              ✕
            </button>
          </div>
        );
      })}

      <div className="items-foot">
        <button className="btn" onClick={() => setFocusId(addItem(ledgerId, tabId, username))}>
          + Add item
        </button>
        <span className="total">
          Tab total <b>{formatMoney(sumItems(items), currency)}</b>
        </span>
      </div>
    </div>
  );
}
