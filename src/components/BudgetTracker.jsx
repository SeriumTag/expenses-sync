import { useRef, useState } from 'react';
import { MONTHS, allSpendCategories, budgetStatus, isYearKey, spendCategoryTotals, splitCats } from '../lib/budget';
import { confirmTwice } from '../lib/confirm';
import { newKey, patchPath, setPath } from '../lib/db';
import { attachFile } from '../lib/files';
import { formatMoney, parseAmount } from '../lib/format';
import Attachments from './Attachments';
import LiveInput from './LiveInput';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const dayName = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

// New spends default to today when today is in the period, else its first day.
function defaultDate(pk) {
  const t = today();
  if (isYearKey(pk)) return t.startsWith(`${pk}-`) ? t : `${pk}-01-01`;
  return t.startsWith(pk) ? t : `${pk}-01`;
}

// Budget, spent and left with a bar — shared by the item card and the Budgets list.
export function BudgetBar({ status, currency }) {
  const { budget, spent, left, noBudget } = status;
  if (noBudget) {
    return (
      <div className="budget-bar none">
        <div className="budget-nums">
          <span>
            <span className="muted small">Spent </span>
            <b>{formatMoney(spent, currency)}</b>
          </span>
          <span className="muted small">No fixed budget · counts what’s spent</span>
        </div>
      </div>
    );
  }
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : spent > 0 ? 100 : 0;
  const over = left < 0;
  return (
    <div className={`budget-bar ${over ? 'over' : pct >= 80 ? 'near' : ''}`}>
      <div className="budget-nums">
        <span>
          <span className="muted small">Spent </span>
          <b>{formatMoney(spent, currency)}</b>
          <span className="muted small"> of {formatMoney(budget, currency)}</span>
        </span>
        <span className="budget-left">
          <span className="muted small">{over ? 'Over by ' : 'Left '}</span>
          <b>{formatMoney(Math.abs(left), currency)}</b>
        </span>
      </div>
      <div className="budget-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Log what was spent against an item's budget, e.g. Food: 2 Oct Chicken rice $4.
// otherBudgets: [{ id, name }] — the other tracked budgets a spend can be moved to.
export default function BudgetTracker({ ledgerId, itemId, item, pk, spending, currency, username, otherBudgets = [], showList = true, autoFocus = false }) {
  const status = budgetStatus(item, itemId, spending, pk);
  const path = `ledgers/${ledgerId}/spending/${itemId}`;
  const [form, setForm] = useState(() => ({ date: defaultDate(pk), note: '', category: '', amount: '' }));
  const [listOpen, setListOpen] = useState(showList);
  const [pendingFiles, setPendingFiles] = useState([]); // photos picked before tapping Add
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null); // spend whose details (date, move, receipts) are open
  const [notice, setNotice] = useState('');
  const fileInput = useRef(null);
  const amount = parseAmount(form.amount);
  const canAdd = amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(form.date);

  async function add(e) {
    e.preventDefault();
    if (!canAdd || saving) return;
    const id = newKey(path);
    const files = pendingFiles;
    setSaving(true);
    setError('');
    try {
      await patchPath(`${path}/${id}`, {
        date: form.date,
        note: form.note.trim() || null,
        category: splitCats(form.category).join(', ') || null,
        amount,
        by: username || null,
        at: Date.now(),
      });
      setForm({ date: form.date, note: '', category: '', amount: '' }); // keep the date for logging several in a row
      setNotice(`✓ Added ${form.note.trim() || 'spend'} ${formatMoney(amount, currency)}`);
      setTimeout(() => setNotice(''), 3000);
      setPendingFiles([]);
      setListOpen(true);
      // Then any receipt photos picked for it.
      const problems = [];
      for (const file of files) {
        try {
          await attachFile(ledgerId, `spending/${itemId}/${id}`, file, username);
        } catch (err) {
          problems.push(err.message);
        }
      }
      if (problems.length) setError(problems.join(' '));
    } finally {
      setSaving(false);
    }
  }

  // Edits to a spend; skipped if the other person just removed or moved it.
  const saveSpend = (s, field) => (value) => spending?.[itemId]?.[s.id] && patchPath(`${path}/${s.id}`, { [field]: value });

  // Move a spend (with its receipts) to another tracked budget.
  async function moveTo(s, targetId) {
    const target = otherBudgets.find((b) => b.id === targetId);
    const entry = spending?.[itemId]?.[s.id];
    if (!target || !entry) return;
    setDetail(null);
    await patchPath(`ledgers/${ledgerId}/spending`, { [`${itemId}/${s.id}`]: null, [`${targetId}/${s.id}`]: entry });
    setNotice(`Moved “${s.note || 'spend'}” to ${target.name || 'another budget'}.`);
    setTimeout(() => setNotice(''), 4000);
  }

  function remove(s) {
    if (!confirmTwice(`Remove “${s.note || 'this spend'}” (${formatMoney(s.amount, currency)}) on ${dayName(s.date)}? It goes back into the budget.`, 'this spend')) return;
    setDetail(null);
    setPath(`${path}/${s.id}`, null);
  }

  const catList = `spend-cats-${itemId}`;
  const suggestions = allSpendCategories(spending);
  const byCat = spendCategoryTotals(status.spends);
  const maxCat = Math.max(...byCat.map((c) => c.total), 0);

  // Keep dates inside the period being shown.
  const range = isYearKey(pk)
    ? { min: `${pk}-01-01`, max: `${pk}-12-31` }
    : { min: `${pk}-01`, max: `${pk}-${String(new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)), 0).getDate()).padStart(2, '0')}` };

  return (
    <div className="budget-tracker">
      <BudgetBar status={status} currency={currency} />

      {byCat.length > 0 && (
        <details className="spend-cats" open={showList}>
          <summary>By category</summary>
          {byCat.map((c) => (
            <div key={c.label} className="cat-row">
              <span className="cat-name">
                {c.label} <span className="muted small">· {c.count}</span>
              </span>
              <span className="cat-bar">
                <span style={{ width: `${maxCat ? (c.total / maxCat) * 100 : 0}%` }} />
              </span>
              <span className="cat-amt">{formatMoney(c.total, currency)}</span>
            </div>
          ))}
        </details>
      )}

      <datalist id={catList}>
        {suggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <form className="spend-form" onSubmit={add}>
        <input
          type="date"
          value={form.date}
          min={range.min}
          max={range.max}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          aria-label="Date spent"
        />
        <input
          autoFocus={autoFocus}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="What? e.g. Chicken rice"
          aria-label="What was it"
        />
        <input
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          placeholder="Category (optional)"
          list={catList}
          aria-label="Category"
        />
        <input
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder={formatMoney(0, currency)}
          aria-label="Amount spent"
        />
        <button
          type="button"
          className={`btn sm spend-clip ${pendingFiles.length ? 'glass on' : 'ghost'}`}
          onClick={() => fileInput.current?.click()}
          title="Attach a receipt photo or file"
          aria-label={pendingFiles.length ? `${pendingFiles.length} file(s) to attach` : 'Attach a receipt photo or file'}
        >
          📎{pendingFiles.length > 0 && <small>{pendingFiles.length}</small>}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          multiple
          hidden
          onChange={(e) => {
            const picked = [...(e.target.files || [])];
            e.target.value = '';
            setPendingFiles((p) => [...p, ...picked]);
          }}
        />
        <button className="btn primary sm" disabled={!canAdd || saving}>
          {saving ? 'Saving…' : '＋ Add'}
        </button>
      </form>
      {pendingFiles.length > 0 && (
        <p className="muted small spend-pending">
          📎 {pendingFiles.map((f) => f.name).join(', ')}{' '}
          <button className="link-btn" onClick={() => setPendingFiles([])}>
            clear
          </button>
        </p>
      )}
      {error && <p className="att-error">{error}</p>}
      {notice && <p className="spend-notice" role="status">{notice}</p>}

      {status.spends.length > 0 && (
        <>
          <button className="spend-toggle" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}>
            {listOpen ? '▾' : '▸'} {status.spends.length} spend{status.spends.length === 1 ? '' : 's'}
          </button>
          {listOpen && (
            <ul className="spend-list">
              {status.spends.map((s) => {
                const open = detail === s.id;
                const nFiles = Object.keys(s.files || {}).length;
                return (
                  <li key={s.id} className={open ? 'open' : ''}>
                    <span className="s-date">{dayName(s.date)}</span>
                    <span className="s-note">
                      <LiveInput
                        className="s-note-input"
                        fieldKey={`spend:${itemId}:${s.id}:note`}
                        value={s.note || ''}
                        onSave={(v) => saveSpend(s, 'note')(v.trim() ? v : null)}
                        placeholder="No note"
                        aria-label="What was it"
                      />
                      {s.category && <span className="s-cat">{s.category}</span>}
                      {s.by && s.by !== username && <span className="muted small s-by">{s.by}</span>}
                    </span>
                    <LiveInput
                      className="s-amt-input"
                      inputMode="decimal"
                      fieldKey={`spend:${itemId}:${s.id}:amount`}
                      value={s.amount}
                      format={(v) => (v ? String(v) : '')}
                      parse={parseAmount}
                      display={(v) => formatMoney(v, currency)}
                      onSave={(v) => v > 0 && saveSpend(s, 'amount')(v)}
                      aria-label="Amount spent"
                    />
                    <button
                      className={`icon-btn s-more ${nFiles ? 'has-files' : ''}`}
                      onClick={() => setDetail(open ? null : s.id)}
                      aria-expanded={open}
                      aria-label={`More for ${s.note || 'this spend'}${nFiles ? `, ${nFiles} attachment(s)` : ''}`}
                      title="Date, move, receipts"
                    >
                      {nFiles ? '📎' : '⋯'}
                      {nFiles > 1 && <small>{nFiles}</small>}
                    </button>
                    {open && (
                      <div className="s-detail">
                        <div className="s-detail-row">
                          <label>
                            <span>Date</span>
                            <input
                              type="date"
                              value={s.date}
                              onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && saveSpend(s, 'date')(e.target.value)}
                              aria-label="Date spent"
                            />
                          </label>
                          <label>
                            <span>Category</span>
                            <LiveInput
                              fieldKey={`spend:${itemId}:${s.id}:category`}
                              value={s.category || ''}
                              onSave={(v) => saveSpend(s, 'category')(splitCats(v).join(', ') || null)}
                              placeholder="e.g. Rice, Dining"
                              list={catList}
                              aria-label="Category"
                            />
                          </label>
                          {otherBudgets.length > 0 && (
                            <label>
                              <span>Move to</span>
                              <select value="" onChange={(e) => e.target.value && moveTo(s, e.target.value)} aria-label="Move this spend to another budget">
                                <option value="">Choose a budget…</option>
                                {otherBudgets.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name || 'Untitled'}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                        <Attachments
                          ledgerId={ledgerId}
                          itemPath={`spending/${itemId}/${s.id}`}
                          files={s.files}
                          username={username}
                          compact
                          what={`“${s.note || 'this spend'}”`}
                        />
                        <div className="s-detail-actions">
                          <button className="btn danger sm" onClick={() => remove(s)}>
                            Remove spend
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
