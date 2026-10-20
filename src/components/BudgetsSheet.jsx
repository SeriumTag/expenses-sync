import { useState } from 'react';
import { budgetStatus, periodLabel, sorted } from '../lib/budget';
import { formatMoney } from '../lib/format';
import BudgetTracker, { BudgetBar } from './BudgetTracker';
import Modal from './Modal';

// Every item ticked "Track spending" in the period being shown.
export function budgetItems(period, tabs) {
  return tabs.flatMap((t) =>
    sorted(period?.items?.[t.id])
      .filter((item) => item.budget)
      .map((item) => ({ id: item.id, item, tabId: t.id, tabName: t.name })),
  );
}

// Quick place to log a spend (e.g. lunch) and see what's left of each budget.
export default function BudgetsSheet({ ledgerId, pk, period, tabs, spending, currency, username, onOpenItem, onClose }) {
  const rows = budgetItems(period, tabs).map((b) => ({ ...b, status: budgetStatus(b.item, b.id, spending, pk) }));
  const [open, setOpen] = useState(() => (rows.length === 1 ? rows[0].id : null));
  const total = rows.reduce(
    (t, r) => ({ budget: t.budget + r.status.budget, spent: t.spent + r.status.spent, left: t.left + r.status.left }),
    { budget: 0, spent: 0, left: 0 },
  );

  return (
    <Modal title="Budgets" onClose={onClose}>
      {rows.length > 1 && (
        <div className="budgets-total">
          <span className="muted small">All budgets · {periodLabel(pk)}</span>
          <BudgetBar status={total} currency={currency} />
        </div>
      )}
      {rows.length === 0 && <p className="muted">No budgets yet. Open an item (e.g. Food) and tick “Track spending”.</p>}
      <div className="budgets-list">
        {rows.map((r) => (
          <div key={r.id} className={`budget-row ${open === r.id ? 'open' : ''}`}>
            <div className="budget-row-top">
              <button className="pot-name" onClick={() => onOpenItem(r.tabId, r.id)}>
                <b>{r.item.name || 'Untitled'}</b>
                <span className="tab-badge">{r.tabName || 'Untitled'}</span>
              </button>
              <button className={`btn sm ${open === r.id ? 'ghost' : 'glass'}`} onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                {open === r.id ? 'Done' : '＋ Spend'}
              </button>
            </div>
            {open === r.id ? (
              <BudgetTracker
                ledgerId={ledgerId}
                itemId={r.id}
                item={r.item}
                pk={pk}
                spending={spending}
                currency={currency}
                username={username}
                otherBudgets={rows.filter((o) => o.id !== r.id).map((o) => ({ id: o.id, name: o.item.name }))}
              />
            ) : (
              <>
                <BudgetBar status={r.status} currency={currency} />
                {r.status.spends[0] && (
                  <p className="muted small budget-last">
                    Last: {r.status.spends[0].note || 'spend'} {formatMoney(r.status.spends[0].amount, currency)}
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
