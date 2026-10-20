import { FREQS, amountInView, budgetStatus, spentMode, compareItem, itemCats, inView, partCats, partMonthly, sorted } from '../lib/budget';
import { formatMoney } from '../lib/format';
import { usePresenceCtx } from '../hooks/usePresence';
import { ChangeBadge } from './ChangeBadge';

const FIELDS = ['name', 'category', 'note', 'amount'];

// One line per item, read-only: tap it to open its card and change things
// there (so nothing gets changed by accident). In Edit mode the row can be
// ticked (to copy / combine) and dragged by its grip.
export default function ItemRow(props) {
  const { item, pk, prevPeriod, prevLabel, currency, view, ctx, showCats, groupName } = props;
  const { editing, picked, onPick, onOpen, expanded, onToggle, dragItem, dragHandle } = props;
  const { lockFor, colorFor } = usePresenceCtx();
  const editor = FIELDS.map((f) => lockFor(`${pk}:item:${item.id}:${f}`)).find(Boolean);
  const change = compareItem(item, item.id, prevPeriod);
  const isGroup = Boolean(item.parts);
  const freq = item.freq === 'yearly' ? 'yearly' : 'monthly';
  const shownView = isGroup ? item.view || view : view;
  const noBudget = spentMode(item);
  const status = item.budget && ctx?.pk ? budgetStatus(item, item.id, ctx.spending, ctx.pk) : null;
  const amount = amountInView(item, item.id, shownView, ctx);
  const icon = item.track ? '🐷' : item.budget ? '💸' : null;
  const cats = showCats ? itemCats(item) : [];
  const fileCount = Object.keys(item.files || {}).length;

  // Small second line: the original amount when it's yearly (or monthly in the
  // yearly view), the parts of a combined item, categories.
  const native =
    !isGroup && !noBudget && freq !== view ? `${formatMoney(Number(item.amount) || 0, currency)}${freq === 'yearly' ? '/yr' : '/mo'}` : null;

  return (
    <div
      className={`ep2 ${editor ? 'remote' : ''} ${change ? 'changed' : ''} ${picked ? 'picked' : ''} ${editing ? 'editing' : ''}`}
      style={editor ? { '--c': colorFor(editor.user) } : undefined}
      role="button"
      tabIndex={0}
      onClick={editing ? onPick : onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), editing ? onPick() : onOpen())}
      aria-label={editing ? `Select ${item.name || 'item'}` : `Open ${item.name || 'item'}`}
      {...(dragItem || {})}
    >
      {editing && <input type="checkbox" className="pick" checked={picked} readOnly tabIndex={-1} aria-hidden="true" />}
      <div className="ep2-main">
        <span className="ep2-name">
          {icon && <span className="ep2-ico">{icon}</span>}
          <span className={item.name ? '' : 'muted'}>{item.name || 'Untitled'}</span>
          {item.note && (
            <span className="ep2-mark" title={item.note}>
              📝
            </span>
          )}
          {fileCount > 0 && (
            <span className="ep2-mark" title={`${fileCount} attachment(s)`}>
              📎
            </span>
          )}
        </span>
        {(native || isGroup || cats.length > 0 || groupName || editor) && (
          <span className="ep2-sub">
            {editor && <span className="ep2-editing">{editor.user} is editing…</span>}
            {groupName && <span>{groupName}</span>}
            {isGroup && (
              <button
                className={`parts-link ${expanded ? 'open' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                aria-expanded={expanded}
              >
                {Object.keys(item.parts).length} parts {expanded ? '▾' : '▸'}
              </button>
            )}
            {native && <span>{native}</span>}
            {cats.length > 0 && <span>{cats.join(' · ')}</span>}
          </span>
        )}
      </div>

      <div className="ep2-amt">
        <span className="ep2-amount">
          <ChangeBadge change={change} prevLabel={prevLabel} currency={currency} view={view} />
          <b>{formatMoney(amount, currency)}</b>
          <span className="per-small">{noBudget ? ' spent' : item.track && shownView === 'yearly' ? ' saved' : FREQS[shownView].short}</span>
        </span>
        {status && !noBudget && (
          <span className={`ep2-left ${status.left < 0 ? 'neg' : 'pos'}`}>
            {status.left < 0 ? `${formatMoney(-status.left, currency)} over` : `${formatMoney(status.left, currency)} left`}
          </span>
        )}
      </div>

      {editing ? (
        <span
          className="grip ep2-grip drag-handle"
          title="Drag to move"
          aria-label={`Drag ${item.name} to move it`}
          onClick={(e) => e.stopPropagation()}
          {...(dragHandle || {})}
        >
          ⠿
        </span>
      ) : (
        <span className="ep2-chev" aria-hidden="true">
          ›
        </span>
      )}

      {isGroup && expanded && (
        <ul className="ep-parts">
          {sorted(item.parts).map((p) => (
            <li key={p.id}>
              <span className="ep-part-name">
                {p.name || 'Untitled'}
                {showCats &&
                  partCats(p, item).map((c) => (
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

// Used by search: which item matches the words typed.
export function matchesSearch(item, words) {
  const text = [item.name, item.note, item.category, ...Object.values(item.parts || {}).flatMap((p) => [p.name, p.category, p.note])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((w) => text.includes(w));
}

