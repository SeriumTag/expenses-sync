import { useState } from 'react';
import { prefs } from '../lib/session';
import { budgetStatus } from '../lib/budget';
import { formatMoney } from '../lib/format';
import BudgetTracker from './BudgetTracker';
import { budgetItems } from './BudgetsSheet';
import Modal from './Modal';

// "Log a spend" from Home: pick the budget, then amount / what / photo.
export default function QuickSpend({ ledgerId, pk, period, tabs, spending, currency, username, startWith, onAddBudget, onClose }) {
  const budgets = budgetItems(period, tabs);
  const [chosen, setChosen] = useState(() => {
    const want = startWith || prefs.get('lastBudget');
    return budgets.some((b) => b.id === want) ? want : budgets[0]?.id || null;
  });
  const pick = (id) => {
    setChosen(id);
    prefs.set('lastBudget', id);
  };
  const current = budgets.find((b) => b.id === chosen);

  return (
    <Modal title="Log a spend" onClose={onClose}>
      {budgets.length === 0 ? (
        <div className="empty-card flat">
          <div className="empty-ico">💸</div>
          <p>
            <b>First, add a spending budget</b>
            <br />
            e.g. Food or Petrol. Then you can log each spend against it.
          </p>
          <button className="btn primary" onClick={onAddBudget}>
            ＋ Add a spending budget
          </button>
        </div>
      ) : (
        <>
          <span className="field-label">What did you spend on?</span>
          <div className="budget-chips" role="radiogroup" aria-label="Budget">
            {budgets.map((b) => {
              const st = budgetStatus(b.item, b.id, spending, pk);
              return (
                <button key={b.id} role="radio" aria-checked={chosen === b.id} className={`budget-chip ${chosen === b.id ? 'on' : ''}`} onClick={() => pick(b.id)}>
                  <b>{b.item.name || 'Untitled'}</b>
                  <span className={st.noBudget ? 'muted' : st.left < 0 ? 'neg' : 'pos'}>
                    {st.noBudget ? `${formatMoney(st.spent, currency)} spent` : st.left < 0 ? `${formatMoney(-st.left, currency)} over` : `${formatMoney(st.left, currency)} left`}
                  </span>
                </button>
              );
            })}
          </div>
          {current && (
            <BudgetTracker
              key={current.id}
              ledgerId={ledgerId}
              itemId={current.id}
              item={current.item}
              pk={pk}
              spending={spending}
              currency={currency}
              username={username}
              otherBudgets={budgets.filter((b) => b.id !== current.id).map((b) => ({ id: b.id, name: b.item.name }))}
              showList={false}
              autoFocus
            />
          )}
        </>
      )}
    </Modal>
  );
}
