import { FREQS, inView, partMonthly, sorted } from '../lib/budget';
import { newKey, patchPath } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import CatField from './CatField';
import { FreqPill } from './ChangeBadge';
import { reordered, useDragSort } from '../hooks/useDragSort';
import LiveInput from './LiveInput';
import { confirmTwice } from '../lib/confirm';

// The breakdown inside a merged item, e.g. Kids Insurance → PA (Arissa) $211.08/yr …
export default function PartsList({ path, lockPrefix, item, currency, globalView, listId, saveForward, driveOwners = [], personName = () => '', topUps = () => 0 }) {
  // Writes go through saveForward (this month and later ones) when given.
  const write = (patch) => (saveForward ? saveForward(patch) : patchPath(path, patch));
  const view = item.view || globalView;
  const showEach = item.showMonthly !== false;
  const parts = sorted(item.parts);
  const total = parts.reduce((s, p) => s + partMonthly(p), 0);
  const count = parts.length;

  const savePart = (pid, field) => (value) => item.parts?.[pid] && write({ [`parts/${pid}/${field}`]: value });
  // Drag parts by their grip to reorder them.
  const drag = useDragSort({
    scope: `parts-${lockPrefix}`,
    onDrop: ({ id, index }) => {
      const patch = {};
      reordered(
        parts.map((p) => p.id),
        id,
        index,
      ).forEach((pid, i) => (patch[`parts/${pid}/order`] = i));
      write(patch);
    },
  });
  const addPart = () =>
    write({ [`parts/${newKey(`${path}/parts`)}`]: { name: '', amount: 0, freq: 'monthly', category: '', order: Date.now() } });

  return (
    <section className="sheet-section">
      <div className="sheet-row between">
        <h3>Breakdown</h3>
        <div className="seg" role="group" aria-label="Show this item as">
          {Object.entries(FREQS).map(([k, p]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => write({ view: k })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={showEach} onChange={(e) => write({ showMonthly: e.target.checked })} />
        <span>Show each part’s {view === 'yearly' ? 'yearly' : 'monthly'} amount</span>
      </label>

      <div className="parts" {...drag.groupProps()}>
        {parts.map((p) => (
          <div key={p.id} className="part" {...drag.itemProps(p.id)}>
            <span className="grip part-grip drag-handle" title="Drag to move" aria-label={`Drag ${p.name || 'part'} to move it`} {...drag.handleProps(p.id)}>
              ⠿
            </span>
            <div className="part-main">
              <LiveInput
                className="part-name"
                fieldKey={`${lockPrefix}:${p.id}:name`}
                value={p.name || ''}
                onSave={savePart(p.id, 'name')}
                placeholder="Part name"
              />
              {item.category && <span className="part-inherit" title="From the combined item">{item.category} +</span>}
              <CatField
                fieldKey={`${lockPrefix}:${p.id}:category`}
                value={p.category || ''}
                placeholder={item.category ? 'Extra category' : 'Category'}
                onSave={savePart(p.id, 'category')}
                listId={listId}
                className="part-cat"
              />
              {/* Worked-out amounts for this part */}
              <div className="part-rules">
                <label className="part-rule">
                  <input type="checkbox" checked={Boolean(p.auto)} onChange={(e) => write({ [`parts/${p.id}/auto`]: e.target.checked ? { total: 1800 } : null, [`parts/${p.id}/link`]: null })} />
                  <span>Automatic: total minus the other parts</span>
                </label>
                {p.auto && (
                  <label className="part-total">
                    <span>Set total</span>
                    <LiveInput
                      inputMode="decimal"
                      fieldKey={`${lockPrefix}:${p.id}:autoTotal`}
                      value={p.auto.total}
                      format={(v) => (v ? String(v) : '')}
                      parse={parseAmount}
                      display={(v) => formatMoney(v, currency)}
                      onSave={(v) => v > 0 && write({ [`parts/${p.id}/auto`]: { total: v } })}
                      aria-label="Set total"
                    />
                  </label>
                )}
                {p.auto && (
                  <span className="muted small">
                    {formatMoney(Number(p.auto.total) || 0, currency)} − {formatMoney(Math.max(0, (Number(p.auto.total) || 0) - (Number(p.amount) || 0)), currency)} of the other parts
                  </span>
                )}
                {driveOwners.length > 0 && (
                  <label className="part-rule">
                    <input type="checkbox" checked={Boolean(p.link?.cashcard)} onChange={(e) => write({ [`parts/${p.id}/link`]: e.target.checked ? { cashcard: driveOwners[0] } : null, [`parts/${p.id}/auto`]: null })} />
                    <span>Amount = Grab cash card top-ups</span>
                  </label>
                )}
                {p.link?.cashcard && (
                  <span className="muted small">
                    {formatMoney(topUps(p.link.cashcard), currency)} topped up this month on {personName(p.link.cashcard)}’s Drive page
                  </span>
                )}
              </div>
              <LiveInput
                className="ep-note"
                fieldKey={`${lockPrefix}:${p.id}:note`}
                value={p.note || ''}
                onSave={savePart(p.id, 'note')}
                placeholder="Note"
                multiline
              />
            </div>
            <div className="part-amt">
              {(p.auto || p.link?.cashcard) && (
                <div className="amt-line part-computed">
                  <b>{formatMoney(Number(p.amount) || 0, currency)}</b>
                  <span className="muted small">/mo</span>
                </div>
              )}
              <div className="amt-line" hidden={Boolean(p.auto || p.link?.cashcard)}>
                <LiveInput
                  className="ep-amount"
                  inputMode="decimal"
                  fieldKey={`${lockPrefix}:${p.id}:amount`}
                  value={p.amount}
                  format={(v) => (v ? String(v) : '')}
                  parse={parseAmount}
                  display={(v) => formatMoney(v, currency)}
                  onSave={savePart(p.id, 'amount')}
                  placeholder="0.00"
                  aria-label="Amount"
                />
                <FreqPill freq={p.freq} onChange={savePart(p.id, 'freq')} />
              </div>
              {showEach && (
                <span className="conv">
                  = {formatMoney(inView(partMonthly(p), view), currency)}
                  {FREQS[view].short}
                </span>
              )}
            </div>
            <button
              className="icon-btn"
              aria-label="Remove part"
              disabled={count <= 1}
              onClick={() => confirmTwice(`Remove “${p.name || 'this part'}” from ${item.name || 'this item'}?`, `“${p.name || 'this part'}”`) && write({ [`parts/${p.id}`]: null })}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="sheet-row between">
        <button className="btn glass sm" onClick={addPart}>
          ＋ Add part
        </button>
        <span className="ep-total">
          Total <b>{formatMoney(inView(total, view), currency)}</b>
          <span className="muted small">{FREQS[view].short}</span>
        </span>
      </div>
    </section>
  );
}
