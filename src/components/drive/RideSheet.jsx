import { useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { newKey, patchPath, setPath } from '../../lib/db';
import { parseAmount } from '../../lib/format';
import Modal from '../Modal';

const nowTime = () => new Date().toTimeString().slice(0, 5);

// One Grab ride: just the amount (time and date default to now), plus ERP and a note.
export default function RideSheet({ path, ride, date, onClose }) {
  const [form, setForm] = useState(() => ({
    date: ride?.date || date,
    time: ride?.time || nowTime(),
    amount: ride?.amount != null ? String(ride.amount) : '',
    erp: ride?.erp ? String(ride.erp) : '',
    note: ride?.note || '',
  }));
  const [start] = useState(() => JSON.stringify(form)); // to tell if anything was typed
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!(amount > 0)) return setError('Type the ride amount.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError('Pick a date.');
    const time = /^\d{2}:\d{2}$/.test(form.time) ? form.time : '12:00';
    const erp = parseAmount(form.erp);
    const data = { date: form.date, time, dateTime: `${form.date}T${time}`, amount, erp: erp > 0 ? erp : null, note: form.note.trim() || null };
    const id = ride?.id || newKey(`${path}/rides`);
    await patchPath(`${path}/rides/${id}`, data);
    onClose();
  }

  async function remove() {
    if (!confirmTwice(`Remove this ride (${form.amount})?`, 'this ride')) return;
    await setPath(`${path}/rides/${ride.id}`, null);
    onClose();
  }

  return (
    <Modal title={ride ? 'Edit ride' : '🚗 Grab ride'} onClose={onClose} dirty={JSON.stringify(form) !== start}>
      <form className="sheet drive-form" onSubmit={save}>
        <p className="muted small">Just the ride amount — nothing else needed.</p>
        <div className="drive-grid">
          <label className="field">
            <span>Date</span>
            <input type="date" value={form.date} onChange={set('date')} />
          </label>
          <label className="field">
            <span>Time</span>
            <input type="time" value={form.time} onChange={set('time')} />
          </label>
          <label className="field">
            <span>Amount</span>
            <input inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="16.20" autoFocus={!ride} />
          </label>
          <label className="field">
            <span>
              ERP <span className="muted small">optional</span>
            </span>
            <input inputMode="decimal" value={form.erp} onChange={set('erp')} placeholder="0.00" />
          </label>
          <label className="field full">
            <span>
              Note <span className="muted small">optional</span>
            </span>
            <input value={form.note} onChange={set('note')} placeholder="e.g. airport trip" />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row-gap end">
          {ride && (
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
