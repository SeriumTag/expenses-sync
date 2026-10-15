import { useState } from 'react';
import { FREQS, afterExpenses, monthlyIncome, sorted } from '../lib/budget';
import { newKey, patchPath, setPath } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import LiveInput from './LiveInput';
import Modal from './Modal';
import { confirmTwice } from '../lib/confirm';

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
        const extras = Object.keys(p.incomes || {}).length;
        return (
          <button key={p.id} className="salary-card" onClick={() => onOpen(p.id)}>
            <span className="salary-name">{p.name || 'Unnamed'}</span>
            <span className="salary-line">
              <span className="muted small" title={extras ? 'Salary plus other income' : undefined}>
                {extras ? `Income (+${extras})` : 'Salary'}
              </span>
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
  const incomes = sorted(person.incomes);
  const [newIncome, setNewIncome] = useState(null); // focus the name of a just-added income

  function addIncome() {
    const id = newKey(`${path}/incomes`);
    setNewIncome(id);
    patchPath(`${path}/incomes/${id}`, { name: '', amount: 0, order: Date.now() });
  }
  function removeIncome(x) {
    if (!confirmTwice(`Remove “${x.name || 'this income'}”${x.amount ? ` (${formatMoney(x.amount, currency)}/mo)` : ''}?`, `“${x.name || 'this income'}”`)) return;
    setPath(`${path}/incomes/${x.id}`, null);
  }

  async function remove() {
    if (!confirmTwice(`Remove ${person.name || 'this person'} from the summary?`, `${person.name || 'this person'}`)) return;
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
            <span>Main salary (monthly)</span>
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
          <h3>Other income</h3>
          {incomes.length === 0 && <p className="muted small">Side jobs, allowances, rental… e.g. Grab $1,200 a month.</p>}
          {incomes.length > 0 && (
            <div className="income-list">
              {incomes.map((x) => (
                <div key={x.id} className="income-row">
                  <LiveInput
                    className="income-name"
                    fieldKey={`${pk}:person:${personId}:income:${x.id}:name`}
                    value={x.name || ''}
                    onSave={(v) => person.incomes?.[x.id] && patchPath(`${path}/incomes/${x.id}`, { name: v })}
                    placeholder="Name, e.g. Grab"
                    autoFocusOnMount={x.id === newIncome}
                    aria-label="Income name"
                  />
                  <LiveInput
                    className="ep-amount income-amt"
                    inputMode="decimal"
                    fieldKey={`${pk}:person:${personId}:income:${x.id}:amount`}
                    value={x.amount}
                    format={(v) => (v ? String(v) : '')}
                    parse={parseAmount}
                    display={(v) => formatMoney(v, currency)}
                    onSave={(v) => person.incomes?.[x.id] && patchPath(`${path}/incomes/${x.id}`, { amount: v })}
                    placeholder="0.00"
                    aria-label={`${x.name || 'Income'} per month`}
                  />
                  <span className="muted small">/mo</span>
                  <button className="icon-btn" aria-label={`Remove ${x.name || 'income'}`} onClick={() => removeIncome(x)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="sheet-row between">
            <button className="btn glass sm" onClick={addIncome}>
              ＋ Add income
            </button>
            {incomes.length > 0 && (
              <span className="ep-total">
                Total income <b>{formatMoney(monthlyIncome(person), currency)}</b>
                <span className="muted small">/mo</span>
              </span>
            )}
          </div>
        </section>

        <section className="sheet-section">
          <h3>After expenses = income minus…</h3>
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
            <span className="muted small">{incomes.length ? 'Income ' : 'Salary '}</span>
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
