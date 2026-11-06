import { useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { newKey, patchPath, setPath } from '../../lib/db';
import {
  DAY_LABELS,
  FLAT_DEFAULT,
  LESSON_KINDS,
  RATE_OUTSIDE,
  RATE_RELIEF,
  RELIEF_FIELDS,
  awayDatesBetween,
  blankBlock,
  blockFilled,
  dayKeyOf,
  estimateForDate,
  lessonDayRecord,
  lessonList,
  lessonPay,
  lessonsSummary,
  outsideLessonAmount,
  parseLessonDays,
  swimModeOf,
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

const MODES = { lessons: 'Lessons', normal: 'School total', flat: 'Flat rate', relief: 'Relief' };
const wd = (ds) => DAY_LABELS[dayKeyOf(ds)].slice(0, 3);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
export const lessonsLine = (s) => [plural(s.count, 'lesson', 'lessons'), `${plural(s.kids, 'kid', 'kids')}${s.absent ? ` (${s.absent} absent)` : ''}`, s.relief && `${s.relief} relief`, s.priv && `${s.priv} private`].filter(Boolean).join(' · ');
const blankLesson = () => ({ time: '', title: '', location: '', minutes: 0, kind: 'group', came: 0, absent: 0, kids: 1, slipPay: null });

// One day's lessons: kind and kids per lesson, pay worked out from the rules.
function LessonRows({ lessons, onChange }) {
  const upd = (i, patch) => onChange(lessons.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="lesson-rows">
      {lessons.map((l, i) => {
        const pay = lessonPay(l.kind, l.kids);
        const off = l.slipPay != null && Math.abs(l.slipPay - pay) >= 0.005;
        return (
          <div key={i} className={`lesson-row ${l.kind}`}>
            <input className="lr-name" value={`${l.time ? `${l.time} ` : ''}${l.title}`} onChange={(e) => upd(i, { time: '', title: e.target.value })} placeholder="Lesson, e.g. 3pm Kids Beginner" aria-label="Lesson" />
            <select value={l.kind} onChange={(e) => upd(i, { kind: e.target.value })} aria-label="Kind of lesson">
              {Object.entries(LESSON_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className="lr-kids" inputMode="numeric" value={l.kids || ''} onChange={(e) => upd(i, { kids: int(e.target.value) })} placeholder="0" aria-label="Kids" />
            <b className="lr-pay">{money(pay)}</b>
            <button type="button" className="icon-btn" aria-label="Remove lesson" onClick={() => onChange(lessons.filter((_, j) => j !== i))}>
              ✕
            </button>
            {(l.location || l.absent > 0 || off) && (
              <span className="lr-meta">
                {[l.location, l.minutes && `${l.minutes} min`, l.absent > 0 && `${l.came} came, ${l.absent} absent`].filter(Boolean).join(' · ')}
                {off && <span className="lr-warn"> ⚠ page says {money(l.slipPay)}</span>}
              </span>
            )}
          </div>
        );
      })}
      <button type="button" className="btn ghost sm" onClick={() => onChange([...lessons, blankLesson()])}>
        ＋ Add lesson
      </button>
    </div>
  );
}

// One swim day: lesson by lesson (paste from the booking page), or the older
// school total / flat / relief day, with outside lessons on top.
export function SwimDaySheet({ path, day, date, days = [], onSaved, onClose }) {
  const s = (v) => (v ? String(v) : '');
  const [form, setForm] = useState(() => ({
    date: day?.date || date || todayStr(),
    mode: day ? swimModeOf(day) : 'lessons',
    lessons: day ? lessonList(day) : [],
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
  const [paste, setPaste] = useState('');
  const [pasteNote, setPasteNote] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setMode = (mode) => setForm((f) => ({ ...f, mode, amount: mode === 'flat' && !f.amount ? String(FLAT_DEFAULT) : f.amount }));
  function onPaste(text) {
    setPaste(text);
    const parsed = parseLessonDays(text);
    if (!parsed.length) return setPasteNote(text.trim() ? 'Nothing readable yet — paste the day as it shows on the booking page, starting with its date line.' : '');
    const d = parsed[0];
    setForm((f) => ({ ...f, date: d.date, lessons: d.lessons }));
    setPasteNote([`Read ${wd(d.date)} ${shortD(d.date)}: ${plural(d.lessons.length, 'lesson', 'lessons')}, ${money(d.amount)}.`, parsed.length > 1 && `Only the first of ${parsed.length} days is used here — use 📋 Paste days for several.`, ...d.warnings.map((w) => `⚠ ${w}`)].filter(Boolean).join('\n'));
  }

  // The day as it would be saved, for the live breakdown.
  const isLessons = form.mode === 'lessons';
  const sum = lessonsSummary(form.lessons);
  const isNormal = form.mode === 'normal';
  const school = isLessons ? sum.total : form.mode === 'relief' ? int(form.heads) * RATE_RELIEF : form.amount === '' ? 0 : parseFloat(form.amount);
  // Another lessons entry on this date gets replaced, not doubled.
  const replaced = isLessons ? days.filter((d) => d.date === form.date && d.id !== day?.id && swimModeOf(d) === 'lessons') : [];
  const outside = int(form.outside);
  const discount = Math.min(Math.max(0, parseFloat(form.discount) || 0), outside * RATE_OUTSIDE);
  const preview = { amount: school, swimMode: form.mode, p1: isNormal ? int(form.p1) : 0, p2: isNormal ? int(form.p2) : 0, p3: isNormal ? int(form.p3) : 0, trials: isNormal ? int(form.trials) : 0, outside, outsideDiscount: discount };
  const students = schoolStudents(preview);
  const outsideAmt = outsideLessonAmount(preview);

  async function save(e) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError('Pick a date.');
    if (isLessons) {
      const lessons = form.lessons.filter((l) => l.kids > 0 || l.title.trim());
      if (!lessons.length) return setError('Paste the day from the booking page, or add a lesson.');
      if (lessons.some((l) => !(l.kids > 0))) return setError('Every lesson needs how many kids it was paid for.');
      const id = day?.id || newKey(`${path}/days`);
      const patch = { [id]: lessonDayRecord(form.date, lessons, { outside, outsideDiscount: discount }) };
      replaced.forEach((d) => (patch[d.id] = null));
      await patchPath(`${path}/days`, patch);
      onSaved?.(form.date);
      return onClose();
    }
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
          {isLessons ? null : form.mode === 'relief' ? (
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
        {isLessons && (
          <>
            <label className="field">
              <span>📋 Paste from the booking page</span>
              <textarea className="import-text" rows={paste ? 4 : 3} value={paste} onChange={(e) => onPaste(e.target.value)} placeholder={'Thu, 5 Nov\n3pm 1.1 Baby Foundation\n$24.00\nDowntown East · 30 min · Group · Level 3\n3 came · 3 × $8 per child'} autoFocus={!day} />
            </label>
            {pasteNote && <p className="muted small import-status">{pasteNote}</p>}
            <p className="section-label">Lessons · Group $8 a kid · Relief $10 a kid · Private $45</p>
            <LessonRows lessons={form.lessons} onChange={(lessons) => setForm((f) => ({ ...f, lessons }))} />
            {replaced.length > 0 && <p className="muted small">Replaces the {money(replaced.reduce((t, d) => t + (d.amount || 0), 0))} already logged as lessons for this day.</p>}
          </>
        )}
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
          {isLessons ? <span>{lessonsLine(sum)}</span> : students != null && <span>{students} school student{students === 1 ? '' : 's'}</span>}
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

// Paste one or more days from the booking page; each becomes a lessons day.
export function PasteDaysSheet({ path, days, onSaved, onClose }) {
  const [text, setText] = useState('');
  const [skip, setSkip] = useState(() => new Set());
  const [error, setError] = useState('');
  const parsed = parseLessonDays(text).filter((d) => d.lessons.length);
  const picked = parsed.filter((d) => !skip.has(d.date));
  const existing = (ds) => days.filter((d) => d.date === ds);
  const toggle = (ds) =>
    setSkip((s) => {
      const n = new Set(s);
      n.has(ds) ? n.delete(ds) : n.add(ds);
      return n;
    });

  async function save() {
    if (!picked.length) return setError('Nothing to save yet.');
    const manual = picked.filter((d) => existing(d.date).some((x) => swimModeOf(x) !== 'lessons'));
    if (manual.length && !window.confirm(`${manual.map((d) => shortD(d.date)).join(', ')} already ha${manual.length === 1 ? 's' : 've'} a swim day keyed in by hand. Add the pasted lessons as well?`)) return;
    const patch = {};
    for (const d of picked) {
      existing(d.date)
        .filter((x) => swimModeOf(x) === 'lessons')
        .forEach((x) => (patch[x.id] = null));
      patch[newKey(`${path}/days`)] = lessonDayRecord(d.date, d.lessons);
    }
    await patchPath(`${path}/days`, patch);
    onSaved?.(picked[0].date);
    onClose();
  }

  return (
    <Modal title="Paste days from the booking page" onClose={onClose} dirty={Boolean(text.trim())}>
      <div className="sheet drive-form">
        <p className="muted small">Copy one or more days from the booking page and paste them here. Each day is priced Group $8 a kid, Relief $10 a kid, Private $45.</p>
        <textarea className="import-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Thu, 5 Nov\n· $252.00\n· 9 lessons · 1 relief\n3pm 1.1 Baby Foundation\n$24.00\nDowntown East · 30 min · Group · Level 3\n3 came · 3 × $8 per child\n…'} autoFocus />
        {text.trim() && !parsed.length && <p className="muted small">Nothing readable yet — each day should start with its date line, like “Thu, 5 Nov”.</p>}
        {parsed.map((d) => {
          const had = existing(d.date);
          const hadLessons = had.filter((x) => swimModeOf(x) === 'lessons');
          const hadManual = had.filter((x) => swimModeOf(x) !== 'lessons');
          return (
            <label key={d.date} className={`paste-day ${skip.has(d.date) ? 'off' : ''}`}>
              <input type="checkbox" checked={!skip.has(d.date)} onChange={() => toggle(d.date)} />
              <span className="pd-main">
                <span className="pd-top">
                  <b>
                    {wd(d.date)} {shortD(d.date)} {d.date.slice(0, 4)}
                  </b>
                  <b className="pd-amt">{money(d.amount)}</b>
                </span>
                <span className="muted small">{lessonsLine({ count: d.lessons.length, kids: d.students, absent: d.absent, relief: d.relief, priv: d.priv })}</span>
                {hadLessons.length > 0 && <span className="small">Replaces the {money(hadLessons.reduce((t, x) => t + (x.amount || 0), 0))} pasted before</span>}
                {hadManual.length > 0 && <span className="small lr-warn">Already has {money(hadManual.reduce((t, x) => t + (x.amount || 0), 0))} keyed in by hand</span>}
                {d.warnings.map((w) => (
                  <span key={w} className="small lr-warn">
                    ⚠ {w}
                  </span>
                ))}
              </span>
            </label>
          );
        })}
        {picked.length > 1 && (
          <div className="swim-calc">
            <span>{plural(picked.length, 'day', 'days')}</span>
            <span>{plural(picked.reduce((t, d) => t + d.students, 0), 'kid', 'kids')}</span>
            <b>Total {money(picked.reduce((t, d) => t + d.amount, 0))}</b>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row-gap end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!picked.length} onClick={save}>
            {picked.length ? `Save ${plural(picked.length, 'day', 'days')}` : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
