import { useState } from 'react';
import { FREQS, MONTHS, RECURS, amountInView, compareItem, isPaused, isYearKey, nextOccurrences, recurOf, spentMode, findItem, inView, monthlyOf, setAsideOf, yearOf, yearlyOf } from '../lib/budget';
import { copyItemsToMonth, duplicateItems, itemToSpend, laterCopies, moveItem, ordersAfter, removeFromLater, saveItemForward, setEndMonth, splitItem, trashItem } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import CatField from './CatField';
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
  const { groups = [], onMoved } = props;
  const noBudget = spentMode(item);
  const ctx = { year: yearOf(pk), tracks, periods, spending, pk };
  const path = `${base}/items/${tabId}/${itemId}`;
  const key = (f) => `${pk}:item:${itemId}:${f}`;
  // Changes to a recurring item apply to this month and later months.
  const saveMany = (patch) => saveItemForward(ledgerId, periods, pk, tabId, itemId, patch, username);
  const save = (field) => (value) => saveMany({ [field]: value });
  const isGroup = Boolean(item.parts);
  const freq = item.freq === 'yearly' ? 'yearly' : 'monthly';
  const before = prevPeriod ? findItem(prevPeriod, itemId) : null;
  const kind = kindOf(item);
  const name = item.name || 'this item';
  const fileCount = Object.keys(item.files || {}).length;

  function setKind(k) {
    if (k === kind) return;
    saveMany({ track: k === 'savings' || null, budget: k === 'budget' || null });
  }

  // ── How often ──
  const recur = recurOf(item);
  const monthOnly = !isYearKey(pk);
  const monthName = (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  const later = monthOnly ? laterCopies(periods, pk, itemId) : [];
  const occurrences = monthOnly ? nextOccurrences(item, pk, 12) : [];

  async function setRecur(r) {
    if (r === recur) return;
    // One-time and yearly items don't belong in the next months; ask first.
    if (r !== 'monthly' && later.length) {
      const msg = `Make “${name}” ${r === 'once' ? 'one-time' : 'yearly'}? It will be removed from the ${later.length} later month(s) it's already in (${later.map(monthName).join(', ')}).`;
      if (!window.confirm(msg)) return;
      await removeFromLater(ledgerId, periods, pk, itemId);
    }
    // One-time and yearly amounts are the full payment, counted in its month.
    const patch = { recur: r, startMonth: item.startMonth || pk };
    if (r !== 'monthly' && item.freq === 'yearly') patch.freq = 'monthly';
    await saveItemForward(ledgerId, periods, pk, tabId, itemId, patch, username);
  }

  async function setEnd(month) {
    const end = /^\d{4}-\d{2}$/.test(month || '') ? month : null;
    const dropped = end ? later.filter((k) => k > end) : [];
    if (dropped.length && !window.confirm(`End “${name}” after ${monthName(end)}? It will be removed from ${dropped.map(monthName).join(', ')}.`)) return;
    await setEndMonth(ledgerId, periods, itemId, end);
  }

  async function stopRecurring() {
    const msg = `Stop “${name}” after ${monthName(pk)}? It won't appear in later months${later.length ? ` and will be removed from ${later.map(monthName).join(', ')}` : ''}. ${monthName(pk)} and earlier stay as they are.`;
    if (!confirmTwice(msg, `“${name}” from later months`)) return;
    await setEndMonth(ledgerId, periods, itemId, pk);
  }

  const togglePause = (k) => saveMany({ [`pauses/${k}`]: isPaused(item, k) ? null : true });

  // ── Copy or move to another month ──
  const nextMonthKey = (() => {
    if (!monthOnly) return '';
    const d = new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [toMonth, setToMonth] = useState(nextMonthKey);
  const [toGroup, setToGroup] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const targetGroups = Object.entries(periods?.[toMonth]?.tabs || {}).map(([id, t]) => ({ id, name: t.name }));

  async function copyToMonth(move) {
    if (!/^\d{4}-\d{2}$/.test(toMonth) || toMonth === pk) return;
    if (move && !window.confirm(`Move “${name}” to ${monthName(toMonth)}? It will be removed from ${monthName(pk)}.`)) return;
    await copyItemsToMonth(ledgerId, periods, pk, [{ tabId, itemId }], toMonth, toGroup || null, { move, username });
    if (move) onClose();
    else {
      setMoveNote(`Copied to ${monthName(toMonth)}.`);
      setTimeout(() => setMoveNote(''), 3000);
    }
  }

  // Deleting moves the item to the bin (restorable for 7 days), with Undo.
  async function remove() {
    if (!confirmTwice(`Delete “${name}”? Only this one is deleted. It goes to the bin for 7 days, where you can restore it.`, `“${name}”`)) return;
    onClose();
    const trashId = await trashItem(ledgerId, pk, { id: tabId, ...tab, name: tab?.name ?? tabName }, itemId, item, username);
    onTrashed?.(trashId, item.name || 'Item');
  }

  // Move to another group of this month.
  async function moveTo(toTab) {
    if (!toTab || toTab === tabId) return;
    await moveItem(base, tabId, toTab, itemId, item);
    onMoved?.(toTab);
  }

  // Turn this item into a spend under a budget (e.g. Mummy → Credit Card).
  async function toSpend(budgetId) {
    const target = (otherBudgets || []).find((b) => b.id === budgetId);
    if (!target) return;
    const msg = [
      `Turn “${name}” into a spend under ${target.name || 'that budget'}?`,
      `It will be listed there as ${formatMoney(item.parts ? monthlyOf(item) : Number(item.amount) || 0, currency)} on its date, and leave this group.`,
      item.budget ? 'Spends already logged under it stay saved and come back if it becomes a budget again.' : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (!window.confirm(msg)) return;
    onClose();
    await itemToSpend(ledgerId, pk, tabId, itemId, item, budgetId, username);
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
        {recur === 'monthly' && (
        <div className="seg small-seg" role="group" aria-label="Amount per">
          <button className={freq === 'monthly' ? 'on' : ''} onClick={() => save('freq')('monthly')}>
            per month
          </button>
          <button className={freq === 'yearly' ? 'on' : ''} onClick={() => save('freq')('yearly')}>
            per year
          </button>
        </div>
        )}
      </div>
    </div>
  );

  return (
    <Modal title={item.name || 'New item'} onClose={onClose}>
      <div className="sheet">
        <p className="sheet-where muted small">
          In <b>{tabName || 'Untitled'}</b>
        </p>
        <div className="name-date">
          <label className="field">
            <span>Name</span>
            <LiveInput className="sheet-title" fieldKey={key('name')} value={item.name || ''} onSave={save('name')} placeholder="e.g. Netflix, Food, Car insurance" autoFocusOnMount={!item.name} />
          </label>
          {/* Just a record of when it's from; past or future both fine. */}
          <label className="field item-date">
            <span>Date</span>
            <input
              type="date"
              value={item.date || ''}
              onChange={(e) => save('date')(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : null)}
              aria-label="Date"
            />
          </label>
        </div>

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

        {monthOnly && (
          <div className="field">
            <span>How often?</span>
            <div className="kind-pick recur-pick" role="radiogroup" aria-label="How often?">
              {Object.entries(RECURS).map(([r, v]) => (
                <button key={r} role="radio" aria-checked={recur === r} className={`kind-opt ${recur === r ? 'on' : ''}`} onClick={() => setRecur(r)}>
                  <span className="kind-label">{v.label}</span>
                </button>
              ))}
            </div>
            <span className="muted small">
              {recur === 'once'
                ? `Only in ${monthName(pk)}.`
                : recur === 'yearly'
                  ? `Appears every ${MONTHS[Number(pk.slice(5, 7)) - 1]}, counted in full that month.`
                  : 'Carries on into the following months.'}
              {item.endMonth ? ` Ends after ${monthName(item.endMonth)}.` : recur !== 'once' ? ' Keeps going until you stop it.' : ''}
            </span>
          </div>
        )}

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
              groups={groups}
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

        {monthOnly && recur !== 'once' && (
          <section className="sheet-section recur-box">
            <h3>Repeats</h3>
            <div className="recur-row">
              <label>
                <span>Ends after</span>
                <input type="month" value={item.endMonth || ''} min={pk} onChange={(e) => setEnd(e.target.value)} aria-label="Ends after month" />
              </label>
              {item.endMonth ? (
                <button className="btn ghost sm" onClick={() => setEnd(null)}>
                  Keep going
                </button>
              ) : (
                <span className="muted small">Keeps going</span>
              )}
            </div>
            {occurrences.length > 0 && (
              <>
                <span className="field-label">Pause in</span>
                <div className="pause-chips">
                  {occurrences.map((k) => (
                    <button key={k} className={`chip ${isPaused(item, k) ? 'active' : ''}`} onClick={() => togglePause(k)} aria-pressed={isPaused(item, k)}>
                      {isPaused(item, k) ? '⏸ ' : ''}
                      {MONTHS[Number(k.slice(5, 7)) - 1]}
                      {k.slice(0, 4) !== pk.slice(0, 4) ? ` ${k.slice(2, 4)}` : ''}
                    </button>
                  ))}
                </div>
                <span className="muted small">A paused month counts $0. Tap again to resume.</span>
              </>
            )}
            <button className="btn danger-outline stop-btn" onClick={stopRecurring}>
              ⏹ Stop after {monthName(pk)}
            </button>
          </section>
        )}

        <div className="field">
          <span>Categories</span>
          <CatField fieldKey={key('category')} value={item.category} onSave={save('category')} listId="sheet-categories" className="sheet-cat" />
          <span className="muted small">
            {isGroup ? 'Its parts get this category too; add extra ones on each part below.' : 'Optional. For more than one, use commas: Insurance, Kids'}
          </span>
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

        {isGroup && (
          <PartsList path={path} lockPrefix={`${pk}:part:${itemId}`} item={item} currency={currency} globalView={view} listId="sheet-categories" saveForward={saveMany} />
        )}

        <details className="sheet-more" open={fileCount > 0}>
          <summary>
            More: photos & files{fileCount > 0 ? ` (${fileCount})` : ''}, move, copy to another month{isGroup ? ', separate' : ''}
          </summary>
          <Attachments ledgerId={ledgerId} itemPath={`periods/${pk}/items/${tabId}/${itemId}`} files={item.files} username={username} />
          {monthOnly && (
            <div className="month-move">
              <span className="field-label">Copy or move to another month</span>
              <div className="move-box">
                <label>
                  <span>Month</span>
                  <input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} aria-label="Target month" />
                </label>
                <label>
                  <span>Group</span>
                  <select value={toGroup} onChange={(e) => setToGroup(e.target.value)} aria-label="Target group">
                    <option value="">Same name ({tabName || 'General'})</option>
                    {targetGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name || 'Untitled'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row-gap">
                <button className="btn glass sm" disabled={!toMonth || toMonth === pk} onClick={() => copyToMonth(false)}>
                  Copy there
                </button>
                <button className="btn glass sm" disabled={!toMonth || toMonth === pk} onClick={() => copyToMonth(true)}>
                  Move there
                </button>
                {moveNote && <span className="spend-notice">{moveNote}</span>}
              </div>
            </div>
          )}
          <div className="move-box">
            {groups.length > 1 && (
              <label>
                <span>Move to group</span>
                <select value="" onChange={(e) => moveTo(e.target.value)} aria-label="Move to another group">
                  <option value="">Choose a group…</option>
                  {groups
                    .filter((g) => g.id !== tabId)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name || 'Untitled'}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {(otherBudgets || []).some((b) => b.id !== itemId) && (
              <label>
                <span>Turn into a spend under</span>
                <select value="" onChange={(e) => toSpend(e.target.value)} aria-label="Turn into a spend under a budget">
                  <option value="">Choose a budget…</option>
                  {(otherBudgets || [])
                    .filter((b) => b.id !== itemId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || 'Untitled'}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
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
