import { useState } from 'react';
import { FREQS, afterExpenses, monthlyIncome, sorted } from '../lib/budget';
import { newKey, patchPath, setPath } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import LiveInput from './LiveInput';
import Modal from './Modal';
import { confirmTwice } from '../lib/confirm';
import { cycleForPeriod, grabIncomeFor } from '../lib/drive';
import GrabBadge from './drive/GrabBadge';
import ScaleIcon from './extras/ScaleIcon';
import { billMonth, cardsFor, monthShort, ordinalDay } from '../lib/cards';

// Summary cards at the top: each person's salary and what's left after the
// head categories they chose.
export function SalaryStrip({ base, period, currency, view, ctx, onOpen }) {
  const people = sorted(period?.people);

  function add() {
    const id = newKey(`${base}/people`);
    patchPath(`${base}/people/${id}`, { name: '', salary: 0, order: Date.now() }).then(() => onOpen(id));
  }

  return (
    <div className="salary-strip">
      {people.map((p) => {
        const { salary, left } = afterExpenses(p, period, view, ctx);
        const extras = Object.keys(p.incomes || {}).length;
        return (
          <button key={p.id} className="salary-card" onClick={() => onOpen(p.id)}>
            <span className="salary-name">{p.name || 'Unnamed'}</span>
            <span className="salary-line">
              <span className="muted small" title={extras ? 'Salary plus other income' : undefined}>
                {extras ? `Income (+${extras})` : 'Salary'}
              </span>
              <b>{formatMoney(salary, currency)}</b>
            </span>
            <span className="salary-line">
              <span className="muted small">After expenses</span>
              <b className={left < 0 ? 'neg' : 'pos'}>{formatMoney(left, currency)}</b>
            </span>
          </button>
        );
      })}
      <button className="salary-card add" onClick={add}>
        <span className="plus">＋</span>
        <span>{people.length ? 'Add person' : 'Add salary'}</span>
      </button>
    </div>
  );
}

