import { afterExpenses, budgetItems, budgetStatus, spendStats, isYearKey, potBalance, setAsideTab, sorted, trackedItems, yearOf, yearlyRecurringSetAside } from '../lib/budget';
import { formatMoney } from '../lib/format';
import { useMascot } from '../lib/mascot';
import { buysOf, isBuyOverdue } from '../lib/crypto';
import { latestWeight } from '../lib/weight';
import GrabBadge from './drive/GrabBadge';

const hasGrab = (p) => Object.values(p.incomes || {}).some((x) => x.grab);

// A small icon inside a person's tile that opens one of their pages (not the tile's own sheet).
function PageChip({ label, className = '', onOpen, children }) {
  const open = (e) => {
    e.stopPropagation();
    onOpen();
  };
  return (
    <span role="button" tabIndex={0} className={`pt-chip ${className}`} title={label} aria-label={label} onClick={open} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(e))}>
      {children}
    </span>
  );
}

// The first screen, top to bottom: each person (greeted by their plush friend),
// the two everyday buttons, this month's spend stats, then savings and the
// monthly set-aside for yearly bills.
export default function HomeScreen(props) {
  const { pk, period, tabs, ctx, currency, username } = props;
  const { extras, weight, bitcoin, onLogSpend, onAddBill, onGoto, onOpenPerson, onAddPerson, onOpenPage } = props;
  const { friend, onPick } = useMascot();
  const view = isYearKey(pk) ? 'yearly' : 'monthly';

  const people = sorted(period?.people);
  const budgets = budgetItems(period, tabs).map((b) => ({ ...b, status: budgetStatus(b.item, b.id, ctx.spending, pk) }));
  const stats = spendStats(ctx.spending, budgets.map((b) => b.id), pk);
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const due = isYearKey(pk) ? `${pk}-12` : pk;
  const pots = trackedItems(period, tabs);
  const saved = pots.reduce((s, p) => s + potBalance(p.id, ctx.tracks?.[p.id], ctx.periods, due), 0);
  // Bills priced per year, plus bills that repeat yearly, spread over 12 months.
  const setAside = tabs.reduce((s, t) => s + setAsideTab(period?.items?.[t.id]), 0) + yearlyRecurringSetAside(ctx.periods, yearOf(pk));

  return (
    <div className="home">
      {/* 1. Each person: a tile each, income on top, expenses, then what's left. */}
      <section className="people-block">
        <div className="greet">
          <button className="greet-friend" onClick={onPick || undefined} disabled={!onPick} title={`${friend.name} · tap to change character`} aria-label={`Change character (now ${friend.name})`}>
            <img src={friend.src} alt="" width="56" height="56" />
          </button>
          <div className="greet-text">
            <b>Hi, {username}!</b>
            <span className="muted small">Here’s each person this {view === 'yearly' ? 'year' : 'month'}</span>
          </div>
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
                {/* Their own pages, as icons under the name (the tile itself opens the person). */}
                {(hasGrab(p) || extras?.[p.id]?.weight || extras?.[p.id]?.bitcoin) && (
                  <span className="pt-icons">
                    {hasGrab(p) && (
                      <PageChip label="Open the Drive page" onOpen={() => onOpenPage('drive', p.id)}>
                        <GrabBadge small />
                      </PageChip>
                    )}
                    {extras?.[p.id]?.weight && (
                      <PageChip label="Open the Weight log" className="weight" onOpen={() => onOpenPage('weight', p.id)}>
                        ⚖️{latestWeight(weight?.[p.id]) != null ? ` ${latestWeight(weight[p.id]).toFixed(1)} kg` : ''}
                      </PageChip>
                    )}
                    {extras?.[p.id]?.bitcoin && (
                      <PageChip label="Open Bitcoin" className="btc" onOpen={() => onOpenPage('bitcoin', p.id)}>
                        ₿{isBuyOverdue(buysOf(bitcoin?.[p.id])) && <i className="red-dot" aria-label="This week’s buy isn’t logged yet" />}
                      </PageChip>
                    )}
                  </span>
                )}
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

      {/* 2. The everyday buttons */}
      <div className="home-actions">
        <button className="btn primary big-btn" onClick={() => onLogSpend(null)}>
          ＋ Log a spend
        </button>
        <button className="btn glass big-btn" onClick={onAddBill}>
          ＋ Add a bill
        </button>
      </div>

      {/* 3. Stat tiles from the spends logged this month */}
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

      {/* 4. Savings, and yearly bills spread into a monthly set-aside */}
      <div className="home-pair">
        <button className="home-card mini" onClick={() => onGoto('bills', 'savings')}>
          <span className="muted small">🐷 Savings</span>
          <b className="pos">{formatMoney(saved, currency)}</b>
          <span className="muted small">{pots.length ? `in ${pots.length} pot${pots.length === 1 ? '' : 's'}` : 'No savings pots yet'}</span>
        </button>
        <button className="home-card mini" onClick={() => onGoto('bills', 'recurring')} title="Yearly bills spread over 12 months">
          <span className="muted small">🗓 Monthly bills to set aside</span>
          <b>{formatMoney(setAside, currency)}</b>
          <span className="muted small">each month, for yearly bills</span>
        </button>
      </div>
    </div>
  );
}
