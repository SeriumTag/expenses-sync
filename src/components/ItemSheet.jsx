import { FREQS, amountInView, compareItem, spentMode, findItem, groupCatLabel, inView, itemCats, monthlyOf, setAsideOf, yearOf, yearlyOf } from '../lib/budget';
import { duplicateItems, ordersAfter, splitItem, trashItem, updateItemField } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import CatField, { GroupCat } from './CatField';
import { ChangeBadge } from './ChangeBadge';
import LiveInput from './LiveInput';
import Modal from './Modal';
import PartsList from './PartsList';
import SavingsTracker from './SavingsTracker';
import { confirmTwice } from '../lib/confirm';
import Attachments from './Attachments';
import BudgetTracker from './BudgetTracker';

// What an item is. One choice instead of separate "savings" / "spending" ticks.
export const KINDS = {
  bill: { icon: '🧾', label: 'Bill', hint: 'A fixed amount you pay, e.g. rent, phone, insurance.' },
  budget: { icon: '💸', label: 'Spending budget', hint: 'Log what you spend, e.g. each meal, and see what’s left.' },
  savings: { icon: '🐷', label: 'Savings', hint: 'Money you put aside. See it build up month by month.' },
};
export const kindOf = (item) => (item?.track ? 'savings' : item?.budget ? 'budget' : 'bill');

