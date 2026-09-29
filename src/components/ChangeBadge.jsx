import { FREQS, inView } from '../lib/budget';
import { formatMoney } from '../lib/format';

// "▲ $20.00 vs Aug" / "NEW": how an item differs from the previous period.
// On phones only the arrow shows (the full text is in the tooltip).
export function ChangeBadge({ change, prevLabel, currency, view }) {
  if (!change) return null;
  if (change.isNew) return <span className="chg new" title={`Not in ${prevLabel}`}>NEW</span>;
  const up = change.diff > 0;
  const text = `${formatMoney(Math.abs(inView(change.diff, view)), currency)} vs ${prevLabel}`;
  return (
    <span className={`chg ${up ? 'up' : 'down'}`} title={`${up ? 'Up' : 'Down'} ${text}`}>
      {up ? '▲' : '▼'}
      <span className="chg-text"> {text}</span>
    </span>
  );
}

// Small "Mo" / "Yr" toggle for how often an amount is paid.
export function FreqPill({ freq, onChange, disabled }) {
  const f = freq === 'yearly' ? 'yearly' : 'monthly';
  return (
    <button
      type="button"
      className={`freq ${f === 'yearly' ? 'yr' : ''}`}
      disabled={disabled}
      onClick={() => onChange(f === 'yearly' ? 'monthly' : 'yearly')}
      title="Paid monthly or yearly? Tap to switch"
    >
      {FREQS[f].tiny}
    </button>
  );
}
