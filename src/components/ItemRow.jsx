import { FREQS, amountInView, compareItem, groupCatLabel, inView, itemCats, monthlyOf, partCats, partMonthly, sorted } from '../lib/budget';
import { formatMoney, parseAmount } from '../lib/format';
import { usePresenceCtx } from '../hooks/usePresence';
import CatField, { GroupCat } from './CatField';
import { ChangeBadge, FreqPill } from './ChangeBadge';
import LiveInput from './LiveInput';
import PotIcon from './PotIcon';

const FIELDS = ['name', 'category', 'note', 'amount'];

// One compact line per item: name, merged count, categories, amount.
// Notes and details live in the item's card (›).
export default function ItemRow(props) {
  const { item, index, pk, tabId, prevPeriod, prevLabel, currency, view, save, focus } = props;
  const { mode, picked, onPick, onOpen, expanded, onToggle, onMove, isFirst, isLast, ctx } = props;
  const { lockFor, colorFor } = usePresenceCtx();
  const key = (f) => `${pk}:item:${item.id}:${f}`;
  const editor = FIELDS.map((f) => lockFor(key(f))).find(Boolean);
  const change = compareItem(item, item.id, prevPeriod);
  const isGroup = Boolean(item.parts);
  const freq = item.freq === 'yearly' ? 'yearly' : 'monthly';
  const groupView = item.view || view;
  const selecting = mode === 'select';
  const reordering = mode === 'reorder';
  const locked = selecting || reordering;

  const conv =
    !isGroup && freq !== view
      ? item.track && view === 'yearly'
        ? `${formatMoney(amountInView(item, item.id, view, ctx), currency)} saved`
        : `≈ ${formatMoney(inView(monthlyOf(item), view), currency)}${FREQS[view].short}`
      : null;

  return (
    <div
      className={`ep ${editor ? 'remote' : ''} ${change ? 'changed' : ''} ${picked ? 'picked' : ''} ${reordering ? 'reordering' : ''}`}
      style={editor ? { '--c': colorFor(editor.user) } : undefined}
      onClick={selecting ? onPick : undefined}
    >
      <span className="ep-num">
        {selecting ? <input type="checkbox" className="pick" checked={picked} readOnly aria-label={`Select ${item.name}`} /> : index + 1}
      </span>

      <div className="ep-line">
        {item.track && <PotIcon size={17} />}
        <LiveInput
          className="ep-name"
          fieldKey={key('name')}
          value={item.name || ''}
          onSave={save('name')}
          placeholder="What is it?"
          autoFocusOnMount={focus}
          disabled={locked}
        />
        {isGroup && (
          <button
            className={`parts-chip ${expanded ? 'open' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            disabled={locked}
            aria-expanded={expanded}
            title={expanded ? 'Hide the parts' : 'Show the parts'}
          >
            <span className="chev-sm">▸</span> {Object.keys(item.parts).length}
          </button>
        )}
        {item.note && (
          <button
            className="note-dot"
            title={item.note}
            aria-label="Has a note, open details"
            onClick={(e) => {
              e.stopPropagation();
              if (!locked) onOpen();
            }}
          >
            📝
          </button>
        )}
        {isGroup ? (
          <GroupCat label={groupCatLabel(item)} cats={itemCats(item)} />
        ) : (
          <CatField fieldKey={key('category')} value={item.category} onSave={save('category')} listId={`categories-${tabId}`} disabled={locked} />
        )}
      </div>

      <div className="ep-amt">
        <ChangeBadge change={change} prevLabel={prevLabel} currency={currency} view={view} />
        {conv && <span className="conv">{conv}</span>}
        {isGroup ? (
          <button className="group-amt" onClick={onOpen} disabled={locked}>
            {formatMoney(amountInView(item, item.id, groupView, ctx), currency)}
            <span className="per-small">{FREQS[groupView].short}</span>
          </button>
        ) : (
          <>
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
              disabled={locked}
            />
            <FreqPill freq={freq} onChange={save('freq')} disabled={locked} />
          </>
        )}
      </div>

      {reordering ? (
        <span className="move-btns ep-more">
          <button className="icon-btn" onClick={() => onMove(-1)} disabled={isFirst} aria-label={`Move ${item.name} up`}>
            ▲
          </button>
          <button className="icon-btn" onClick={() => onMove(1)} disabled={isLast} aria-label={`Move ${item.name} down`}>
            ▼
          </button>
        </span>
      ) : (
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
      )}

      {isGroup && expanded && (
        <ul className="ep-parts">
          {sorted(item.parts).map((p) => (
            <li key={p.id}>
              <span className="ep-part-name">
                {p.name || 'Untitled'}
                {partCats(p, item).map((c) => (
                  <span key={c} className="cat-chip tiny">
                    {c}
                  </span>
                ))}
              </span>
              <span className="ep-part-amt">
                {(p.freq === 'yearly' ? 'yearly' : 'monthly') !== view && (
                  <span className="ep-part-conv">
                    = {formatMoney(inView(partMonthly(p), view), currency)}
                    {FREQS[view].short}
                  </span>
                )}
                {formatMoney(p.amount, currency)}
                <span className={`freq-tag ${p.freq === 'yearly' ? 'yr' : ''}`}>{p.freq === 'yearly' ? 'Yr' : 'Mo'}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