// Pull-up card for one bill, budget or savings.
export default function ItemSheet(props) {
  const { ledgerId, base, pk, tabId, tabName, itemId, item, periods, prevPeriod, prevLabel } = props;
  const { spending, otherBudgets } = props;
  const { tracks, categories, currency, username, view, siblings, onOpenItem, onClose, tab, onTrashed } = props;
  const noBudget = spentMode(item);
  const ctx = { year: yearOf(pk), tracks, periods, spending, pk };
  const path = `${base}/items/${tabId}/${itemId}`;
  const key = (f) => `${pk}:item:${itemId}:${f}`;
  const save = (field) => (value) => updateItemField(base, tabId, itemId, field, value, username);
  const isGroup = Boolean(item.parts);
  const freq = item.freq === 'yearly' ? 'yearly' : 'monthly';
  const before = prevPeriod ? findItem(prevPeriod, itemId) : null;
  const kind = kindOf(item);
  const name = item.name || 'this item';
  const fileCount = Object.keys(item.files || {}).length;

  function setKind(k) {
    if (k === kind) return;
    save('track')(k === 'savings' || null);
    save('budget')(k === 'budget' || null);
  }

  // Deleting moves the item to the bin (restorable for 7 days), with Undo.
  async function remove() {
    if (!confirmTwice(`Delete “${name}”? Only this one is deleted. It goes to the bin for 7 days, where you can restore it.`, `“${name}”`)) return;
    onClose();
    const trashId = await trashItem(ledgerId, pk, { id: tabId, ...tab, name: tab?.name ?? tabName }, itemId, item, username);
    onTrashed?.(trashId, item.name || 'Item');
  }

  async function duplicate() {
    const [id] = await duplicateItems(base, tabId, [{ id: itemId, ...item }], ordersAfter(siblings, [itemId]), username);
    onOpenItem(id);
  }

  async function split() {
    if (!window.confirm(`Separate “${item.name}” back into ${Object.keys(item.parts).length} single items?`)) return;
    onClose();
    await splitItem(base, tabId, itemId, item, username);
  }

  const amountBox = (label) => (
    <div className="field">
      <span>{label}</span>
      <div className="amt-line">
        <LiveInput
          className="ep-amount big-amount"
          inputMode="decimal"
          fieldKey={key('amount')}
          value={item.amount}
          format={(v) => (v ? String(v) : '')}
          parse={parseAmount}
          display={(v) => formatMoney(v, currency)}
          onSave={save('amount')}
          placeholder="0.00"
          aria-label={label}
        />
        <div className="seg small-seg" role="group" aria-label="How often">
          <button className={freq === 'monthly' ? 'on' : ''} onClick={() => save('freq')('monthly')}>
            per month
          </button>
          <button className={freq === 'yearly' ? 'on' : ''} onClick={() => save('freq')('yearly')}>
            per year
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <Modal title={item.name || 'New item'} onClose={onClose}>
      <div className="sheet">
        <p className="sheet-where muted small">
          In <b>{tabName || 'Untitled'}</b>
        </p>
        <label className="field">
          <span>Name</span>
          <LiveInput className="sheet-title" fieldKey={key('name')} value={item.name || ''} onSave={save('name')} placeholder="e.g. Netflix, Food, Car insurance" autoFocusOnMount={!item.name} />
        </label>

        <div className="field">
          <span>What is this?</span>
          <div className="kind-pick" role="radiogroup" aria-label="What is this?">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} role="radio" aria-checked={kind === k} className={`kind-opt ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                <span className="kind-ico">{v.icon}</span>
                <span className="kind-label">{v.label}</span>
              </button>
            ))}
          </div>
          <span className="muted small">{KINDS[kind].hint}</span>
        </div>

        {/* Amount, worded for what this is. */}
        {!isGroup && kind === 'bill' && amountBox('Amount')}
        {!isGroup && kind === 'savings' && amountBox('Put aside')}
        {!isGroup && kind === 'budget' && (
          <>
            {!noBudget && amountBox('Budget')}
            <label className="switch-row compact-switch">
              <input type="checkbox" checked={noBudget} onChange={(e) => save('budgetMode')(e.target.checked ? 'spent' : null)} />
              <span>
                No fixed budget <span className="muted small">— just log spends; what’s spent counts as the amount</span>
              </span>
            </label>
          </>
        )}

        {/* The everyday part for budgets and savings comes right after the amount. */}
        {kind === 'budget' && (
          <section className="sheet-section">
            <h3>Spends this month</h3>
            <BudgetTracker
              ledgerId={ledgerId}
              itemId={itemId}
              item={item}
              pk={pk}
              spending={spending}
              currency={currency}
              username={username}
              otherBudgets={(otherBudgets || []).filter((b) => b.id !== itemId)}
            />
          </section>
        )}
        {kind === 'savings' && (
          <section className="sheet-section">
            <h3>Saved each month</h3>
            <SavingsTracker ledgerId={ledgerId} itemId={itemId} year={yearOf(pk)} log={tracks?.[itemId]?.log} periods={periods} currency={currency} name={item.name} />
          </section>
        )}

        <div className="sheet-summary">
          <span>
            <b>{formatMoney(noBudget ? amountInView(item, itemId, 'monthly', ctx) : monthlyOf(item), currency)}</b>
            <span className="muted small">/mo</span>
          </span>
          <span>
            <b>{formatMoney(noBudget ? amountInView(item, itemId, 'yearly', ctx) : yearlyOf(item, itemId, ctx), currency)}</b>
            <span className="muted small">{item.track ? ` saved in ${yearOf(pk)}` : '/yr'}</span>
          </span>
          {setAsideOf(item) > 0 && (
            <span className="set-aside-chip" title="This yearly bill spread over 12 months">
              Save {formatMoney(setAsideOf(item), currency)}/mo for it
            </span>
          )}
          {before && (
            <span className="muted small">
              {prevLabel}: {formatMoney(inView(monthlyOf(before.item), view), currency)}
              {FREQS[view].short}
            </span>
          )}
          <ChangeBadge change={compareItem(item, itemId, prevPeriod)} prevLabel={prevLabel} currency={currency} view={view} />
        </div>

        <div className="field">
          <span>Categories</span>
          {isGroup ? (
            <GroupCat label={groupCatLabel(item) || '—'} cats={itemCats(item)} />
          ) : (
            <CatField fieldKey={key('category')} value={item.category} onSave={save('category')} listId="sheet-categories" className="sheet-cat" />
          )}
          <span className="muted small">{isGroup ? 'Each part has its own category, below.' : 'Optional. For more than one, use commas: Insurance, Kids'}</span>
          <datalist id="sheet-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <label className="field">
          <span>Notes</span>
          <LiveInput className="sheet-note" fieldKey={key('note')} value={item.note || ''} onSave={save('note')} placeholder="Optional" multiline />
        </label>

        {isGroup && <PartsList path={path} lockPrefix={`${pk}:part:${itemId}`} item={item} currency={currency} globalView={view} listId="sheet-categories" />}

        <details className="sheet-more" open={fileCount > 0}>
          <summary>
            More: photos & files{fileCount > 0 ? ` (${fileCount})` : ''}, copy{isGroup ? ', separate' : ''}
          </summary>
          <Attachments ledgerId={ledgerId} itemPath={`periods/${pk}/items/${tabId}/${itemId}`} files={item.files} username={username} />
          <div className="sheet-actions start">
            <button className="btn glass sm" onClick={duplicate}>
              Make a copy
            </button>
            {isGroup && (
              <button className="btn glass sm" onClick={split}>
                Separate the parts
              </button>
            )}
          </div>
        </details>

        {/* Kept apart and spelled out, so it's never mistaken for deleting something else. */}
        <div className="danger-zone">
          <button className="btn danger-outline" onClick={remove}>
            🗑 Delete “{item.name || 'this item'}”
          </button>
          <span className="muted small">Only this one. It stays in the bin for 7 days.</span>
        </div>
      </div>
    </Modal>
  );
}
