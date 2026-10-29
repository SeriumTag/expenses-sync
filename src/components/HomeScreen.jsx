import { afterExpenses, budgetStatus, inView, spendStats, isYearKey, monthlyIncome, potBalance, setAsideTab, sorted, tabInView } from '../lib/budget';
import { formatMoney } from '../lib/format';
import { budgetItems } from './BudgetsSheet';
import { trackedItems } from './SavingsSheet';

// The first screen: what's left, what's been spent, and a big button to log a spend.
export default function HomeScreen(props) {
  const { pk, period, tabs, ctx, currency, partner, partnerOnline } = props;
  const { onLogSpend, onAddBill, onGoto, onOpenPerson, onAddPerson, onImport } = props;
  const view = isYearKey(pk) ? 'yearly' : 'monthly';
  const per = view === 'yearly' ? 'this year' : 'this month';
  const periodName = isYearKey(pk) ? pk : new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)) - 1, 1).toLocaleString('en-GB', { month: 'long' });

  const people = sorted(period?.people);
  const income = people.reduce((s, p) => s + inView(monthlyIncome(p), view), 0);
  const expenses = tabs.reduce((s, t) => s + tabInView(period?.items?.[t.id], view, ctx), 0);
  const left = income - expenses;

  const budgets = budgetItems(period, tabs).map((b) => ({ ...b, status: budgetStatus(b.item, b.id, ctx.spending, pk) }));
  const stats = spendStats(ctx.spending, budgets.map((b) => b.id), pk);
  const usedPct = income > 0 ? Math.min(100, (expenses / income) * 100) : 0;
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const due = isYearKey(pk) ? `${pk}-12` : pk;
  const pots = trackedItems(period, tabs);
  const saved = pots.reduce((s, p) => s + potBalance(p.id, ctx.tracks?.[p.id], ctx.periods, due), 0);
  const yearly = tabs.reduce((s, t) => s + setAsideTab(period?.items?.[t.id]), 0);

  return (
    <div className="home">
      {/* 1. What's left: the design's gradient hero, with the mochi cat */}
      <section className="hero-card" aria-label="This month">
        <div className="hero-text">
          {income > 0 ? (
            <>
              <span className="hero-label">Left in {periodName}</span>
              <span className={`hero-amount ${left < 0 ? 'neg' : ''}`}>{formatMoney(left, currency)}</span>
              <span className="hero-sub">
                of {formatMoney(income, currency)} income ·{' '}
                <button className="hero-link" onClick={() => onGoto('bills')}>
                  {formatMoney(expenses, currency)} expenses
                </button>
              </span>
              <span className="hero-progress" role="progressbar" aria-label="Share of income used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)}>
                <i style={{ width: `${usedPct}%` }} />
              </span>
            </>
          ) : (
            <>
              <span className="hero-label">Expenses in {periodName}</span>
              <span className="hero-amount">{formatMoney(expenses, currency)}</span>
              <button className="hero-link" onClick={onAddPerson}>
                Add your income to see what’s left
              </button>
            </>
          )}
          {stats.count > 0 && (
            <span className="hero-meta">
              <span>✿ {formatMoney(stats.total, currency)} spent so far</span>
              <span>≈ {formatMoney(stats.perDay, currency)} / day</span>
            </span>
          )}
        </div>
        <div className="hero-mascot" aria-hidden="true">
          <img src="/mochi.webp" alt="" width="120" height="120" />
          <span className="mascot-tag">Hi! 🐱</span>
        </div>
      </section>

      {/* 2. The everyday buttons */}
      <div className="home-actions">
        <button className="btn primary big-btn" onClick={() => onLogSpend(null)}>
          ＋ Log a spend
        </button>
        <button className="btn glass big-btn" onClick={onAddBill}>
          ＋ Add a bill
        </button>
      </div>

      {/* Stat tiles from the spends logged this month */}
      <section className="stat-tiles" aria-label="Quick stats">
        <div className="stat-tile">
          <span className="stat-ico">☕</span>
          <span className="stat-label">{stats.inPeriod ? `Today · ${todayLabel}` : 'Today'}</span>
          <b>{stats.today === null ? '—' : formatMoney(stats.today, currency)}</b>
        </div>
        <div className="stat-tile">
          <span className="stat-ico">📅</span>
          <span className="stat-label">This week</span>
          <b>{stats.week === null ? '—' : formatMoney(stats.week, currency)}</b>
        </div>
        <div className="stat-tile">
          <span className="stat-ico">🧾</span>
          <span className="stat-label">Purchases</span>
          <b>{stats.count}</b>
        </div>
        <div className="stat-tile" title={stats.biggest ? `${stats.biggest.note || 'Spend'} · ${formatMoney(stats.biggest.amount, currency)}` : ''}>
          <span className="stat-ico">🏆</span>
          <span className="stat-label">Biggest spend</span>
          <b>{stats.biggest ? formatMoney(stats.biggest.amount, currency) : '—'}</b>
          {stats.biggest && <span className="stat-note">{stats.biggest.note || 'Spend'}</span>}
        </div>
      </section>

      {/* 3. Spending budgets */}
      {budgets.length > 0 && (
        <section className="home-card">
          <div className="home-card-head">
            <h2>Spending</h2>
            <span className="row-gap">
              <button className="link-btn" onClick={onImport}>
                📄 Import
              </button>
              <button className="link-btn" onClick={() => onGoto('spending')}>
                See all ›
              </button>
            </span>
          </div>
          {budgets.map((b) => {
            const { budget, spent, left: bLeft, noBudget } = b.status;
            const pct = noBudget ? 0 : budget > 0 ? Math.min(100, (spent / budget) * 100) : 100;
            return (
              <button key={b.id} className="home-budget" onClick={() => onLogSpend(b.id)} title={`Log a spend for ${b.item.name}`}>
                <span className="hb-top">
                  <b>{b.item.name || 'Untitled'}</b>
                  {noBudget ? (
                    <span className="muted">{formatMoney(spent, currency)} spent</span>
                  ) : (
                    <span className={bLeft < 0 ? 'neg' : 'pos'}>
                      {bLeft < 0 ? `${formatMoney(-bLeft, currency)} over` : `${formatMoney(bLeft, currency)} left`}
                    </span>
                  )}
                </span>
                {!noBudget && (
                  <span className={`budget-track ${bLeft < 0 ? 'over' : pct >= 80 ? 'near' : ''}`}>
                    <span style={{ width: `${pct}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </section>
      )}

      {/* 4. Savings and yearly bills */}
      {(pots.length > 0 || yearly > 0) && (
        <div className="home-pair">
          {pots.length > 0 && (
            <button className="home-card mini" onClick={() => onGoto('savings')}>
              <span className="muted small">🐷 Savings</span>
              <b className="pos">{formatMoney(saved, currency)}</b>
              <span className="muted small">
                in {pots.length} pot{pots.length === 1 ? '' : 's'}
              </span>
            </button>
          )}
          {yearly > 0 && (
            <button className="home-card mini" onClick={() => onGoto('bills')} title="Yearly bills spread over 12 months">
              <span className="muted small">🗓 Yearly bills</span>
              <b>{formatMoney(yearly, currency)}</b>
              <span className="muted small">to save each month</span>
            </button>
          )}
        </div>
      )}

      {/* 5. Each person: a tile each, income on top, expenses, then what's left. */}
      <section className="people-block">
        <div className="home-card-head">
          <h2>Each person</h2>
          <button className="link-btn" onClick={onAddPerson}>
            ＋ Add
          </button>
        </div>
        {people.length === 0 && <p className="muted small">Add each person’s salary to see what’s left after expenses.</p>}
        <div className="people-grid">
          {people.map((p) => {
            // Each person's own "left": their income minus the groups they pay for.
            const mine = afterExpenses(p, period, view, ctx);
            const picked = Object.keys(p.tabs || {}).length > 0;
            return (
              <button key={p.id} className="person-tile" onClick={() => onOpenPerson(p.id)}>
                <span className="pt-name">{p.name || 'Unnamed'}</span>
                <span className="pt-line">
                  <span className="muted small">Income</span>
                  <b>{formatMoney(mine.salary, currency)}</b>
                </span>
                {picked ? (
                  <>
                    <span className="pt-line">
                      <span className="muted small">Expenses</span>
                      <b>− {formatMoney(mine.spent, currency)}</b>
                    </span>
                    <span className="pt-line pt-left">
                      <span className="muted small">Left</span>
                      <b className={mine.left < 0 ? 'neg' : 'pos'}>{formatMoney(mine.left, currency)}</b>
                    </span>
                  </>
                ) : (
                  <span className="pt-hint muted small">Tap to choose what {p.name ? `${p.name} pays` : 'they pay'} for</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <p className="home-shared muted small">
        {partner ? (
          <>
            Shared with <b>{partner}</b> · <span className={partnerOnline ? 'pos' : ''}>{partnerOnline ? '● online now' : 'offline'}</span>
          </>
        ) : (
          'Only you can see this account.'
        )}
      </p>
    </div>
  );
}
