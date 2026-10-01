import { useState } from 'react';
import { FREQS, amountInView, catKey, itemsInCategory, savingsMonths, savingsTotal, sorted, yearOf } from '../lib/budget';
import { newKey, patchPath, setPath } from '../lib/db';
import { formatMoney } from '../lib/format';
import { prefs } from '../lib/session';
import { reordered, useDragSort } from '../hooks/useDragSort';
import LiveInput from './LiveInput';
import PotIcon from './PotIcon';
import Modal from './Modal';

const DAY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A keyed field value as plain text, e.g. a date as "12 Oct 2026".
function fieldText(f, v) {
  if (f.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${Number(v.slice(8))} ${DAY_MONTHS[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`;
  return String(v);
}

const FIELD_TYPES = { text: 'Text', date: 'Date', number: 'Number' };
const TYPE_ICONS = { text: 'T', date: '📅', number: '#' };

// List of every category used in this period.
export function CategoriesSheet({ categories, favs, currency, view, onOpen, onFav, onClose }) {
  return (
    <Modal title="Categories" onClose={onClose}>
      {categories.length === 0 ? (
        <p className="muted">No categories yet. Type one in an item’s Category box, e.g. “Insurance”.</p>
      ) : (
        <>
          <p className="muted small">Tap ☆ to add a category to your favourites.</p>
          <div className="cat-list">
            {categories.map((c) => (
              <div key={c.key} className="cat-list-item">
                <FavButton fav={favs?.[c.key]} label={c.label} onClick={() => onFav(c.key, c.label)} />
                <button className="cat-list-row" onClick={() => onOpen(c.key)}>
                  <span className="cat-list-name">{c.label}</span>
                  <span className="muted small">
                    {c.count} item{c.count === 1 ? '' : 's'}
                  </span>
                  <b>
                    {formatMoney(c.total, currency)}
                    <span className="muted small">{FREQS[view].short}</span>
                  </b>
                  <span className="chev">›</span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ☆ when not a favourite; its chosen icon when it is. Either way, tap to change.
export function FavButton({ fav, label, onClick }) {
  return (
    <button
      className={`fav-btn ${fav ? 'on' : ''}`}
      onClick={onClick}
      title={fav ? `Change icon or remove ${label} from favourites` : `Add ${label} to favourites`}
      aria-label={fav ? `${label} is a favourite, change icon` : `Add ${label} to favourites`}
    >
      {fav ? fav.icon : '☆'}
    </button>
  );
}

// Everything in one category across all head categories, with the user's own
// subcategories, extra fields and choice of what counts toward the total.
export function CategoryPage(props) {
  const { ledgerId, pk, period, periods, catKeyValue, label, catData, tracks, currency, view, onViewChange, onBack, onOpenItem, ctx } = props;
  const { fav, onFav, onOpenCategory, backLabel } = props;
  const path = `ledgers/${ledgerId}/categories/${catKeyValue}`;
  const meta = catData?.entries || {};
  // Your own order first (from Reorder), then the order items appear in their lists.
  const entries = itemsInCategory(period, catKeyValue)
    .map((e, i) => ({ ...e, rank: meta[e.id]?.order ?? 1e12 + i }))
    .sort((a, b) => a.rank - b.rank);
  const subs = sorted(catData?.subs);
  const fields = sorted(catData?.fields);
  const [newField, setNewField] = useState(null); // { name, type }
  // Locked (the default) = nothing can be typed or moved by accident. Compact
  // shows one line per item; both views only show fields that have something
  // keyed in, as text, unless unlocked in Detailed. Remembered on this device.
  const [locked, setLocked] = useState(() => prefs.get('catLocked') ?? true);
  const [compact, setCompact] = useState(() => prefs.get('catCompact') ?? false);
  const toggleLock = () => {
    setLocked((v) => {
      prefs.set('catLocked', !v);
      return !v;
    });
    setNewField(null);
  };
  const pickCompact = (v) => {
    setCompact(v);
    prefs.set('catCompact', v);
  };
  const editing = !locked && !compact;
  const keyed = (m) => fields.filter((f) => m.values?.[f.id] !== undefined && m.values?.[f.id] !== null && m.values?.[f.id] !== '');

  const counted = entries.filter((e) => !meta[e.id]?.exclude);
  const amount = (e) => amountInView(e.item, e.id, view, ctx);
  const total = counted.reduce((s, e) => s + amount(e), 0);

  const addSub = () => {
    const name = window.prompt('Subcategory name (e.g. Hubby, Wife, Kids)');
    if (name?.trim()) patchPath(`${path}/subs/${newKey(`${path}/subs`)}`, { name: name.trim(), order: Date.now() });
  };
  const addField = () => {
    if (!newField?.name?.trim()) return;
    patchPath(`${path}/fields/${newKey(`${path}/fields`)}`, { name: newField.name.trim(), type: newField.type, order: Date.now() });
    setNewField(null);
  };
  const removeSub = (s) => {
    if (!window.confirm(`Remove subcategory “${s.name}”? Its items move to “No subcategory”.`)) return;
    const patch = { [`subs/${s.id}`]: null };
    Object.entries(meta).forEach(([id, m]) => m.sub === s.id && (patch[`entries/${id}/sub`] = null));
    patchPath(path, patch);
  };
  const removeField = (f) => {
    if (!window.confirm(`Remove the “${f.name}” field and what’s been typed in it?`)) return;
    const patch = { [`fields/${f.id}`]: null };
    Object.keys(meta).forEach((id) => (patch[`entries/${id}/values/${f.id}`] = null));
    patchPath(path, patch);
  };

  const groups = [
    ...subs.map((s) => ({ sub: s, rows: entries.filter((e) => meta[e.id]?.sub === s.id) })),
    { sub: null, rows: entries.filter((e) => !subs.some((s) => s.id === meta[e.id]?.sub)) },
  ].filter((g) => g.sub || g.rows.length || subs.length);

  // Drag an item (by its grip, or press and hold) to a new place — including
  // into another subcategory. The whole page's order is rewritten so every
  // group keeps its places.
  const drag = useDragSort({
    scope: `cat-${catKeyValue}`,
    onDrop: ({ id, toGroup, index }) => {
      const patch = {};
      const order = groups.flatMap((g) => {
        const key = g.sub?.id || 'none';
        const ids = g.rows.map((e) => e.id).filter((x) => x !== id);
        return key === toGroup ? reordered([...ids, id], id, index) : ids;
      });
      order.forEach((eid, i) => (patch[`entries/${eid}/order`] = (i + 1) * 1000));
      patch[`entries/${id}/sub`] = toGroup === 'none' ? null : toGroup;
      patchPath(path, patch);
    },
  });
  // Field chips drag sideways.
  const fieldDrag = useDragSort({
    scope: `fields-${catKeyValue}`,
    axis: 'x',
    onDrop: ({ id, index }) => {
      const patch = {};
      reordered(
        fields.map((f) => f.id),
        id,
        index,
      ).forEach((fid, i) => (patch[`fields/${fid}/order`] = (i + 1) * 1000));
      patchPath(path, patch);
    },
  });

  return (
    <section className="cat-page">
      <button className="btn ghost sm back" onClick={onBack}>
        ‹ {backLabel || 'Back'}
      </button>
      <div className="kicker">Category</div>
      <div className="cat-title-row">
        <h1 className="hero-title cat-title">{label}</h1>
        <FavButton fav={fav} label={label} onClick={onFav} />
      </div>
      <div className="cat-total">
        <div>
          <div className="hero-total">
            {formatMoney(total, currency)}
            <span className="per-small">{FREQS[view].short}</span>
          </div>
          <span className="muted small">
            Total of {counted.length} of {entries.length} item{entries.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="seg" role="group" aria-label="Show amounts">
          {Object.entries(FREQS).map(([k, p]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => onViewChange(k)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cat-view-bar">
        <button className={`btn sm lock-btn ${locked ? 'locked' : 'glass'}`} onClick={toggleLock} aria-pressed={locked} title={locked ? 'Unlock to edit fields and move items' : 'Lock to avoid accidental changes'}>
          {locked ? '🔒 Locked' : '🔓 Unlocked'}
        </button>
        <div className="seg" role="group" aria-label="Category view">
          <button className={compact ? 'on' : ''} aria-pressed={compact} onClick={() => pickCompact(true)}>
            Compact
          </button>
          <button className={!compact ? 'on' : ''} aria-pressed={!compact} onClick={() => pickCompact(false)}>
            Detailed
          </button>
        </div>
      </div>
      {!locked && (
        <div className="cat-tools">
          <button className="btn glass sm" onClick={addSub}>
            ＋ Subcategory
          </button>
          <button className="btn glass sm" onClick={() => setNewField({ name: '', type: 'text' })}>
            ＋ Field
          </button>
          {(entries.length > 1 || subs.length > 0) && <span className="mode-hint">Drag ⠿ to move or regroup</span>}
        </div>
      )}
      {!locked && fields.length > 0 && (
        <div className="field-chips" aria-label="Fields" {...fieldDrag.groupProps()}>
          {fields.map((f) => (
            <span key={f.id} className="field-chip" {...fieldDrag.itemProps(f.id)}>
              {fields.length > 1 && (
                <span className="grip drag-handle" title="Drag to move" aria-label={`Drag ${f.name} to move it`} {...fieldDrag.handleProps(f.id)}>
                  ⠿
                </span>
              )}
              <LiveInput
                fieldKey={`cat:${catKeyValue}:field:${f.id}`}
                value={f.name}
                onSave={(v) => patchPath(`${path}/fields/${f.id}`, { name: v })}
                aria-label="Field name"
              />
              <small title={`${FIELD_TYPES[f.type] || 'Text'} field`}>{TYPE_ICONS[f.type] || 'T'}</small>
              <button className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => removeField(f)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {newField && !locked && (
        <form
          className="new-field"
          onSubmit={(e) => {
            e.preventDefault();
            addField();
          }}
        >
          <input
            autoFocus
            value={newField.name}
            onChange={(e) => setNewField({ ...newField, name: e.target.value })}
            placeholder="Field name, e.g. Policy number"
          />
          <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })}>
            {Object.entries(FIELD_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className="btn primary sm">Add</button>
          <button type="button" className="btn ghost sm" onClick={() => setNewField(null)}>
            Cancel
          </button>
        </form>
      )}

      {entries.length === 0 && <p className="muted">No items use this category in this period.</p>}

      {groups.map((g) => {
        const subTotal = g.rows.filter((e) => !meta[e.id]?.exclude).reduce((s, e) => s + amount(e), 0);
        const groupKey = g.sub?.id || 'none';
        return (
          <div key={groupKey} className="sub-group" {...drag.groupProps(groupKey)}>
            <div className="sub-head">
              {g.sub && locked ? (
                <span className="sub-name">{g.sub.name || 'Untitled'}</span>
              ) : g.sub ? (
                <LiveInput
                  className="sub-name"
                  fieldKey={`cat:${catKeyValue}:sub:${g.sub.id}`}
                  value={g.sub.name}
                  onSave={(v) => patchPath(`${path}/subs/${g.sub.id}`, { name: v })}
                  aria-label="Subcategory name"
                />
              ) : (
                <span className="sub-name muted">{subs.length ? 'No subcategory' : 'Items'}</span>
              )}
              <span className="sub-total">{formatMoney(subTotal, currency)}</span>
              {g.sub && !locked && (
                <button className="icon-btn" aria-label={`Remove ${g.sub.name}`} onClick={() => removeSub(g.sub)}>
                  ✕
                </button>
              )}
            </div>
            {g.rows.length === 0 && <p className="drop-empty">{locked ? 'No items' : 'Drag items here'}</p>}
            {g.rows.map((e) => {
              const m = meta[e.id] || {};
              const tracked = e.item.track ? savingsTotal(savingsMonths(yearOf(pk), e.id, tracks?.[e.id]?.log, periods)) : null;
              return (
                <div
                  key={e.id}
                  className={`cat-entry ${m.exclude ? 'excluded' : ''} ${compact ? 'compact' : ''}`}
                  {...(locked ? {} : drag.itemProps(e.id, groupKey))}
                >
                  <div className="cat-entry-top">
                    {!locked && (
                      <span className="grip drag-handle" title="Drag to move" aria-label={`Drag ${e.item.name} to move it`} {...drag.handleProps(e.id, groupKey)}>
                        ⠿
                      </span>
                    )}
                    <input
                      type="checkbox"
                      className="pick"
                      disabled={locked}
                      checked={!m.exclude}
                      onChange={(ev) => patchPath(`${path}/entries/${e.id}`, { exclude: ev.target.checked ? null : true })}
                      aria-label={`Count ${e.item.name} in the total`}
                      title="Count in total"
                    />
                    <div className="cat-entry-name">
                      <button className="cat-entry-open" onClick={() => onOpenItem(e.tabId, e.parentId || e.id)}>
                        <b>{e.item.name || 'Untitled'}</b>
                        {e.item.track && <PotIcon />}
                      </button>
                      <span className="tab-badge">{e.tabName || 'Untitled'}</span>
                      {e.parentId && <span className="muted small">in {e.parentName || 'merged item'}</span>}
                      {/* The item's other categories — tap to jump there. */}
                      {e.cats
                        .filter((c) => catKey(c) !== catKeyValue)
                        .map((c) => (
                          <button key={c} className="also-cat" onClick={() => onOpenCategory(catKey(c))} title={`Open the ${c} category`}>
                            {c}
                          </button>
                        ))}
                    </div>
                    <b className="cat-entry-amt">
                      {formatMoney(amount(e), currency)}
                      <span className="per-small">{FREQS[view].short}</span>
                    </b>
                  </div>
                  {!compact && e.item.note && <p className="cat-entry-note">{e.item.note}</p>}
                  {!compact && tracked !== null && (
                    <p className="cat-entry-saved">
                      Saved in {yearOf(pk)}: <b>{formatMoney(tracked, currency)}</b>
                    </p>
                  )}
                  {!editing && keyed(m).length > 0 && (
                    <div className={compact ? 'cf-inline' : 'cf-text'}>
                      {keyed(m).map((f) => (
                        <span key={f.id} className="cf-pair">
                          <span className="cf-label">{f.name}</span> <b>{fieldText(f, m.values[f.id])}</b>
                        </span>
                      ))}
                    </div>
                  )}
                  {editing && (
                    <div className="cat-entry-fields" style={{ '--cols': fields.length + (subs.length > 0 ? 1 : 0) }}>
                      {subs.length > 0 && (
                        <label className="cf">
                          <span className="cf-label">Subcategory</span>
                          <select value={m.sub || ''} onChange={(ev) => patchPath(`${path}/entries/${e.id}`, { sub: ev.target.value || null })}>
                            <option value="">None</option>
                            {subs.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {fields.map((f) => (
                        <label key={f.id} className={`cf cf-${f.type || 'text'}`}>
                          <span className="cf-label" title={f.name}>
                            {f.name}
                          </span>
                          <LiveInput
                            type={f.type === 'date' ? 'date' : 'text'}
                            inputMode={f.type === 'number' ? 'decimal' : undefined}
                            fieldKey={`cat:${catKeyValue}:${e.id}:${f.id}`}
                            value={m.values?.[f.id] ?? ''}
                            onSave={(v) => setPath(`${path}/entries/${e.id}/values/${f.id}`, v === '' ? null : v)}
                            placeholder={f.type === 'date' ? '' : '—'}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
