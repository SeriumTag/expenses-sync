import { useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { newKey, patchPath, setPath } from '../../lib/db';
import { OTHER_CATEGORIES } from '../../lib/drive';
import { formatMoney, parseAmount } from '../../lib/format';
import Modal from '../Modal';

const TYPES = { petrol: 'Petrol', other: 'Other' };

// A petrol fill (split by where the money came from) or another car cost.
// Old imported day totals ('earn') can be edited here too.
export default function EntrySheet({ path, item, type: startType = 'petrol', date, currency, onClose }) {
  const [type, setType] = useState(item?.type || startType);
  const str = (v) => (v == null || v === '' ? '' : String(v));
  const [form, setForm] = useState(() => ({
    date: item?.date || date,
    amount: str(item?.amount),
    fromGrab: item ? str(item.fromGrab ?? (item.type === 'petrol' && item.fromSavings == null ? item.amount : '')) : '',
    fromSavings: str(item?.fromSavings),
    litres: str(item?.litres),
    odometer: str(item?.odometer),
    category: item?.category || OTHER_CATEGORIES[0],
    note: item?.note || '',
    jobs: str(item?.jobs),
  }));
  const [start] = useState(() => JSON.stringify(form)); // to tell if anything was typed
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const num = (v) => (v.trim() === '' ? null : parseAmount(v));
  const petrolTotal = (num(form.fromGrab) || 0) + (num(form.fromSavings) || 0);

  async function save(e) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError('Pick a date.');
    let data;
    if (type === 'petrol') {
      if (!(petrolTotal > 0)) return setError('Type how much came from the Grab wallet and/or savings.');
      data = { type, date: form.date, amount: petrolTotal, fromGrab: num(form.fromGrab) || 0, fromSavings: num(form.fromSavings) || 0, litres: num(form.litres), odometer: num(form.odometer), category: null, note: null, jobs: null };
    } else if (type === 'other') {
      const amount = num(form.amount);
      if (!(amount > 0)) return setError('Type the amount.');
      data = { type, date: form.date, amount, category: form.category, note: form.note.trim() || null, fromGrab: null, fromSavings: null, litres: null, odometer: null, jobs: null };
    } else {
      const amount = num(form.amount);
      if (!(amount > 0)) return setError('Type the amount.');
      data = { type, date: form.date, amount, jobs: num(form.jobs) };
    }
    const id = item?.id || newKey(`${path}/items`);
    await patchPath(`${path}/items/${id}`, data);
    onClose();
  }

  async function remove() {
    if (!confirmTwice(`Remove this ${TYPES[item.type]?.toLowerCase() || 'day total'} entry?`, 'this entry')) return;
    await setPath(`${path}/items/${item.id}`, null);
    onClose();
  }

  return (
    <Modal title={item ? 'Edit entry' : 'Add a car cost'} onClose={onClose} dirty={JSON.stringify(form) !== start}>
      <form className="sheet drive-form" onSubmit={save}>
        {type !== 'earn' && (
          <div className="seg" role="group" aria-label="Type">
            {Object.entries(TYPES).map(([k, label]) => (
              <button type="button" key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="drive-grid">
          <label className="field full">
            <span>Date</span>
            <input type="date" value={form.date} onChange={set('date')} />
          </label>
          {type === 'petrol' && (
            <>
              <label className="field">
                <span>From Grab wallet</span>
                <input inputMode="decimal" value={form.fromGrab} onChange={set('fromGrab')} placeholder="50.00" autoFocus={!item} />
              </label>
              <label className="field">
                <span>From savings</span>
                <input inputMode="decimal" value={form.fromSavings} onChange={set('fromSavings')} placeholder="0.00" />
              </label>
              <label className="field">
                <span>
                  Litres <span className="muted small">optional</span>
                </span>
                <input inputMode="decimal" value={form.litres} onChange={set('litres')} placeholder="32" />
              </label>
              <label className="field">
                <span>
                  Odometer km <span className="muted small">optional</span>
                </span>
                <input inputMode="numeric" value={form.odometer} onChange={set('odometer')} placeholder="134790" />
              </label>
              {petrolTotal > 0 && <p className="muted small full">Fill total {formatMoney(petrolTotal, currency)}</p>}
            </>
          )}
          {type === 'other' && (
            <>
              <label className="field">
                <span>Category</span>
                <select value={form.category} onChange={set('category')}>
                  {OTHER_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Amount</span>
                <input inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" autoFocus={!item} />
              </label>
              <label className="field full">
                <span>
                  Note <span className="muted small">optional</span>
                </span>
                <input value={form.note} onChange={set('note')} placeholder="e.g. EZ-Link top-up" />
              </label>
            </>
          )}
          {type === 'earn' && (
            <>
              <label className="field">
                <span>Day total (gross)</span>
                <input inputMode="decimal" value={form.amount} onChange={set('amount')} />
              </label>
              <label className="field">
                <span>Jobs</span>
                <input inputMode="numeric" value={form.jobs} onChange={set('jobs')} />
              </label>
            </>
          )}
        </div>
        {type === 'petrol' && <p className="muted small">Log the odometer (and litres) on each fill to see km per litre and what each tank earned.</p>}
        {error && <p className="error">{error}</p>}
        <div className="row-gap end">
          {item && (
            <button type="button" className="btn danger-outline sm" onClick={remove}>
              Remove
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
