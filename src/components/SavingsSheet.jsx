import { MONTHS, isYearKey, monthIndexOf, monthKey, monthlyOf, savingsMonths, savingsTotal, sorted, yearOf } from '../lib/budget';
import { setPath } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
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

// Pull-up list of savings pots: what to put in this month, and the year so far.
export default function SavingsSheet({ ledgerId, pk, period, tabs, tracks, periods, currency, onOpenItem, onClose }) {
  const pots = trackedItems(period, tabs);
  const year = yearOf(pk);
  const due = dueMonth(pk);
  const dueLabel = MONTHS[monthIndexOf(due)];

  const rows = pots.map((p) => {
    const months = savingsMonths(year, p.id, tracks?.[p.id]?.log, periods);
    const month = months.find((m) => m.key === due);
    return { ...p, months, month, target: monthlyOf(p.item), saved: savingsTotal(months) };
  });
  const monthTarget = rows.reduce((s, r) => s + r.target, 0);
  const yearSaved = rows.reduce((s, r) => s + r.saved, 0);
  const doneCount = rows.filter((r) => r.month?.logged).length;

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
          <span className="muted small">Saved in {year}</span>
          <b className="pos">{formatMoney(yearSaved, currency)}</b>
        </div>
      </div>
      {rows.length > 0 && (
        <p className="muted small pots-hint">
          {doneCount} of {rows.length} recorded for {dueLabel}. Type what you actually put in; blank uses the budget.
        </p>
      )}

      {rows.length === 0 && <p className="muted">No savings pots yet. Open an item and tick “Track as savings pot”.</p>}

      <div className="pots-list">
        {rows.map((r) => {
          const best = Math.max(...r.months.map((m) => Number(m.value) || 0), 1);
          return (
            <div key={r.id} className={`pot-row ${r.month?.logged ? 'done' : ''}`}>
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
                    fieldKey={`track:${r.id}:${due}`}
                    inputMode="decimal"
                    value={r.month?.logged ? r.month.value : null}
                    format={(v) => (v === null || v === undefined ? '' : String(v))}
                    display={(v) => (v === null || v === undefined ? '' : formatMoney(v, currency))}
                    parse={(text) => (text.trim() === '' ? null : parseAmount(text))}
                    onSave={(v) => setPath(`ledgers/${ledgerId}/tracks/${r.id}/log/${due}`, v)}
                    placeholder={formatMoney(r.month?.planned ?? r.target, currency)}
                    aria-label={`${r.item.name} savings in ${dueLabel}`}
                  />
                </label>
                <div className="pot-bars" aria-label={`Saved each month of ${year}`}>
                  {r.months.map((m) => (
                    <span
                      key={m.key}
                      className={`${m.logged ? 'logged' : ''} ${m.key === due ? 'now' : ''}`}
                      style={{ height: `${Math.max(8, ((Number(m.value) || 0) / best) * 100)}%` }}
                      title={`${m.label}: ${m.value === null ? '—' : formatMoney(m.value, currency)}`}
                    />
                  ))}
                </div>
                <span className="pot-saved">
                  <span className="muted small">{year}</span>
                  <b className="pos">{formatMoney(r.saved, currency)}</b>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
