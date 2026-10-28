import { useMemo, useRef, useState } from 'react';
import { MONTHS, catKey } from '../lib/budget';
import { newKey, patchPath } from '../lib/db';
import { formatMoney } from '../lib/format';
import { parseStatement } from '../lib/statement';
import Modal from './Modal';

const dayName = (d) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : 'No date');
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Paste a bank / card statement, check each line, and add them as spends.
// budgets: [{ id, name }]; importRules: { catKey(bank category): budgetId } remembered from last time.
export default function StatementImport({ ledgerId, budgets, spending, importRules, currency, username, onAddBudget, onClose }) {
  const [step, setStep] = useState('paste'); // 'paste' | 'review' | 'done'
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);
  const budgetName = (id) => budgets.find((b) => b.id === id)?.name || 'Untitled';

  // Already logged in that budget: same date, amount and merchant.
  const isDup = (r, budgetId) =>
    Boolean(budgetId) &&
    Object.values(spending?.[budgetId] || {}).some((s) => s.date === r.date && Math.abs((Number(s.amount) || 0) - r.amount) < 0.005 && same(s.note, r.merchant));

  function read(content) {
    const found = parseStatement(content);
    if (!found.length) {
      setError('Couldn’t find any transactions. Paste the list with its dates and amounts (e.g. “Mon, 14 Sep 2026 … -356.70”).');
      return;
    }
    setError('');
    const fallback = budgets.length === 1 ? budgets[0].id : '';
    setRows(
      found.map((r) => {
        const remembered = importRules?.[catKey(r.category)];
        const budget = budgets.some((b) => b.id === remembered) ? remembered : fallback;
        return { ...r, budget, include: !r.credit && Boolean(r.date) && !isDup(r, budget) };
      }),
    );
    setStep('review');
  }

  function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ''));
      read(String(reader.result || ''));
    };
    reader.onerror = () => setError('Couldn’t read that file.');
    reader.readAsText(file);
  }

  const setRow = (id, patch) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const putAll = (budget) => setRows((list) => list.map((r) => ({ ...r, budget, include: r.include || (!r.credit && Boolean(r.date) && !isDup(r, budget)) })));

  const chosen = rows.filter((r) => r.include && r.budget && r.date);
  const chosenTotal = chosen.reduce((s, r) => s + r.amount, 0);
  const missingBudget = rows.some((r) => r.include && !r.budget);
  const spendCount = rows.filter((r) => !r.credit).length;

  async function save() {
    if (!chosen.length || saving) return;
    setSaving(true);
    const patch = {};
    const now = Date.now();
    chosen.forEach((r, i) => {
      const key = newKey(`ledgers/${ledgerId}/spending/${r.budget}`);
      patch[`spending/${r.budget}/${key}`] = {
        date: r.date,
        note: r.merchant,
        category: r.category || null,
        amount: r.amount,
        by: username || null,
        at: now + i,
        source: 'import',
      };
      // Remember which budget this bank category goes to, for next time.
      if (r.category) patch[`importRules/${catKey(r.category)}`] = r.budget;
    });
    try {
      await patchPath(`ledgers/${ledgerId}`, patch);
      const perBudget = {};
      chosen.forEach((r) => (perBudget[r.budget] = (perBudget[r.budget] || 0) + r.amount));
      setResult({ count: chosen.length, total: chosenTotal, perBudget });
      setStep('done');
    } catch (err) {
      setError(err.message || 'Couldn’t save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  // Group the review list by month, newest first, like the statement.
  const months = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = r.date ? r.date.slice(0, 7) : 'none';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <Modal title="Import a statement" onClose={onClose}>
      {budgets.length === 0 ? (
        <div className="empty-card flat">
          <div className="empty-ico">💸</div>
          <p>
            <b>First, add a spending budget</b>
            <br />
            e.g. Credit Card or Food. Statement lines are added as spends under your budgets.
          </p>
          <button className="btn primary" onClick={onAddBudget}>
            ＋ Add a spending budget
          </button>
        </div>
      ) : step === 'paste' ? (
        <div className="stmt-paste">
          <p className="muted small">
            Copy the transactions from your bank or card app (with their dates) and paste them here, or choose a saved .txt / .csv file.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Mon, 14 Sep 2026\nMerchant name\nDetails\nCategory\nSGD\n-356.70'}
            rows={9}
            aria-label="Statement text"
          />
          {error && <p className="att-error">{error}</p>}
          <div className="row-gap">
            <button className="btn primary" disabled={!text.trim()} onClick={() => read(text)}>
              Read statement
            </button>
            <button className="btn glass" onClick={() => fileInput.current?.click()}>
              Choose file
            </button>
            <input ref={fileInput} type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" hidden onChange={pickFile} />
          </div>
        </div>
      ) : step === 'review' ? (
        <div className="stmt-review">
          <p className="small">
            Found <b>{spendCount}</b> spend{spendCount === 1 ? '' : 's'}
            {rows.length > spendCount && <span className="muted"> and {rows.length - spendCount} payment/refund (left out)</span>}. Pick a budget for each, or:
          </p>
          <label className="stmt-putall">
            <span>Put all in</span>
            <select value="" onChange={(e) => e.target.value && putAll(e.target.value)} aria-label="Put all lines in one budget">
              <option value="">Choose a budget…</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || 'Untitled'}
                </option>
              ))}
            </select>
          </label>

          {months.map(([month, list]) => (
            <section key={month} className="stmt-month">
              <h4>{month === 'none' ? 'No date found' : `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`}</h4>
              {list.map((r) => {
                const dup = isDup(r, r.budget);
                return (
                  <div key={r.id} className={`stmt-row ${r.include ? '' : 'off'} ${r.credit ? 'credit' : ''}`}>
                    <input
                      type="checkbox"
                      className="pick"
                      checked={r.include}
                      disabled={!r.date}
                      onChange={(e) => setRow(r.id, { include: e.target.checked })}
                      aria-label={`Add ${r.merchant}`}
                    />
                    <div className="stmt-main">
                      <span className="stmt-top">
                        <b>{r.merchant}</b>
                        <b className={r.credit ? 'pos' : ''}>
                          {r.credit ? '+' : ''}
                          {formatMoney(r.amount, currency)}
                        </b>
                      </span>
                      <span className="stmt-sub muted small">
                        {dayName(r.date)}
                        {r.category && <span className="s-cat">{r.category}</span>}
                        {r.credit && <span>payment / refund</span>}
                        {dup && <span className="stmt-dup">already added</span>}
                      </span>
                      <select value={r.budget} onChange={(e) => setRow(r.id, { budget: e.target.value })} aria-label={`Budget for ${r.merchant}`}>
                        <option value="">Choose a budget…</option>
                        {budgets.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name || 'Untitled'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}

          {error && <p className="att-error">{error}</p>}
          <div className="stmt-actions">
            <button className="btn ghost" onClick={() => setStep('paste')}>
              Back
            </button>
            <button className="btn primary" disabled={!chosen.length || saving} onClick={save}>
              {saving ? 'Adding…' : `Add ${chosen.length} spend${chosen.length === 1 ? '' : 's'} · ${formatMoney(chosenTotal, currency)}`}
            </button>
          </div>
          {missingBudget && <p className="muted small">Ticked lines without a budget are left out.</p>}
        </div>
      ) : (
        <div className="empty-card flat">
          <div className="empty-ico">✅</div>
          <p>
            <b>
              Added {result.count} spend{result.count === 1 ? '' : 's'} · {formatMoney(result.total, currency)}
            </b>
          </p>
          <ul className="stmt-done">
            {Object.entries(result.perBudget).map(([id, total]) => (
              <li key={id}>
                {budgetName(id)} <b>{formatMoney(total, currency)}</b>
              </li>
            ))}
          </ul>
          <p className="muted small">Each spend is in the month of its own date. Next time, the same bank categories go to the same budgets.</p>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
