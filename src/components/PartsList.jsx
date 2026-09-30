import { FREQS, inView, partMonthly, sorted } from '../lib/budget';
import { newKey, patchPath, setPath } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import CatField from './CatField';
import { FreqPill } from './ChangeBadge';
import { reordered, useDragSort } from '../hooks/useDragSort';
import LiveInput from './LiveInput';

// The breakdown inside a merged item, e.g. Kids Insurance → PA (Arissa) $211.08/yr …
export default function PartsList({ path, lockPrefix, item, currency, globalView, listId }) {
  const view = item.view || globalView;
  const showEach = item.showMonthly !== false;
  const parts = sorted(item.parts);
  const total = parts.reduce((s, p) => s + partMonthly(p), 0);
  const count = parts.length;

  const savePart = (pid, field) => (value) => item.parts?.[pid] && patchPath(`${path}/parts/${pid}`, { [field]: value });
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
      patchPath(path, patch);
    },
  });
  const addPart = () =>
    patchPath(`${path}/parts/${newKey(`${path}/parts`)}`, { name: '', amount: 0, freq: 'monthly', category: '', order: Date.now() });

  return (
    <section className="sheet-section">
      <div className="sheet-row between">
        <h3>Breakdown</h3>
        <div className="seg" role="group" aria-label="Show this item as">
          {Object.entries(FREQS).map(([k, p]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => patchPath(path, { view: k })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={showEach} onChange={(e) => patchPath(path, { showMonthly: e.target.checked })} />
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
              <CatField
                fieldKey={`${lockPrefix}:${p.id}:category`}
                value={p.category ?? item.category}
                onSave={savePart(p.id, 'category')}
                listId={listId}
                className="part-cat"
              />
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
              <div className="amt-line">
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
              onClick={() => setPath(`${path}/parts/${p.id}`, null)}
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
