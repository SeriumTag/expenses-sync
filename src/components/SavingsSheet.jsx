import { useState } from 'react';
import {
  MONTHS,
  isYearKey,
  monthIndexOf,
  monthKey,
  monthlyOf,
  potBalance,
  savingsMonths,
  savingsTotal,
  sorted,
  withdrawalList,
  withdrawnByMonth,
  yearOf,
} from '../lib/budget';
import { newKey, patchPath, setPath } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import { prefs } from '../lib/session';
import LiveInput from './LiveInput';
import Modal from './Modal';
import PotIcon from './PotIcon';

// Every item ticked "Track as savings pot" in the period being shown.
export function trackedItems(period, tabs) {
  return tabs.flatMap((t) =>
    sorted(period?.items?.[t.id])
      .filter((item) => item.track)
      .map((item) => ({ id: item.id, item, tabId: t.id, tabName: t.name })),
  );
}

// The month whose saving is "due": the month being shown, or — in a whole-year
// view — this month (or December for a past year).
function dueMonth(pk) {
  if (!isYearKey(pk)) return pk;
  const now = new Date();
  const year = Number(pk);
  return monthKey(year, year === now.getFullYear() ? now.getMonth() : year < now.getFullYear() ? 11 : 0);
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const monthName = (k) => `${MONTHS[monthIndexOf(k)]} ${yearOf(k)}`;
const dayName = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const moneyInput = {
  inputMode: 'decimal',
  format: (v) => (v === null || v === undefined ? '' : String(v)),
  parse: (text) => (text.trim() === '' ? null : parseAmount(text)),
};

// Pull-up list of savings pots: what to put in this month, withdrawals, and
// what's in each pot.
export default function SavingsSheet({ ledgerId, pk, period, tabs, tracks, periods, currency, username, onOpenItem, onClose }) {
  const year = yearOf(pk);
  const due = dueMonth(pk);
  const dueLabel = MONTHS[monthIndexOf(due)];

  const rows = trackedItems(period, tabs).map((p) => {
    const track = tracks?.[p.id];
    const months = savingsMonths(year, p.id, track?.log, periods);
    const out = withdrawnByMonth(track, year);
    return {
      ...p,
      track,
      months,
      out,
      month: months.find((m) => m.key === due),
      target: monthlyOf(p.item),
      saved: savingsTotal(months),
      withdrawn: Object.values(out).reduce((s, v) => s + v, 0),
      balance: potBalance(p.id, track, periods, due),
    };
  });
  const monthTarget = rows.reduce((s, r) => s + r.target, 0);
  const yearSaved = rows.reduce((s, r) => s + r.saved, 0);
  const yearOut = rows.reduce((s, r) => s + r.withdrawn, 0);
  const inPots = rows.reduce((s, r) => s + r.balance, 0);
  const doneCount = rows.filter((r) => r.month?.logged).length;
  // Compact: one short card per pot. Detailed: start amount, withdrawals and history too.
  const [detailed, setDetailed] = useState(() => prefs.get('potsDetailed') ?? true);
  const pickView = (v) => {
    setDetailed(v);
    prefs.set('potsDetailed', v);
  };

  return (
    <Modal title="Savings pots" onClose={onClose}>
      <div className="pots-summary">
        <div>
          <span className="muted small">To put aside in {dueLabel}</span>
          <b>
            {formatMoney(monthTarget, currency)}
            <span className="per-small">/mo</span>
          </b>
        </div>
        <div>
          <span className="muted small">In pots now</span>
          <b className="pos">{formatMoney(inPots, currency)}</b>
          <span className="muted small">
            {formatMoney(yearSaved, currency)} saved in {year}
            {yearOut > 0 && <span className="neg"> · −{formatMoney(yearOut, currency)} out</span>}
          </span>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="pots-view">
          <span className="muted small">View</span>
          <div className="seg" role="group" aria-label="Savings pots view">
            <button className={!detailed ? 'on' : ''} aria-pressed={!detailed} onClick={() => pickView(false)}>
              Compact
            </button>
            <button className={detailed ? 'on' : ''} aria-pressed={detailed} onClick={() => pickView(true)}>
              Detailed
            </button>
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <p className="muted small pots-hint">
          {doneCount} of {rows.length} recorded for {dueLabel}. Type what you actually put in; blank uses the budget.
        </p>
      )}

      {rows.length === 0 && <p className="muted">No savings pots yet. Open an item and tick “Track as savings pot”.</p>}

      <div className="pots-list">
        {rows.map((r) => (
          <PotRow key={r.id} r={r} detailed={detailed} ledgerId={ledgerId} due={due} year={year} currency={currency} username={username} onOpenItem={onOpenItem} />
        ))}
      </div>
    </Modal>
  );
}