export function PersonSheet({ base, pk, personId, person, period, tabs, currency, view, ctx, drive, extras, happyFishTaken, onOpenDrive, onOpenExtra, onHappyFish, onClose }) {
  const path = `${base}/people/${personId}`;
  const { salary, spent, left } = afterExpenses(person, period, view, ctx);
  const chosen = person.tabs || {};
  const incomes = sorted(person.incomes);
  const [newIncome, setNewIncome] = useState(null); // focus the name of a just-added income
  const [askGrab, setAskGrab] = useState(false); // "Is this earning from Grab?"
  const [cardSheet, setCardSheet] = useState(null); // { card } | { card: null } for a new one
  const myCards = cardsFor(ctx?.cards, personId);
  const cardsPath = ctx?.ledgerId ? `ledgers/${ctx.ledgerId}/cards` : null;
  const hasGrab = incomes.some((x) => x.grab);
  const cycle = /^\d{4}-\d{2}$/.test(pk) ? cycleForPeriod(pk) : null;
  const shortD = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // A person has at most one Grab income; until then, ask each time.
  function addIncome(grab = false) {
    setAskGrab(false);
    const id = newKey(`${path}/incomes`);
    if (grab) {
      // Its amount comes from the Drive page: this month's car-payment cycle, net after petrol.
      patchPath(`${path}/incomes/${id}`, { name: 'Grab', grab: true, amount: grabIncomeFor(drive, pk), order: Date.now() });
      return;
    }
    setNewIncome(id);
    patchPath(`${path}/incomes/${id}`, { name: '', amount: 0, order: Date.now() });
  }
  function removeIncome(x) {
    if (!confirmTwice(`Remove “${x.name || 'this income'}”${x.amount ? ` (${formatMoney(x.amount, currency)}/mo)` : ''}?`, `“${x.name || 'this income'}”`)) return;
    setPath(`${path}/incomes/${x.id}`, null);
  }

  async function remove() {
    if (!confirmTwice(`Remove ${person.name || 'this person'} from the summary?`, `${person.name || 'this person'}`)) return;
    onClose();
    await setPath(path, null);
  }

  return (
    <>
    <Modal title="Salary" onClose={onClose}>
      <div className="sheet">
        <div className="sheet-grid">
          <label className="field">
            <span>Name</span>
            <LiveInput
              fieldKey={`${pk}:person:${personId}:name`}
              value={person.name || ''}
              onSave={(v) => patchPath(path, { name: v })}
              placeholder="e.g. Hamizan"
              autoFocusOnMount={!person.name}
            />
          </label>
          <div className="field">
            <span>Main salary (monthly)</span>
            {extras?.swim && (typeof extras.swim !== 'string' || pk >= extras.swim) ? (
              // Happy Fish (from the month it was ticked): the salary is this month's swim earnings.
              <button className="swim-salary" onClick={() => onOpenExtra('swim')} title="Open Happy Fish">
                <b>{formatMoney(person.salary, currency)}</b>
                <span className="muted small">last month’s swim days, paid this month · Open Happy Fish ›</span>
              </button>
            ) : (
              <LiveInput
                className="ep-amount"
                inputMode="decimal"
                fieldKey={`${pk}:person:${personId}:salary`}
                value={person.salary}
                format={(v) => (v ? String(v) : '')}
                parse={parseAmount}
                display={(v) => formatMoney(v, currency)}
                onSave={(v) => patchPath(path, { salary: v })}
                placeholder="0.00"
              />
            )}
            {!happyFishTaken && (
            <label className="happy-fish">
              <input type="checkbox" checked={Boolean(extras?.swim)} onChange={(e) => onHappyFish(e.target.checked)} />
              <span>🐟 Happy Fish — salary from my swim log</span>
            </label>
            )}
          </div>
        </div>

        <section className="sheet-section">
          <h3>Other income</h3>
          {incomes.length === 0 && <p className="muted small">Side jobs, allowances, rental… e.g. Grab $1,200 a month.</p>}
          {incomes.length > 0 && (
            <div className="income-list">
              {incomes.map((x) =>
                x.grab ? (
                <div key={x.id} className="income-row grab-income">
                  <button className="grab-open" onClick={onOpenDrive} title="Open the Drive page">
                    <GrabBadge />
                    <span className="grab-open-text">
                      <b>{formatMoney(x.amount, currency)}</b>
                      <span className="muted small">{cycle ? `cycle ${shortD(cycle.start)} – ${shortD(cycle.end)}` : 'from the Drive page'} · open ›</span>
                    </span>
                  </button>
                  <button className="icon-btn" aria-label="Remove the Grab income" onClick={() => removeIncome(x)}>
                    ✕
                  </button>
                </div>
                ) : (
                <div key={x.id} className="income-row">
                  <LiveInput
                    className="income-name"
                    fieldKey={`${pk}:person:${personId}:income:${x.id}:name`}
                    value={x.name || ''}
                    onSave={(v) => person.incomes?.[x.id] && patchPath(`${path}/incomes/${x.id}`, { name: v })}
                    placeholder="Name, e.g. Grab"
                    autoFocusOnMount={x.id === newIncome}
                    aria-label="Income name"
                  />
                  <LiveInput
                    className="ep-amount income-amt"
                    inputMode="decimal"
                    fieldKey={`${pk}:person:${personId}:income:${x.id}:amount`}
                    value={x.amount}
                    format={(v) => (v ? String(v) : '')}
                    parse={parseAmount}
                    display={(v) => formatMoney(v, currency)}
                    onSave={(v) => person.incomes?.[x.id] && patchPath(`${path}/incomes/${x.id}`, { amount: v })}
                    placeholder="0.00"
                    aria-label={`${x.name || 'Income'} per month`}
                  />
                  <span className="muted small">/mo</span>
                  <button className="icon-btn" aria-label={`Remove ${x.name || 'income'}`} onClick={() => removeIncome(x)}>
                    ✕
                  </button>
                </div>
                ),
              )}
            </div>
          )}
          <div className="sheet-row between">
            <button className="btn glass sm" onClick={() => (hasGrab ? addIncome(false) : setAskGrab(true))}>
              ＋ Add income
            </button>
            {incomes.length > 0 && (
              <span className="ep-total">
                Total income <b>{formatMoney(monthlyIncome(person), currency)}</b>
                <span className="muted small">/mo</span>
              </span>
            )}
          </div>
          {/* Their own pages: added here, then opened from here or their Home tile. */}
          <div className="extra-buttons">
            <button className={`btn sm ${extras?.weight ? 'glass extra-on' : 'ghost'}`} onClick={() => onOpenExtra('weight')}>
              {extras?.weight ? (
                <>
                  <ScaleIcon size={15} /> Weight log ›
                </>
              ) : (
                '＋ Add Weight Log'
              )}
            </button>
            <button className={`btn sm ${extras?.bitcoin ? 'glass extra-on' : 'ghost'}`} onClick={() => onOpenExtra('bitcoin')}>
              {extras?.bitcoin ? '₿ Bitcoin ›' : '＋ Add Bitcoin'}
            </button>
          </div>
        </section>

        <section className="sheet-section">
          <h3>What does {person.name || 'this person'} pay for?</h3>
          <p className="muted small">Tick the groups paid from this income. What’s left is shown on Home.</p>
          {tabs.map((t) => (
            <label key={t.id} className="switch-row">
              <input
                type="checkbox"
                checked={Boolean(chosen[t.id])}
                onChange={(e) => patchPath(`${path}/tabs`, { [t.id]: e.target.checked || null })}
              />
              <span>{t.name || 'Untitled'}</span>
            </label>
          ))}
        </section>

        {cardsPath && (
          <section className="sheet-section">
            <h3>💳 Credit cards</h3>
            <p className="muted small">What’s put on a card counts in the month its bill comes, not the month it was used. Pick the card under “Paid by” on a bill or a spend.</p>
            {myCards.map((cd) => (
              <button key={cd.id} className="card-row" onClick={() => setCardSheet({ card: cd })}>
                <span>
                  <b>{cd.name || 'Card'}</b>
                  <span className="muted small"> · bill on the {ordinalDay(cd.day)}</span>
                </span>
                <span className="rr-e">✎</span>
              </button>
            ))}
            <button className="btn ghost sm" onClick={() => setCardSheet({ card: null })}>
              ＋ Add card
            </button>
          </section>
        )}

        <div className="sheet-summary">
          <span>
            <span className="muted small">{incomes.length ? 'Income ' : 'Salary '}</span>
            <b>{formatMoney(salary, currency)}</b>
          </span>
          <span>
            <span className="muted small">− Expenses </span>
            <b>{formatMoney(spent, currency)}</b>
          </span>
          <span>
            <span className="muted small">= Left </span>
            <b className={left < 0 ? 'neg' : 'pos'}>{formatMoney(left, currency)}</b>
            <span className="muted small">{FREQS[view].short}</span>
          </span>
        </div>

        <div className="sheet-actions">
          <button className="btn danger sm" onClick={remove}>
            Remove person
          </button>
        </div>
      </div>
    </Modal>
    {cardSheet && cardsPath && <CardSheet path={cardsPath} personId={personId} card={cardSheet.card} onClose={() => setCardSheet(null)} />}
    {askGrab && (
      <Modal title="New income" onClose={() => setAskGrab(false)}>
        <div className="sheet ask-grab">
          <GrabBadge />
          <p>
            <b>Is this earning from Grab?</b>
          </p>
          <p className="muted small">If yes, it’s worked out for you from the Drive page: each month is the car-payment cycle (14th to 13th), net after petrol.</p>
          <div className="row-gap center">
            <button className="btn ghost" onClick={() => addIncome(false)}>
              No, another income
            </button>
            <button className="btn primary" onClick={() => addIncome(true)}>
              Yes, it’s Grab
            </button>
          </div>
        </div>
      </Modal>
    )}
    </>
  );
}

