import { FREQS, afterExpenses, sorted } from '../lib/budget';
import { newKey, patchPath, setPath } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import LiveInput from './LiveInput';
import Modal from './Modal';

// Summary cards at the top: each person's salary and what's left after the
// head categories they chose.
export function SalaryStrip({ base, period, currency, view, ctx, onOpen }) {
  const people = sorted(period?.people);

  function add() {
    const id = newKey(`${base}/people`);
    patchPath(`${base}/people/${id}`, { name: '', salary: 0, order: Date.now() }).then(() => onOpen(id));
  }

  return (
    <div className="salary-strip">
      {people.map((p) => {
        const { salary, left } = afterExpenses(p, period, view, ctx);
        return (
          <button key={p.id} className="salary-card" onClick={() => onOpen(p.id)}>
            <span className="salary-name">{p.name || 'Unnamed'}</span>
            <span className="salary-line">
              <span className="muted small">Salary</span>
              <b>{formatMoney(salary, currency)}</b>
            </span>
            <span className="salary-line">
              <span className="muted small">After expenses</span>
              <b className={left < 0 ? 'neg' : 'pos'}>{formatMoney(left, currency)}</b>
            </span>
          </button>
        );
      })}
      <button className="salary-card add" onClick={add}>
        <span className="plus">＋</span>
        <span>{people.length ? 'Add person' : 'Add salary'}</span>
      </button>
    </div>
  );
}

export function PersonSheet({ base, pk, personId, person, period, tabs, currency, view, ctx, onClose }) {
  const path = `${base}/people/${personId}`;
  const { salary, spent, left } = afterExpenses(person, period, view, ctx);
  const chosen = person.tabs || {};

  async function remove() {
    if (!window.confirm(`Remove ${person.name || 'this person'} from the summary?`)) return;
    onClose();
    await setPath(path, null);
  }

  return (
    <Modal title="Salary" onClose={onClose}>
      <div className="sheet">
        <div className="sheet-grid">
          <label className="field">
            <span>Name</span>
            <LiveInput
              fieldKey={`${pk}:person:${personId}:name`}
              value={person.name || ''}
              onSave={(v) => patchPath(path, { name: v })}
              placeholder="e.g. Hamizan"
              autoFocusOnMount={!person.name}
            />
          </label>
          <label className="field">
            <span>Monthly salary</span>
            <LiveInput
              className="ep-amount"
              inputMode="decimal"
              fieldKey={`${pk}:person:${personId}:salary`}
              value={person.salary}
              format={(v) => (v ? String(v) : '')}
              parse={parseAmount}
              display={(v) => formatMoney(v, currency)}
              onSave={(v) => patchPath(path, { salary: v })}
              placeholder="0.00"
            />
          </label>
        </div>

        <section className="sheet-section">
          <h3>After expenses = salary minus…</h3>
          {tabs.map((t) => (
            <label key={t.id} className="switch-row">
              <input
                type="checkbox"
                checked={Boolean(chosen[t.id])}
                onChange={(e) => patchPath(`${path}/tabs`, { [t.id]: e.target.checked || null })}
              />
              <span>{t.name || 'Untitled'}</span>
            </label>
          ))}
        </section>

        <div className="sheet-summary">
          <span>
            <span className="muted small">Salary </span>
            <b>{formatMoney(salary, currency)}</b>
          </span>
          <span>
            <span className="muted small">− Expenses </span>
            <b>{formatMoney(spent, currency)}</b>
          </span>
          <span>
            <span className="muted small">= Left </span>
            <b className={left < 0 ? 'neg' : 'pos'}>{formatMoney(left, currency)}</b>
            <span className="muted small">{FREQS[view].short}</span>
          </span>
        </div>

        <div className="sheet-actions">
          <button className="btn danger sm" onClick={remove}>
            Remove person
          </button>
        </div>
      </div>
    </Modal>
  );
}