function PotRow({ r, detailed, ledgerId, due, year, currency, username, onOpenItem }) {
  const dueLabel = MONTHS[monthIndexOf(due)];
  const trackPath = `ledgers/${ledgerId}/tracks/${r.id}`;
  const history = withdrawalList(r.track);
  const [form, setForm] = useState(null); // { amount, date, note } while recording a withdrawal
  const [showHistory, setShowHistory] = useState(false);

  // The graph shares one scale: saving grows up, withdrawals hang down.
  const best = Math.max(...r.months.map((m) => Number(m.value) || 0), ...Object.values(r.out), 1);

  // Money already in the pot before tracking began; months count from `since` on.
  const saveStart = (v) => setPath(`${trackPath}/start`, v ? { amount: v, since: r.track?.start?.since || due } : null);

  function addWithdrawal(e) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!(amount > 0) || !form.date) return;
    patchPath(`${trackPath}/withdrawals/${newKey(`${trackPath}/withdrawals`)}`, {
      amount,
      date: form.date,
      note: form.note.trim() || null,
      by: username || null,
      at: Date.now(),
    });
    setForm(null);
    setShowHistory(true);
  }

  function removeWithdrawal(w) {
    if (!window.confirm(`Remove the ${formatMoney(w.amount, currency)} withdrawal on ${dayName(w.date)}? It will be added back to the pot.`)) return;
    setPath(`${trackPath}/withdrawals/${w.id}`, null);
  }

  return (
    <div className={`pot-row ${r.month?.logged ? 'done' : ''}`}>
      <div className="pot-top">
        <PotIcon size={20} />
        <button className="pot-name" onClick={() => onOpenItem(r.tabId, r.id)}>
          <b>{r.item.name || 'Untitled'}</b>
          <span className="tab-badge">{r.tabName || 'Untitled'}</span>
        </button>
        <span className="pot-target">
          {formatMoney(r.target, currency)}
          <span className="per-small">/mo</span>
        </span>
      </div>

      <div className="pot-bottom">
        <label className="pot-month">
          <span>{r.month?.logged ? `✓ ${dueLabel}` : dueLabel}</span>
          <LiveInput
            {...moneyInput}
            fieldKey={`track:${r.id}:${due}`}
            value={r.month?.logged ? r.month.value : null}
            display={(v) => (v === null || v === undefined ? '' : formatMoney(v, currency))}
            onSave={(v) => setPath(`${trackPath}/log/${due}`, v)}
            placeholder={formatMoney(r.month?.planned ?? r.target, currency)}
            aria-label={`${r.item.name} savings in ${dueLabel}`}
          />
        </label>
        <div className="pot-bars" aria-label={`Saved and withdrawn each month of ${year}`}>
          {r.months.map((m) => {
            const out = r.out[m.key] || 0;
            return (
              <span
                key={m.key}
                className={`pot-col ${m.key === due ? 'now' : ''}`}
                title={`${m.label}: saved ${m.value === null ? '—' : formatMoney(m.value, currency)}${out ? `, withdrew ${formatMoney(out, currency)}` : ''}`}
              >
                <span className="pot-up">
                  <span className={m.logged ? 'logged' : ''} style={{ height: `${Math.max(6, ((Number(m.value) || 0) / best) * 100)}%` }} />
                </span>
                <span className="pot-down">{out > 0 && <span style={{ height: `${Math.max(15, (out / best) * 100)}%` }} />}</span>
              </span>
            );
          })}
        </div>
        <span className="pot-saved">
          <span className="muted small">{year}</span>
          <b>{formatMoney(r.saved, currency)}</b>
          {r.withdrawn > 0 && <span className="neg small">−{formatMoney(r.withdrawn, currency)}</span>}
        </span>
      </div>

      {detailed && (
        <>
          <div className="pot-capital">
            <label className="pot-month">
              <span title="Money already in this pot before you started tracking">Start amount</span>
              <LiveInput
                {...moneyInput}
                fieldKey={`track:${r.id}:start`}
                value={r.track?.start?.amount ?? null}
                display={(v) => (v === null || v === undefined ? '' : formatMoney(v, currency))}
                onSave={saveStart}
                placeholder={formatMoney(0, currency)}
                aria-label={`${r.item.name} amount already saved`}
              />
            </label>
            <span className="muted small pot-since">{r.track?.start ? `before ${monthName(r.track.start.since)}` : 'already saved, if any'}</span>
            <span className="pot-balance">
              <span className="muted small">In pot</span>
              <b className={r.balance < 0 ? 'neg' : 'pos'}>{formatMoney(r.balance, currency)}</b>
            </span>
          </div>
    
          <div className="pot-actions">
            <button className="btn ghost sm" onClick={() => setForm(form ? null : { amount: '', date: today(), note: '' })}>
              {form ? 'Cancel' : '− Withdraw'}
            </button>
            {history.length > 0 && (
              <button className="btn ghost sm" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
                {showHistory ? '▾' : '▸'} Withdrawals ({history.length})
              </button>
            )}
          </div>
    
          {form && (
            <form className="withdraw-form" onSubmit={addWithdrawal}>
              <label>
                <span>Amount</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder={formatMoney(0, currency)}
                  aria-label="Amount withdrawn"
                />
              </label>
              <label>
                <span>Date</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date withdrawn" />
              </label>
              <label className="wide">
                <span>Reason / note</span>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Paid the insurance premium" aria-label="Reason for withdrawing" />
              </label>
              <button className="btn primary sm" disabled={!(parseAmount(form.amount) > 0) || !form.date}>
                Record withdrawal
              </button>
            </form>
          )}
    
          {showHistory && history.length > 0 && (
            <ul className="withdraw-list">
              {history.map((w) => (
                <li key={w.id}>
                  <span className="w-date">{dayName(w.date)}</span>
                  <span className="w-note">
                    {w.note || <span className="muted">No note</span>}
                    {w.by && <span className="muted small"> · {w.by}</span>}
                  </span>
                  <b className="neg">−{formatMoney(w.amount, currency)}</b>
                  <button className="icon-btn" onClick={() => removeWithdrawal(w)} aria-label={`Remove withdrawal on ${dayName(w.date)}`}>
                    ✕
                  </button>
                </li>
              ))}
              <li className="w-total">
                <span>Total withdrawn</span>
                <b className="neg">−{formatMoney(history.reduce((s, w) => s + (Number(w.amount) || 0), 0), currency)}</b>
              </li>
            </ul>
          )}
        </>
      )}
    </div>
  );
}
