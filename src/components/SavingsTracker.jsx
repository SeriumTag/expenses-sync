import { savingsMonths, savingsTotal } from '../lib/budget';
import { setPath } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import LiveInput from './LiveInput';

// Month-by-month savings for one item. Each month defaults to that month's
// budget (if there is one) and can be adjusted.
export default function SavingsTracker({ ledgerId, itemId, year, log, periods, currency, name }) {
  const months = savingsMonths(year, itemId, log, periods);
  const total = savingsTotal(months);
  const logPath = `ledgers/${ledgerId}/tracks/${itemId}/log`;

  return (
    <div className="tracker">
      <div className="tracker-total">
        <span className="muted small">Saved in {year}</span>
        <b>{formatMoney(total, currency)}</b>
      </div>
      <div className="tracker-grid">
        {months.map((m) => (
          <label key={m.key} className={`tracker-month ${m.logged ? 'logged' : ''} ${m.future ? 'future' : ''}`}
            title={m.future ? 'Not counted until this month comes' : undefined}>
            <span>{m.label}</span>
            <LiveInput
              fieldKey={`track:${itemId}:${m.key}`}
              inputMode="decimal"
              value={m.future ? m.entered : m.value}
              format={(v) => (v === null || v === undefined ? '' : String(v))}
              display={(v) => (v === null || v === undefined ? '' : formatMoney(v, currency))}
              parse={(text) => (text.trim() === '' ? null : parseAmount(text))}
              onSave={(v) => setPath(`${logPath}/${m.key}`, v)}
              placeholder={m.planned ? formatMoney(m.planned, currency) : '—'}
              aria-label={`${name} savings in ${m.label}`}
            />
          </label>
        ))}
      </div>
      <p className="muted small">
        Months fill in from each month’s budget. Type to adjust a month; clear it to go back to the budget. Future months count as $0 until they come.
      </p>
    </div>
  );
}
