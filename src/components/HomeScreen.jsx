import { budgetStatus, inView, isYearKey, monthlyIncome, potBalance, setAsideTab, sorted, tabInView } from '../lib/budget';
import { formatMoney } from '../lib/format';
import { budgetItems } from './BudgetsSheet';
import { trackedItems } from './SavingsSheet';

// The first screen: what's left, what's been spent, and a big button to log a spend.
export default function HomeScreen(props) {
  const { pk, period, tabs, ctx, currency, partner, partnerOnline } = props;
  const { onLogSpend, onAddBill, onGoto, onOpenPerson, onAddPerson } = props;
  const view = isYearKey(pk) ? 'yearly' : 'monthly';
  const per = view === 'yearly' ? 'this year' : 'this month';

  const people = sorted(period?.people);
  const income = people.reduce((s, p) => s + inView(monthlyIncome(p), view), 0);
  const expenses = tabs.reduce((s, t) => s + tabInView(period?.items?.[t.id], view, ctx), 0);
  const left = income - expenses;

  const budgets = budgetItems(period, tabs).map((b) => ({ ...b, status: budgetStatus(b.item, b.id, ctx.spending, pk) }));
  const due = isYearKey(pk) ? `${pk}-12` : pk;
  const pots = trackedItems(period, tabs);
  const saved = pots.reduce((s, p) => s + potBalance(p.id, ctx.tracks?.[p.id], ctx.periods, due), 0);
  const yearly = tabs.reduce((s, t) => s + setAsideTab(period?.items?.[t.id]), 0);

  return (
    <div className="home">
      {/* 1. What's left */}
      <section className="home-card summary">
        {income > 0 ? (
          <>
            <span className="summary-label">Left {per}</span>
            <span className={`summary-big ${left < 0 ? 'neg' : ''}`}>{formatMoney(left, currency)}</span>
            <div className="summary-split">
              <span>
                <span className="muted small">Income</span>
                <b>{formatMoney(income, currency)}</b>
              </span>
              <span className="minus" aria-hidden="true">
                −
              </span>
              <button className="summary-link" onClick={() => onGoto('bills')}>
                <span className="muted small">Expenses</span>
                <b>{formatMoney(expenses, currency)}</b>
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="summary-label">Expenses {per}</span>
            <span className="summary-big">{formatMoney(expenses, currency)}</span>
            <button className="link-btn" onClick={onAddPerson}>
              Add your income to see what’s left
            </button>
          </>
        )}
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

      {/* 3. Spending budgets */}
      {budgets.length > 0 && (
        <section className="home-card">
          <div className="home-card-head">
            <h2>Spending</h2>
            <button className="link-btn" onClick={() => onGoto('spending')}>
              See all ›
            </button>
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

      {/* 5. Income */}
      <section className="home-card">
        <div className="home-card-head">
          <h2>Income</h2>
          <button className="link-btn" onClick={onAddPerson}>
            ＋ Add
          </button>
        </div>
        {people.length === 0 && <p className="muted small">Add each person’s salary to see what’s left after expenses.</p>}
        {people.map((p) => (
          <button key={p.id} className="home-row" onClick={() => onOpenPerson(p.id)}>
            <span>{p.name || 'Unnamed'}</span>
            <b>{formatMoney(inView(monthlyIncome(p), view), currency)}</b>
          </button>
        ))}
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
