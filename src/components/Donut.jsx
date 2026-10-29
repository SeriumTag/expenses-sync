import { formatMoney } from '../lib/format';

// "Where it went": a donut of parts with the total in the middle, and a legend
// you can tap (e.g. to filter a list). segments: [{ key, label, value, color }].
export default function Donut({ title = 'Where it went', subtitle, segments, currency, active, onPick, note }) {
  const shown = segments.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const total = shown.reduce((s, x) => s + x.value, 0);
  const R = 46;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const top = shown[0];

  return (
    <section className="home-card donut-card" aria-label={title}>
      <div className="home-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted small donut-sub">{subtitle}</p>}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="muted small">Nothing to show yet.</p>
      ) : (
        <div className="donut-wrap">
          <svg className="donut" viewBox="0 0 120 120" role="img" aria-label={`${title}: ${shown.map((s) => `${s.label} ${formatMoney(s.value, currency)}`).join(', ')}`}>
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="16" />
            {shown.map((s) => {
              const dash = (s.value / total) * C;
              const el = (
                <circle
                  key={s.key}
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active && active !== s.key ? 12 : 16}
                  strokeOpacity={active && active !== s.key ? 0.35 : 1}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 60 60)"
                />
              );
              offset += dash;
              return el;
            })}
            <text x="60" y="58" textAnchor="middle" className="donut-total">
              {formatMoney(Math.round(total), currency).replace(/\.00$/, '')}
            </text>
            <text x="60" y="73" textAnchor="middle" className="donut-cap">
              TOTAL
            </text>
          </svg>
          <div className="legend">
            {shown.map((s) => (
              <button
                key={s.key}
                className={active === s.key ? 'active' : ''}
                onClick={() => onPick?.(active === s.key ? null : s.key)}
                aria-pressed={active === s.key}
              >
                <span className="lft">
                  <span className="swatch-dot-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span>{formatMoney(s.value, currency)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {top && <p className="cat-note">{note || `Biggest slice: ${top.label} at ${formatMoney(top.value, currency)}.`}</p>}
    </section>
  );
}
