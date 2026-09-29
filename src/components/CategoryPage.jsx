import { useState } from 'react';
import { FREQS, amountInView, itemsInCategory, savingsMonths, savingsTotal, sorted, yearOf } from '../lib/budget';
import { newKey, patchPath, setPath } from '../lib/db';
import { formatMoney } from '../lib/format';
import LiveInput from './LiveInput';
import Modal from './Modal';

const FIELD_TYPES = { text: 'Text', date: 'Date', number: 'Number' };

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
  const { fav, onFav } = props;
  const path = `ledgers/${ledgerId}/categories/${catKeyValue}`;
  const entries = itemsInCategory(period, catKeyValue);
  const subs = sorted(catData?.subs);
  const fields = sorted(catData?.fields);
  const meta = catData?.entries || {};
  const [newField, setNewField] = useState(null); // { name, type }

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
  ].filter((g) => g.sub || g.rows.length);

  return (
    <section className="cat-page">
      <button className="btn ghost sm back" onClick={onBack}>
        ‹ Back
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

      <div className="cat-tools">
        <button className="btn glass sm" onClick={addSub}>
          ＋ Subcategory
        </button>
        <button className="btn glass sm" onClick={() => setNewField({ name: '', type: 'text' })}>
          ＋ Field
        </button>
        {fields.map((f) => (
          <span key={f.id} className="field-chip">
            <LiveInput
              fieldKey={`cat:${catKeyValue}:field:${f.id}`}
              value={f.name}
              onSave={(v) => patchPath(`${path}/fields/${f.id}`, { name: v })}
              aria-label="Field name"
            />
            <small>{FIELD_TYPES[f.type] || 'Text'}</small>
            <button className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => removeField(f)}>
              ✕
            </button>
          </span>
        ))}
      </div>
      {newField && (
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
        return (
          <div key={g.sub?.id || 'none'} className="sub-group">
            <div className="sub-head">
              {g.sub ? (
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
              {g.sub && (
                <button className="icon-btn" aria-label={`Remove ${g.sub.name}`} onClick={() => removeSub(g.sub)}>
                  ✕
                </button>
              )}
            </div>
            {g.rows.length === 0 && <p className="muted small">Nothing here yet. Move items in using their subcategory menu.</p>}
            {g.rows.map((e) => {
              const m = meta[e.id] || {};
              const tracked = e.item.track ? savingsTotal(savingsMonths(yearOf(pk), e.id, tracks?.[e.id]?.log, periods)) : null;
              return (
                <div key={e.id} className={`cat-entry ${m.exclude ? 'excluded' : ''}`}>
                  <div className="cat-entry-top">
                    <input
                      type="checkbox"
                      className="pick"
                      checked={!m.exclude}
                      onChange={(ev) => patchPath(`${path}/entries/${e.id}`, { exclude: ev.target.checked ? null : true })}
                      aria-label={`Count ${e.item.name} in the total`}
                      title="Count in total"
                    />
                    <button className="cat-entry-name" onClick={() => onOpenItem(e.tabId, e.id)}>
                      <b>{e.item.name || 'Untitled'}</b>
                      <span className="tab-badge">{e.tabName || 'Untitled'}</span>
                      {e.item.parts && <span className="muted small">{Object.keys(e.item.parts).length} items</span>}
                    </button>
                    <b className="cat-entry-amt">
                      {formatMoney(amount(e), currency)}
                      <span className="per-small">{FREQS[view].short}</span>
                    </b>
                  </div>
                  {e.item.note && <p className="cat-entry-note">{e.item.note}</p>}
                  {tracked !== null && (
                    <p className="cat-entry-saved">
                      Saved in {yearOf(pk)}: <b>{formatMoney(tracked, currency)}</b>
                    </p>
                  )}
                  <div className="cat-entry-fields">
                    {subs.length > 0 && (
                      <label className="field">
                        <span>Subcategory</span>
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
                      <label key={f.id} className="field">
                        <span>{f.name}</span>
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
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
