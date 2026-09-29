import { FREQS, compareItem, inView, monthlyOf, partMonthly, sorted } from '../lib/budget';
import { formatMoney, parseAmount } from '../lib/format';
import { usePresenceCtx } from '../hooks/usePresence';
import { ChangeBadge, FreqPill } from './ChangeBadge';
import LiveInput from './LiveInput';

const FIELDS = ['name', 'category', 'note', 'amount'];

export default function ItemRow(props) {
  const { item, index, pk, tabId, prevPeriod, prevLabel, currency, view, save, focus } = props;
  const { selecting, picked, onPick, onOpen, expanded, onToggle } = props;
  const { lockFor, colorFor } = usePresenceCtx();
  const key = (f) => `${pk}:item:${item.id}:${f}`;
  const editor = FIELDS.map((f) => lockFor(key(f))).find(Boolean);
  const change = compareItem(item, item.id, prevPeriod);
  const isGroup = Boolean(item.parts);
  const freq = item.freq === 'yearly' ? 'yearly' : 'monthly';
  const groupView = item.view || view;

  return (
    <div
      className={`ep ${editor ? 'remote' : ''} ${change ? 'changed' : ''} ${picked ? 'picked' : ''}`}
      style={editor ? { '--c': colorFor(editor.user) } : undefined}
      onClick={selecting ? onPick : undefined}
    >
      <span className="ep-num">
        {selecting ? <input type="checkbox" className="pick" checked={picked} readOnly aria-label={`Select ${item.name}`} /> : index + 1}
      </span>
      <div className="ep-main">
        <LiveInput
          className="ep-name"
          fieldKey={key('name')}
          value={item.name || ''}
          onSave={save('name')}
          placeholder="What is it?"
          autoFocusOnMount={focus}
          disabled={selecting}
        />
        <div className="ep-sub">
          <LiveInput
            className="ep-cat"
            fieldKey={key('category')}
            value={item.category || ''}
            onSave={save('category')}
            placeholder="Category"
            list={`categories-${tabId}`}
            maxLength={40}
            disabled={selecting}
          />
          {isGroup && (
            <button
              className={`parts-chip ${expanded ? 'open' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              disabled={selecting}
              aria-expanded={expanded}
              title={expanded ? 'Hide the parts' : 'Show the parts'}
            >
              <span className="chev-sm">▸</span> {Object.keys(item.parts).length} items
            </button>
          )}
          {item.track && <span className="track-chip">Savings</span>}
          <LiveInput
            className="ep-note"
            fieldKey={key('note')}
            value={item.note || ''}
            onSave={save('note')}
            placeholder="Add a note"
            maxLength={2000}
            multiline
            disabled={selecting}
          />
        </div>
      </div>
      <div className="ep-amt">
        {isGroup ? (
          <button className="group-amt" onClick={onOpen} disabled={selecting}>
            {formatMoney(inView(monthlyOf(item), groupView), currency)}
            <span className="per-small">{FREQS[groupView].short}</span>
          </button>
        ) : (
          <div className="amt-line">
            <LiveInput
              className="ep-amount"
              inputMode="decimal"
              fieldKey={key('amount')}
              value={item.amount}
              format={(v) => (v ? String(v) : '')}
              parse={parseAmount}
              display={(v) => formatMoney(v, currency)}
              onSave={save('amount')}
              placeholder="0.00"
              aria-label="Amount"
              disabled={selecting}
            />
            <FreqPill freq={freq} onChange={save('freq')} disabled={selecting} />
          </div>
        )}
        {!isGroup && freq !== view && (
          <span className="conv">
            ≈ {formatMoney(inView(monthlyOf(item), view), currency)}
            {FREQS[view].short}
          </span>
        )}
        <ChangeBadge change={change} prevLabel={prevLabel} currency={currency} view={view} />
      </div>
      {isGroup && expanded && (
        <ul className="ep-parts">
          {sorted(item.parts).map((p) => (
            <li key={p.id}>
              <span className="ep-part-name">{p.name || 'Untitled'}</span>
              <span className="ep-part-amt">
                {formatMoney(p.amount, currency)}
                <span className={`freq-tag ${p.freq === 'yearly' ? 'yr' : ''}`}>{p.freq === 'yearly' ? 'Yr' : 'Mo'}</span>
                {(p.freq === 'yearly' ? 'yearly' : 'monthly') !== view && (
                  <span className="ep-part-conv">
                    = {formatMoney(inView(partMonthly(p), view), currency)}
                    {FREQS[view].short}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        className="icon-btn ep-more"
        title="Details"
        aria-label={`Details for ${item.name || 'item'}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!selecting) onOpen();
        }}
      >
        ›
      </button>
    </div>
  );
}
