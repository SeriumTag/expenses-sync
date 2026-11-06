import { useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { newKey, patchPath, setPath } from '../../lib/db';
import {
  DAY_LABELS,
  FLAT_DEFAULT,
  RATE_OUTSIDE,
  RATE_RELIEF,
  RELIEF_FIELDS,
  awayDatesBetween,
  blankBlock,
  blockFilled,
  dayKeyOf,
  estimateForDate,
  outsideLessonAmount,
  reliefCsv,
  reliefShareText,
  schoolStudents,
  teachesOnDate,
  todayStr,
} from '../../lib/swim';
import Modal from '../Modal';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortD = (s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
const money = (n) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;
const int = (v) => parseInt(v, 10) || 0;

const MODES = { normal: 'Normal', flat: 'Flat rate', relief: 'Relief' };

// One swim day: the school total (or a flat / relief day), private classes
// and trials taken out of it, and outside lessons on top.
export function SwimDaySheet({ path, day, date, onSaved, onClose }) {
  const s = (v) => (v ? String(v) : '');
  const [form, setForm] = useState(() => ({
    date: day?.date || date || todayStr(),
    mode: day?.swimMode || 'normal',
    amount: day ? s(day.amount) : '',
    p1: s(day?.p1),
    p2: s(day?.p2),
    p3: s(day?.p3),
    trials: s(day?.trials),
    heads: s(day?.reliefHeads),
    outside: s(day?.outside),
    discount: s(day?.outsideDiscount),
  }));
  const [start] = useState(() => JSON.stringify(form));
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setMode = (mode) => setForm((f) => ({ ...f, mode, amount: mode === 'flat' && !f.amount ? String(FLAT_DEFAULT) : f.amount }));

  // The day as it would be saved, for the live breakdown.
  const isNormal = form.mode === 'normal';
  const school = form.mode === 'relief' ? int(form.heads) * RATE_RELIEF : form.amount === '' ? 0 : parseFloat(form.amount);
  const outside = int(form.outside);
  const discount = Math.min(Math.max(0, parseFloat(form.discount) || 0), outside * RATE_OUTSIDE);
  const preview = { amount: school, swimMode: form.mode, p1: isNormal ? int(form.p1) : 0, p2: isNormal ? int(form.p2) : 0, p3: isNormal ? int(form.p3) : 0, trials: isNormal ? int(form.trials) : 0, outside, outsideDiscount: discount };
  const students = schoolStudents(preview);
  const outsideAmt = outsideLessonAmount(preview);

  async function save(e) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError('Pick a date.');
    if (form.mode === 'relief' && int(form.heads) <= 0) return setError('Enter how many heads you relieved.');
    if (form.mode === 'flat' && !(school > 0)) return setError('Enter the flat amount for the day.');
    if (Number.isNaN(school) || school < 0) return setError('Enter a valid school total, or leave it blank.');
    const privCount = preview.p1 + preview.p2 + preview.p3 + preview.trials;
    if (school <= 0 && outside <= 0 && privCount <= 0) return setError('Enter a school total, outside lessons, or a private/trial count.');
    await setPath(`${path}/days/${day?.id || newKey(`${path}/days`)}`, {
      ...preview,
      date: form.date,
      amount: Math.round(school * 100) / 100,
      reliefHeads: form.mode === 'relief' ? int(form.heads) : 0,
    });
    onSaved?.(form.date);
    onClose();
  }
  async function remove() {
    if (!confirmTwice(`Delete the swim day on ${shortD(day.date)}?`, 'this swim day')) return;
    await setPath(`${path}/days/${day.id}`, null);
    onClose();
  }

  return (
    <Modal title={day ? 'Edit swim day' : 'Log a swim day'} onClose={onClose} dirty={JSON.stringify(form) !== start}>
      <form className="sheet drive-form" onSubmit={save}>
        <div className="seg" role="group" aria-label="Kind of day">
          {Object.entries(MODES).map(([k, l]) => (
            <button type="button" key={k} className={form.mode === k ? 'on' : ''} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="drive-grid">
          <label className="field full">
            <span>Date</span>
            <input type="date" value={form.date} onChange={set('date')} />
          </label>
          {form.mode === 'relief' ? (
            <label className="field">
              <span>Heads (× {money(RATE_RELIEF)})</span>
              <input inputMode="numeric" value={form.heads} onChange={set('heads')} placeholder="6" autoFocus={!day} />
            </label>
          ) : (
            <label className="field">
              <span>{form.mode === 'flat' ? 'Flat amount' : 'School total'}</span>
              <input inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder={form.mode === 'flat' ? '40.00' : '184.00'} autoFocus={!day} />
            </label>
          )}
        </div>
        {isNormal && (
          <>
            <p className="section-label">Private & trial lessons · taken out of the school total</p>
            <div className="drive-grid four">
              {[
                ['p1', '×1'],
                ['p2', '×2'],
                ['p3', '×3'],
                ['trials', 'Trials'],
              ].map(([k, l]) => (
                <label key={k} className="field">
                  <span>{l}</span>
                  <input inputMode="numeric" value={form[k]} onChange={set(k)} placeholder="0" />
                </label>
              ))}
            </div>
            <p className="muted small">Students per private session (×1 / ×2 / ×3) and trials — the rest of the school total is school students.</p>
          </>
        )}
        <p className="section-label">Outside lessons · on top of the school total</p>
        <div className="drive-grid">
          <label className="field">
            <span>Students (× {money(RATE_OUTSIDE)})</span>
            <input inputMode="numeric" value={form.outside} onChange={set('outside')} placeholder="0" />
          </label>
          <label className="field">
            <span>
              Discount <span className="muted small">optional</span>
            </span>
            <input inputMode="decimal" value={form.discount} onChange={set('discount')} placeholder="0.00" />
          </label>
        </div>
        <div className="swim-calc">
          {students != null && <span>{students} school student{students === 1 ? '' : 's'}</span>}
          {outside > 0 && <span>Outside {money(outsideAmt)}</span>}
          <b>Day total {money((Number.isNaN(school) ? 0 : school) + outsideAmt)}</b>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row-gap end">
          {day && (
            <button type="button" className="btn danger-outline sm" onClick={remove}>
              Delete
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">{day ? 'Save changes' : 'Save swim day'}</button>
        </div>
      </form>
    </Modal>
  );
}

// Mark one or more days away, with what those days are usually worth.
export function AwaySheet({ path, days, away, classDays, onClose }) {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const dates = awayDatesBetween(from, to);
  const teaching = dates.filter((ds) => teachesOnDate(days, ds, classDays));
  const total = teaching.reduce((s, ds) => s + estimateForDate(days, ds).amount, 0);

  async function save(e) {
    e.preventDefault();
    if (!dates.length) return setStatus('Pick a date first.');
    const taken = new Set(away.map((a) => a.date));
    const patch = {};
    dates.forEach((ds) => {
      if (!taken.has(ds)) patch[`away/${newKey(`${path}/away`)}`] = { date: ds, reason: reason.trim(), blocks: [] };
    });
    const added = Object.keys(patch).length;
    if (added) await patchPath(path, patch);
    if (added) onClose();
    else setStatus('Those days were already marked away.');
  }

  return (
    <Modal title="Mark days away" onClose={onClose} dirty={Boolean(reason.trim())}>
      <form className="sheet drive-form" onSubmit={save}>
        <div className="drive-grid">
          <label className="field">
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (!to || to < e.target.value) setTo(e.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="field full">
            <span>
              Reason <span className="muted small">optional</span>
            </span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. MC, holiday" />
          </label>
        </div>
        {dates.length > 0 &&
          (teaching.length === 0 ? (
            <p className="muted small">Nothing usually taught on {dates.length === 1 ? 'that day' : 'those days'}, so no earnings are affected. {dates.length === 1 ? 'It' : 'They'} will still be marked away.</p>
          ) : (
            <div className="away-preview">
              <p className="section-label">What those days are usually worth</p>
              {teaching.map((ds) => {
                const est = estimateForDate(days, ds);
                return (
                  <div key={ds} className="ap-row">
                    <span>
                      {DAY_LABELS[dayKeyOf(ds)].slice(0, 3)} {shortD(ds)}
                      <br />
                      <span className="muted small">{est.basis}</span>
                    </span>
                    <b>{money(est.amount)}</b>
                  </div>
                );
              })}
              <div className="ap-row total">
                <b>
                  {teaching.length} teaching day{teaching.length === 1 ? '' : 's'}
                </b>
                <b className="swim-blue">{money(total)}</b>
              </div>
            </div>
          ))}
        {status && <p className="muted small">{status}</p>}
        <div className="row-gap end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Mark away</button>
        </div>
      </form>
    </Modal>
  );
}

// The relief handover for an away day, laid out like the Progression sheet,
// ready to send to whoever covers.
export function ReliefSheet({ path, entry, initialBlocks, onClose }) {
  const [blocks, setBlocks] = useState(initialBlocks);
  const [start] = useState(() => JSON.stringify(initialBlocks));
  const [status, setStatus] = useState('');
  const [savedBlocks, setSavedBlocks] = useState((entry.blocks || []).some(blockFilled) ? entry.blocks : null);
  const setField = (i, k, v) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const dirty = JSON.stringify(blocks) !== (savedBlocks ? JSON.stringify(savedBlocks) : start);
  const text = reliefShareText(entry.date, savedBlocks || blocks, shortD);

  async function save(e) {
    e.preventDefault();
    const clean = blocks.map((b) => ({ ...blankBlock(), ...b }));
    await patchPath(`${path}/away/${entry.id}`, { blocks: clean, noteUpdated: new Date().toISOString() });
    setSavedBlocks(clean);
    setStatus('Saved. Send it from the buttons below.');
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied. Paste it into Telegram.');
    } catch {
      setStatus('Couldn’t copy automatically — select the text below and copy it.');
    }
  }
  function csv() {
    const url = URL.createObjectURL(new Blob([`﻿${reliefCsv(entry.date, savedBlocks || blocks)}`], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Progression ${DAY_LABELS[dayKeyOf(entry.date)]} ${entry.date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus('Saved as a .csv laid out like the handover sheet.');
  }

  return (
    <Modal title={`Progression · ${DAY_LABELS[dayKeyOf(entry.date)].slice(0, 3)} ${shortD(entry.date)}`} onClose={onClose} dirty={dirty}>
      <form className="sheet drive-form" onSubmit={save}>
        <p className="muted small">{savedBlocks ? 'Your saved handover for this day. Update anything that’s changed, then send it again.' : 'One block per class. It starts from the last handover for the same weekday, if there is one.'}</p>
        {blocks.map((b, i) => (
          <div key={i} className="relief-block">
            <div className="rb-head">
              <b>Class {i + 1}</b>
              {blocks.length > 1 && (
                <button type="button" className="link-btn" onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
            {RELIEF_FIELDS.map((f) => (
              <label key={f.k} className="field">
                <span>{f.label}</span>
                {f.kind === 'input' ? <input value={b[f.k] || ''} onChange={(e) => setField(i, f.k, e.target.value)} placeholder={f.ph} /> : <textarea rows={2} value={b[f.k] || ''} onChange={(e) => setField(i, f.k, e.target.value)} placeholder={f.ph} />}
              </label>
            ))}
          </div>
        ))}
        <button type="button" className="btn glass sm" onClick={() => setBlocks((bs) => [...bs, blankBlock()])}>
          ＋ Add a class
        </button>
        {savedBlocks && (
          <div className="relief-share">
            <p className="section-label">Send to whoever is covering</p>
            <div className="row-gap">
              <a className="btn primary sm" href={`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                Telegram
              </a>
              <button type="button" className="btn glass sm" onClick={copy}>
                Copy
              </button>
              <button type="button" className="btn glass sm" onClick={csv}>
                Excel (.csv)
              </button>
              {navigator.share && (
                <button type="button" className="btn glass sm" onClick={() => navigator.share({ text }).catch(() => {})}>
                  Share
                </button>
              )}
            </div>
            <pre className="relief-preview">{text}</pre>
          </div>
        )}
        {status && <p className="muted small">{status}</p>}
        <div className="row-gap end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn primary">Save note</button>
        </div>
      </form>
    </Modal>
  );
}
