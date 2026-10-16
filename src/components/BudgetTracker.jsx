import { useRef, useState } from 'react';
import { MONTHS, budgetStatus, isYearKey } from '../lib/budget';
import { confirmTwice } from '../lib/confirm';
import { newKey, patchPath, setPath } from '../lib/db';
import { attachFile } from '../lib/files';
import { formatMoney, parseAmount } from '../lib/format';
import Attachments from './Attachments';

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
  const { budget, spent, left } = status;
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
export default function BudgetTracker({ ledgerId, itemId, item, pk, spending, currency, username, showList = true }) {
  const status = budgetStatus(item, itemId, spending, pk);
  const path = `ledgers/${ledgerId}/spending/${itemId}`;
  const [form, setForm] = useState(() => ({ date: defaultDate(pk), note: '', amount: '' }));
  const [listOpen, setListOpen] = useState(showList);
  const [pendingFiles, setPendingFiles] = useState([]); // photos picked before tapping Add
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filesOpen, setFilesOpen] = useState(null); // spend whose attachments are shown
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
      await patchPath(`${path}/${id}`, { date: form.date, note: form.note.trim() || null, amount, by: username || null, at: Date.now() });
      setForm({ date: form.date, note: '', amount: '' }); // keep the date for logging several in a row
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

  function remove(s) {
    if (!confirmTwice(`Remove “${s.note || 'this spend'}” (${formatMoney(s.amount, currency)}) on ${dayName(s.date)}? It goes back into the budget.`, 'this spend')) return;
    setPath(`${path}/${s.id}`, null);
  }

  // Keep dates inside the period being shown.
  const range = isYearKey(pk)
    ? { min: `${pk}-01-01`, max: `${pk}-12-31` }
    : { min: `${pk}-01`, max: `${pk}-${String(new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)), 0).getDate()).padStart(2, '0')}` };

  return (
    <div className="budget-tracker">
      <BudgetBar status={status} currency={currency} />

      <form className="spend-form" onSubmit={add}>
        <input
          type="date"
          value={form.date}
          min={range.min}
          max={range.max}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          aria-label="Date spent"
        />
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What? e.g. Chicken rice" aria-label="What was it" />
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

      {status.spends.length > 0 && (
        <>
          <button className="spend-toggle" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}>
            {listOpen ? '▾' : '▸'} {status.spends.length} spend{status.spends.length === 1 ? '' : 's'}
          </button>
          {listOpen && (
            <ul className="spend-list">
              {status.spends.map((s) => (
                <li key={s.id} className={filesOpen === s.id ? 'open' : ''}>
                  <span className="s-date">{dayName(s.date)}</span>
                  <span className="s-note">
                    {s.note || <span className="muted">No note</span>}
                    {s.by && s.by !== username && <span className="muted small"> · {s.by}</span>}
                  </span>
                  <b>{formatMoney(s.amount, currency)}</b>
                  <button
                    className={`icon-btn s-clip ${s.files ? 'has' : ''}`}
                    onClick={() => setFilesOpen(filesOpen === s.id ? null : s.id)}
                    aria-expanded={filesOpen === s.id}
                    aria-label={s.files ? `${Object.keys(s.files).length} attachment(s)` : 'Attach a photo or file'}
                    title={s.files ? 'Attachments' : 'Attach a photo or file'}
                  >
                    📎{s.files && Object.keys(s.files).length > 1 && <small>{Object.keys(s.files).length}</small>}
                  </button>
                  <button className="icon-btn" onClick={() => remove(s)} aria-label={`Remove ${s.note || 'spend'} on ${dayName(s.date)}`}>
                    ✕
                  </button>
                  {filesOpen === s.id && (
                    <div className="s-files">
                      <Attachments
                        ledgerId={ledgerId}
                        itemPath={`spending/${itemId}/${s.id}`}
                        files={s.files}
                        username={username}
                        compact
                        what={`“${s.note || 'this spend'}”`}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