// A credit card: its name and the day its bill comes (the statement day).
function CardSheet({ path, personId, card, onClose }) {
  const [name, setName] = useState(card?.name || '');
  const [day, setDay] = useState(card?.day ? String(card.day) : '');
  const [error, setError] = useState('');
  const d = Math.round(Number(day));
  const valid = d >= 1 && d <= 28;
  const example = valid ? (() => {
    const y = new Date().getFullYear();
    const used = d === 1 ? `${y}-01-01` : `${y}-01-${String(d).padStart(2, '0')}`;
    const to = d === 1 ? '31 Jan' : `${d - 1} Feb`;
    return `Used ${d === 1 ? '1' : d} Jan – ${to} → bill on the ${ordinalDay(d)} of ${monthShort(billMonth(used, { day: d }))}, counted in ${monthShort(billMonth(used, { day: d }))}.`;
  })() : '';

  async function save(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Give the card a name, e.g. POSB.');
    if (!valid) return setError('The bill day must be 1 to 28.');
    const id = card?.id || newKey(path);
    await patchPath(`${path}/${id}`, { name: name.trim(), day: d, person: personId, order: card?.order || Date.now() });
    onClose();
  }
  async function remove() {
    if (!confirmTwice(`Remove the card “${card.name}”? Bills and spends paid with it go back to counting in their own month.`, `“${card.name}”`)) return;
    await setPath(`${path}/${card.id}`, null);
    onClose();
  }
  return (
    <Modal title={card ? 'Edit card' : 'Add a credit card'} onClose={onClose} dirty={name !== (card?.name || '') || day !== (card?.day ? String(card.day) : '')}>
      <form className="sheet drive-form" onSubmit={save}>
        <div className="drive-grid">
          <label className="field">
            <span>Card</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. POSB" autoFocus={!card} />
          </label>
          <label className="field">
            <span>Bill comes on the</span>
            <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} placeholder="15" />
          </label>
        </div>
        <p className="muted small">{example || 'POSB: 15 (used 15 Jan – 14 Feb, billed 15 Feb). HSBC: 1 (used in January, billed 1 Feb).'}</p>
        {error && <p className="error">{error}</p>}
        <div className="row-gap end">
          {card && (
            <button type="button" className="btn danger-outline sm" onClick={remove}>
              Remove
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save card</button>
        </div>
      </form>
    </Modal>
  );
}
