// The four main screens, as tabs along the bottom like a normal phone app.
export const SCREENS = [
  { key: 'home', icon: '🏠', label: 'Home' },
  { key: 'bills', icon: '📋', label: 'Expenses' },
  { key: 'spending', icon: '💸', label: 'Spending' },
  { key: 'savings', icon: '🐷', label: 'Savings' },
];

export default function BottomNav({ screen, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {SCREENS.map((s) => (
        <button key={s.key} className={screen === s.key ? 'on' : ''} aria-current={screen === s.key ? 'page' : undefined} onClick={() => onChange(s.key)}>
          <span className="bn-ico" aria-hidden="true">
            {s.icon}
          </span>
          <span className="bn-label">{s.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ‹ Oct 2026 › — step a month (or year) at a time; tap the name for more.
export function MonthNav({ label, onPrev, onNext, onPick, isNow, onToday }) {
  return (
    <div className="month-nav">
      <button className="mn-step" onClick={onPrev} aria-label="Previous">
        ‹
      </button>
      <button className="mn-label" onClick={onPick} title="Pick a month, copy or compare">
        {label} <span aria-hidden="true">▾</span>
      </button>
      <button className="mn-step" onClick={onNext} aria-label="Next">
        ›
      </button>
      {!isNow && (
        <button className="mn-today link-btn" onClick={onToday}>
          Today
        </button>
      )}
    </div>
  );
}
