import { useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { newKey, patchPath, setPath } from '../../lib/db';
import { rideShareText } from '../../lib/drive';
import { parseAmount } from '../../lib/format';
import Modal from '../Modal';

const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
// The phone's share sheet when there is one; otherwise copy the text.
async function shareOrCopy(text) {
  if (canShare) {
    try {
      await navigator.share({ text });
      return '';
    } catch (e) {
      if (e?.name === 'AbortError') return '';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'Copied — paste it wherever you need it.';
  } catch {
    return 'Couldn’t copy. Select the text and copy it by hand.';
  }
}

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
  const [shareNote, setShareNote] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const hasAmount = parseAmount(form.amount) > 0;
  const text = rideShareText({ ...form, amount: parseAmount(form.amount), erp: parseAmount(form.erp) });

  async function save(e, thenShare = false) {
    e?.preventDefault();
    const amount = parseAmount(form.amount);
    if (!(amount > 0)) return setError('Type the ride amount.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError('Pick a date.');
    const time = /^\d{2}:\d{2}$/.test(form.time) ? form.time : '12:00';
    const erp = parseAmount(form.erp);
    const data = { date: form.date, time, dateTime: `${form.date}T${time}`, amount, erp: erp > 0 ? erp : null, note: form.note.trim() || null };
    const id = ride?.id || newKey(`${path}/rides`);
    await patchPath(`${path}/rides/${id}`, data);
    if (thenShare) {
      const msg = await shareOrCopy(text);
      if (msg && !canShare) window.alert(`Ride saved. ${msg}`);
    }
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
        {hasAmount && (
          <div className="ride-share">
            <p className="section-label">Share this ride</p>
            <div className="row-gap">
              {canShare && (
                <button type="button" className="btn glass sm" onClick={async () => setShareNote(await shareOrCopy(text))}>
                  📤 Share…
                </button>
              )}
              <a className="btn glass sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
              <a className="btn glass sm" href={`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                Telegram
              </a>
              <button
                type="button"
                className="btn glass sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    setShareNote('Copied.');
                  } catch {
                    setShareNote('Couldn’t copy on this device.');
                  }
                }}
              >
                Copy
              </button>
            </div>
            {shareNote && <p className="muted small">{shareNote}</p>}
          </div>
        )}
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
          <button type="button" className="btn glass" onClick={(e) => save(e, true)}>
            Save & share
          </button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
