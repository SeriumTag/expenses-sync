import { useState } from 'react';
import { FREQS, MONTHS, RECURS, amountInView, compareItem, isPaused, isYearKey, nextOccurrences, recurOf, spentMode, findItem, findAny, inView, monthlyOf, setAsideOf, yearOf, yearlyOf } from '../lib/budget';
import { copyItemsToMonth, dateIn, duplicateItems, itemToSpend, laterCopies, moveItem, ordersAfter, removeFromLater, saveItemForward, setEndMonth, splitItem, trashItem } from '../lib/db';
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
import { billMonth, cardsList, monthShort } from '../lib/cards';
import { cashcardTopUps } from '../lib/drive';

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
  const { groups = [], onMoved, cards: cardMap, drive, onOpenPage } = props;
  const noBudget = spentMode(item);
  const period = periods?.[pk];
  const ctx = { year: yearOf(pk), tracks, periods, spending, pk, period, cards: cardMap || {}, people: period?.people || {} };
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
    // A new budget starts as "No fixed budget" (just log spends).
    saveMany({ track: k === 'savings' || null, budget: k === 'budget' || null, ...(k === 'budget' ? { budgetMode: 'spent' } : {}) });
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

  // The day it repeats on comes from its date (14 Jan → the 14th of each month).
  const day = Number(String(item.date || '').slice(8, 10)) || '';
  const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
  function setDay(value) {
    const d = Math.max(1, Math.min(31, Math.round(Number(value) || 0)));
    if (!value || !d) return;
    save('date')(dateIn(`${pk}-${String(d).padStart(2, '0')}`, pk));
  }

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

  // ── Money rules: automatic amount, cash card link, shared budget, paid by card ──
  const cards = cardsList(cardMap);
  const personName = (pid) => period?.people?.[pid]?.name || 'someone';
  const driveOwners = Object.keys(drive || {}).filter((pid) => Object.keys(drive[pid]?.items || {}).length || Object.keys(drive[pid]?.rides || {}).length);
  const computed = Boolean(item.auto || item.link?.cashcard);
  const poolSource = item.pool ? findAny(period, item.pool) : null;
  const poolOptions = Object.entries(period?.items || {})
    .filter(([t]) => t !== tabId)
    .flatMap(([t, items]) =>
      Object.entries(items || {})
        .filter(([, it]) => it && !it.pool && !it.track)
        // A combined item offers its parts (e.g. Combined → Allowances) as well as itself.
        .flatMap(([id, it]) => [{ id, it, t }, ...Object.entries(it.parts || {}).map(([pid, p]) => ({ id: pid, it: p, t, parent: it }))]),
    )
    .sort((a, b) => Number(Boolean(b.it.auto)) - Number(Boolean(a.it.auto)) || String(a.it.name || '').localeCompare(String(b.it.name || '')));
  const groupNameOf = (t) => period?.tabs?.[t]?.name || 'Untitled';
  const billDate = `${pk}-${/^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date.slice(8, 10) : '01'}`;
  const cardBm = item.card && cardMap?.[item.card] && monthOnly ? billMonth(billDate, cardMap[item.card]) : null;

  // ── Compact layout bits ──
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = noteOpen || Boolean(item.note);
  const change = compareItem(item, itemId, prevPeriod);
  const pausedCount = Object.keys(item.pauses || {}).filter((k) => k >= pk).length;
  const repeatSummary = [item.endMonth && `ends ${monthName(item.endMonth)}`, pausedCount && `${pausedCount} paused`].filter(Boolean).join(' · ');
  const amountLabel = kind === 'budget' ? 'Budget' : kind === 'savings' ? 'Put aside' : 'Amount';
  const SHORT = { bill: 'Bill', budget: 'Budget', savings: 'Savings' };
  const REPEAT_SHORT = { once: 'Once', monthly: 'Monthly', yearly: 'Yearly' };
  // One short line under the amount, only when it adds something.
  const extras = [
    !isGroup && recur === 'monthly' && freq === 'yearly' && `= ${formatMoney(monthlyOf(item), currency)}/mo`,
    !isGroup && recur === 'yearly' && Number(item.amount) > 0 && `save ${formatMoney(Number(item.amount) / 12, currency)}/mo for it`,
    setAsideOf(item) > 0 && recur === 'monthly' && `save ${formatMoney(setAsideOf(item), currency)}/mo for it`,
    noBudget && `${formatMoney(amountInView(item, itemId, 'monthly', ctx), currency)} spent so far`,
    kind === 'savings' && `${formatMoney(yearlyOf(item, itemId, ctx), currency)} saved in ${yearOf(pk)}`,
    isGroup && `${formatMoney(monthlyOf(item), currency)}/mo in total`,
  ].filter(Boolean);
  const repeatHint =
    recur === 'once'
      ? `Only in ${monthName(pk)}`
      : recur === 'yearly'
        ? `Every year in ${MONTHS[Number(pk.slice(5, 7)) - 1]}, counted in full`
        : day
          ? `On the ${ordinal(day)} of every month`
          : 'Every month';

  return (
    <Modal title={`${item.name || 'New item'} · ${tabName || 'Untitled'}`} onClose={onClose}>
      <div className="sheet compact-sheet">
        <LiveInput
          className="sheet-title"
          fieldKey={key('name')}
          value={item.name || ''}
          onSave={save('name')}
          placeholder="What is it? e.g. Netflix, Food"
          autoFocusOnMount={!item.name}
          aria-label="Name"
        />

        {/* Amount (with per month / per year for monthly items) */}
        {!isGroup && computed && (
          <div className="cs-computed">
            <b className="big-amount-ro">{formatMoney(Number(item.amount) || 0, currency)}</b>
            <span className="muted small">
              {item.link?.cashcard
                ? `Grab cash card top-ups in ${monthName(pk)}`
                : `${formatMoney(Number(item.auto?.total) || 0, currency)} − ${formatMoney(Math.max(0, (Number(item.auto?.total) || 0) - (Number(item.amount) || 0)), currency)} of the other items in ${tabName || 'this group'}`}
            </span>
          </div>
        )}
        {!isGroup && poolSource && (
          <div className="cs-computed">
            <b className="big-amount-ro">{formatMoney(monthlyOf(poolSource.item), currency)}</b>
            <span className="muted small">
              Shared budget from {poolSource.parent ? `${poolSource.parent.name || 'Combined'} → ` : ''}
              {poolSource.item.name || 'another item'} ({groupNameOf(poolSource.tabId)}) · not counted in {tabName || 'this group'}’s total
            </span>
          </div>
        )}
        {!isGroup && !noBudget && !computed && !poolSource && (
          <div className="cs-amount">
            <LiveInput
              className="ep-amount big-amount"
              inputMode="decimal"
              fieldKey={key('amount')}
              value={item.amount}
              format={(v) => (v ? String(v) : '')}
              parse={parseAmount}
              display={(v) => formatMoney(v, currency)}
              onSave={save('amount')}
              placeholder={`${amountLabel} 0.00`}
              aria-label={amountLabel}
            />
            {recur === 'monthly' && (
              <div className="seg small-seg" role="group" aria-label="Amount per">
                <button className={freq === 'monthly' ? 'on' : ''} onClick={() => save('freq')('monthly')}>
                  /mo
                </button>
                <button className={freq === 'yearly' ? 'on' : ''} onClick={() => save('freq')('yearly')}>
                  /yr
                </button>
              </div>
            )}
          </div>
        )}
        {(extras.length > 0 || change) && (
          <p className="cs-extra muted small">
            {extras.join(' · ')}
            {change && (
              <>
                {extras.length > 0 && ' · '}
                <ChangeBadge change={change} prevLabel={prevLabel} currency={currency} view={view} />
              </>
            )}
          </p>
        )}

        {/* Type and repeat, as two compact pill rows */}
        <div className="cs-pills">
          <div className="pill-seg" role="radiogroup" aria-label="What is this?">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)} title={v.hint}>
                {v.icon} {SHORT[k]}
              </button>
            ))}
          </div>
          {monthOnly && (
            <div className="cs-repeat">
              <div className="pill-seg" role="radiogroup" aria-label="Repeats">
                {Object.keys(RECURS).map((r) => (
                  <button key={r} role="radio" aria-checked={recur === r} className={recur === r ? 'on' : ''} onClick={() => setRecur(r)}>
                    {REPEAT_SHORT[r]}
                  </button>
                ))}
              </div>
              {recur === 'monthly' && (
                <label className="inline-day">
                  on
                  <input type="number" inputMode="numeric" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Repeats on day of the month" className="day-input" />
                  {day ? ordinal(day).replace(String(day), '') : ''}
                </label>
              )}
              {recur === 'yearly' && (
                <input
                  type="date"
                  className="inline-date"
                  value={item.date && item.date.startsWith(pk) ? item.date : ''}
                  min={`${pk}-01`}
                  max={dateIn(`${pk}-31`, pk)}
                  onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && save('date')(e.target.value)}
                  aria-label="Repeats on date"
                />
              )}
            </div>
          )}
          <span className="cs-hint muted small">
            {KINDS[kind].label}
            {monthOnly ? ` · ${repeatHint}` : ''}
            {item.endMonth && recur !== 'once' ? ` · ends ${monthName(item.endMonth)}` : ''}
          </span>
        </div>

        {kind === 'budget' && !isGroup && (
          <label className="switch-row compact-switch">
            <input type="checkbox" checked={noBudget} onChange={(e) => save('budgetMode')(e.target.checked ? 'spent' : null)} />
            <span>
              No fixed budget <span className="muted small">— what’s spent counts as the amount</span>
            </span>
          </label>
        )}

        {/* Category and date side by side */}
        <div className="cs-row">
          <div className="field">
            <span>Category</span>
            <CatField fieldKey={key('category')} value={item.category} onSave={save('category')} listId="sheet-categories" className="sheet-cat" placeholder={isGroup ? 'Head category' : 'Optional'} />
          </div>
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
        {isGroup && <span className="muted small cs-note-hint">Its parts get this category too; add extra ones on each part below.</span>}

        {monthOnly && !isGroup && kind !== 'savings' && (
          <div className="money-rules">
            {kind === 'bill' && (
              <label className="switch-row compact-switch">
                <input type="checkbox" checked={Boolean(item.auto)} onChange={(e) => saveMany({ auto: e.target.checked ? { total: 1800 } : null, link: null })} />
                <span>
                  Automatic: a set total minus everything else in {tabName || 'this group'} <span className="muted small">— e.g. Allowances</span>
                </span>
              </label>
            )}
            {item.auto && (
              <label className="field inline-field">
                <span>Set total</span>
                <LiveInput
                  inputMode="decimal"
                  fieldKey={key('autoTotal')}
                  value={item.auto.total}
                  format={(v) => (v ? String(v) : '')}
                  parse={parseAmount}
                  display={(v) => formatMoney(v, currency)}
                  onSave={(v) => v > 0 && saveMany({ auto: { total: v } })}
                  aria-label="Set total"
                />
              </label>
            )}
            {kind === 'bill' && driveOwners.length > 0 && (
              <label className="switch-row compact-switch">
                <input type="checkbox" checked={Boolean(item.link?.cashcard)} onChange={(e) => saveMany({ link: e.target.checked ? { cashcard: driveOwners[0] } : null, auto: null })} />
                <span>
                  Amount = Grab cash card top-ups <span className="muted small">— Drive → Other → Cashcard top-up</span>
                </span>
              </label>
            )}
            {item.link?.cashcard && (
              <p className="muted small rule-note">
                {driveOwners.length > 1 ? (
                  <>
                    From{' '}
                    <select value={item.link.cashcard} onChange={(e) => saveMany({ link: { cashcard: e.target.value } })} aria-label="Whose Drive page">
                      {driveOwners.map((pid) => (
                        <option key={pid} value={pid}>
                          {personName(pid)}
                        </option>
                      ))}
                    </select>{' '}
                    ’s Drive page.
                  </>
                ) : (
                  <>From {personName(item.link.cashcard)}’s Drive page. </>
                )}{' '}
                {formatMoney(cashcardTopUps(drive?.[item.link.cashcard], pk), currency)} topped up in {monthName(pk)}.{' '}
                {onOpenPage && (
                  <button className="link-btn" onClick={() => onOpenPage('drive', item.link.cashcard)}>
                    Open Drive ›
                  </button>
                )}
              </p>
            )}
            {kind === 'budget' && poolOptions.length > 0 && (
              <label className="field inline-field">
                <span>Budget comes from</span>
                <select value={item.pool || ''} onChange={(e) => saveMany({ pool: e.target.value || null })} aria-label="Budget comes from">
                  <option value="">Its own amount</option>
                  {poolOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.parent ? `${o.parent.name || 'Combined'} → ` : ''}
                      {o.it.name || 'Untitled'} · {groupNameOf(o.t)}
                      {o.it.auto ? ' (automatic)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {cards.length > 0 && (
              <label className="field inline-field">
                <span>Paid by</span>
                <select value={item.card || ''} onChange={(e) => saveMany({ card: e.target.value || null })} aria-label="Paid by">
                  <option value="">Cash / debit / GIRO</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      💳 {c.name || 'Card'}
                      {period?.people?.[c.person]?.name ? ` · ${period.people[c.person].name}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === 'budget' && item.card && cardMap?.[item.card] && (
              <p className="muted small rule-note">💳 Spends on this budget go on {cardMap[item.card].name} — each counts in the month its card bill comes (a spend can still pick cash).</p>
            )}
            {cardBm && kind !== 'budget' && (
              <p className="muted small rule-note">
                {cardBm === pk ? `💳 On the ${monthShort(cardBm)} card bill — counts in ${monthName(pk)}.` : `💳 Billed in ${monthName(cardBm)} — counts there, not in ${monthName(pk)}.`}
              </p>
            )}
          </div>
        )}
        <datalist id="sheet-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {showNote ? (
          <LiveInput className="sheet-note" fieldKey={key('note')} value={item.note || ''} onSave={save('note')} placeholder="Note" multiline autoFocusOnMount={noteOpen && !item.note} aria-label="Note" />
        ) : (
          <button className="link-btn cs-add-note" onClick={() => setNoteOpen(true)}>
            ＋ Add a note
          </button>
        )}

        {/* The everyday part for budgets, savings and combined items */}
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
              ctx={ctx}
            />
          </section>
        )}
        {kind === 'savings' && (
          <section className="sheet-section">
            <h3>Saved each month</h3>
            <SavingsTracker ledgerId={ledgerId} itemId={itemId} year={yearOf(pk)} log={tracks?.[itemId]?.log} periods={periods} currency={currency} name={item.name} />
          </section>
        )}
        {isGroup && (
          <PartsList path={path} lockPrefix={`${pk}:part:${itemId}`} item={item} currency={currency} globalView={view} listId="sheet-categories" saveForward={saveMany} driveOwners={monthOnly ? driveOwners : []} personName={personName} topUps={(pid) => cashcardTopUps(drive?.[pid], pk)} />
        )}

        {/* Rarely needed: folded away */}
        {monthOnly && recur !== 'once' && (
          <details className="sheet-more" open={Boolean(repeatSummary)}>
            <summary>Repeat options{repeatSummary ? ` · ${repeatSummary}` : ''}</summary>
            <div className="recur-box">
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
                  <span className="field-label">Pause in (counts $0 that month)</span>
                  <div className="pause-chips">
                    {occurrences.map((k) => (
                      <button key={k} className={`chip ${isPaused(item, k) ? 'active' : ''}`} onClick={() => togglePause(k)} aria-pressed={isPaused(item, k)}>
                        {isPaused(item, k) ? '⏸ ' : ''}
                        {MONTHS[Number(k.slice(5, 7)) - 1]}
                        {k.slice(0, 4) !== pk.slice(0, 4) ? ` ${k.slice(2, 4)}` : ''}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button className="btn danger-outline stop-btn" onClick={stopRecurring}>
                ⏹ Stop after {monthName(pk)}
              </button>
            </div>
          </details>
        )}

        <details className="sheet-more" open={fileCount > 0}>
          <summary>
            More{fileCount > 0 ? ` · ${fileCount} file${fileCount === 1 ? '' : 's'}` : ''} · photos, copy, move
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
        <button className="delete-line" onClick={remove} title="Only this one. It stays in the bin for 7 days.">
          🗑 Delete “{item.name || 'this item'}”
        </button>
      </div>
    </Modal>
  );
}
