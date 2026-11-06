import { useEffect, useState } from 'react';
import {
  DAY_LABELS,
  DAY_ORDER,
  RANK_LABELS,
  cancelToday,
  classLabel,
  classesForDay,
  creditsOf,
  deleteClass,
  fullD,
  hallEntries,
  lessonsOf,
  markReminder,
  processDue,
  quitStudents,
  remindersDue,
  setCredits,
  shortD,
  todayKey,
  todayStr,
} from '../../lib/classes';
import { mutateClasses } from '../../lib/classesDb';
import { confirmTwice } from '../../lib/confirm';
import { prefs } from '../../lib/session';
import { swimDayTotal } from '../../lib/swim';
import { ClassBlock } from './ClassParts';
import { ClassSheet, HallSheet, ImportClassesSheet, LessonsLeftSheet, SkillsSheet, StudentSheet } from './ClassSheets';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The Classes half of the Swim page: the weekly schedule by day or calendar,
// Student Quit and the Hall of Swimming. Lesson credits are used up as each
// lesson ends (checked when this opens, and every minute while it's open).
export default function ClassesView({ path, m, swimDays, onSwimDay }) {
  const [mode, setModeState] = useState(() => prefs.get('classMode') || 'days');
  const setMode = (v) => {
    setModeState(v);
    prefs.set('classMode', v);
  };
  const [day, setDay] = useState(todayKey);
  const [closed, setClosed] = useState(() => new Set()); // classes folded on this day
  const [sheet, setSheet] = useState(null); // { kind, ... }
  const now = new Date();
  const [cal, setCal] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selDate, setSelDate] = useState(null);
  const hasClasses = lessonsOf(m).length > 0;

  // Charge finished lessons (a transaction, so two phones never double-charge).
  useEffect(() => {
    if (!hasClasses) return undefined;
    const run = () => mutateClasses(path, (x) => processDue(x)).catch(() => {});
    run();
    const t = setInterval(run, 60000);
    return () => clearInterval(t);
  }, [path, hasClasses]);

  const due = remindersDue(m);
  const toggle = (id) =>
    setClosed((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const blocks = (list) =>
    list.map((c) => (
      <ClassBlock
        key={c.id}
        m={m}
        cls={c}
        open={!closed.has(c.id)}
        onToggle={() => toggle(c.id)}
        onStudent={(name) => setSheet({ kind: 'student', name, cls: c })}
        onEdit={() => setSheet({ kind: 'class', cls: c })}
        onSkills={() => setSheet({ kind: 'skills', cls: c })}
        onDelete={() => confirmTwice(`Delete ${classLabel(c)} and its whole roster?`, 'this class') && mutateClasses(path, (x) => deleteClass(x, c.id))}
        onCancelToday={() => window.confirm('Cancel today’s lesson for this class? No one is charged a credit for it.') && mutateClasses(path, (x) => cancelToday(x, c.id))}
      />
    ));
  const dayTotal = (d) => {
    const list = classesForDay(m, d);
    const n = list.reduce((s, c) => s + c.students.length, 0);
    return list.length ? `${n} student${n === 1 ? '' : 's'} across ${list.length} class${list.length === 1 ? '' : 'es'}` : 'No classes';
  };

  return (
    <div className="classes-view">
      <div className="seg" role="tablist" aria-label="Classes view">
        {[
          ['days', 'Days'],
          ['calendar', 'Calendar'],
          ['quit', 'Quit'],
          ['hall', 'Hall'],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
            {l}
          </button>
        ))}
      </div>

      {due.length > 0 && (
        <section className="home-card review-card">
          <h2>Monthly review</h2>
          {due.map((r) => (
            <div key={r.key} className="review-row">
              <button
                className="link-btn"
                onClick={() => {
                  setMode('days');
                  setDay(r.day);
                }}
              >
                <span className="red-bang">!</span> Update {r.label} students & credits
              </button>
              <button className="btn ghost sm" onClick={() => mutateClasses(path, (x) => markReminder(x, r.key))}>
                Mark reviewed
              </button>
            </div>
          ))}
        </section>
      )}

      {mode === 'days' && (
        <>
          <div className="seg day-seg" role="tablist" aria-label="Day">
            {DAY_ORDER.map((d) => (
              <button
                key={d}
                role="tab"
                aria-selected={day === d}
                className={day === d ? 'on' : ''}
                onClick={() => {
                  setDay(d);
                  setClosed(new Set());
                }}
              >
                {DAY_LABELS[d].slice(0, 3)}
              </button>
            ))}
          </div>
          <div className="row-gap">
            <button className="btn primary sm" onClick={() => setSheet({ kind: 'class', day })}>
              ＋ Add class
            </button>
            <button className="btn glass sm" onClick={() => setSheet({ kind: 'import' })}>
              📋 Import
            </button>
            <button className="btn glass sm" onClick={() => setSheet({ kind: 'left' })}>
              ⏳ Lessons left
            </button>
          </div>
          <section className="home-card">
            <p className="day-total">
              <b>{DAY_LABELS[day]}</b> · {dayTotal(day)}
            </p>
            {classesForDay(m, day).length ? blocks(classesForDay(m, day)) : <p className="muted small">No classes set for {DAY_LABELS[day]} yet. Tap ＋ Add class to set one up.</p>}
          </section>
        </>
      )}

      {mode === 'calendar' && (
        <section className="home-card">
          <div className="home-card-head">
            <button className="btn ghost sm" onClick={() => setCal(({ y, m: mo }) => (mo === 0 ? { y: y - 1, m: 11 } : { y, m: mo - 1 }))} aria-label="Previous month">
              ‹
            </button>
            <b>
              {MONTHS[cal.m]} {cal.y}
            </b>
            <button className="btn ghost sm" onClick={() => setCal(({ y, m: mo }) => (mo === 11 ? { y: y + 1, m: 0 } : { y, m: mo + 1 }))} aria-label="Next month">
              ›
            </button>
          </div>
          <CalendarGrid m={m} y={cal.y} mo={cal.m} swimDays={swimDays} sel={selDate} onSel={(d) => setSelDate(selDate === d ? null : d)} />
          <div className="cal-legend muted small">
            <span>
              <i className="lesson" /> Class scheduled
            </span>
            <span>
              <i className="s" /> Swim logged
            </span>
          </div>
          {selDate ? (
            <div className="day-report">
              <b>{new Date(`${selDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</b>
              {swimDays
                .filter((d) => d.date === selDate)
                .map((d) => (
                  <button key={d.id} className="history-row swim-day-row" onClick={() => onSwimDay({ day: d })}>
                    <span className="hr-v">Swim day logged</span>
                    <b>${swimDayTotal(d).toFixed(2)}</b>
                    <span className="rr-e">✎</span>
                  </button>
                ))}
              <p className="day-total">{dayTotal(DAY_ORDER[(new Date(`${selDate}T00:00:00`).getDay() + 6) % 7])}</p>
              {blocks(classesForDay(m, DAY_ORDER[(new Date(`${selDate}T00:00:00`).getDay() + 6) % 7]))}
            </div>
          ) : (
            <p className="muted small center-text">Tap a date to see that day’s classes.</p>
          )}
        </section>
      )}

      {mode === 'quit' && (
        <section className="home-card">
          <p className="muted small">Students who’ve used up their credits — never deleted, their history stays.</p>
          {!quitStudents(m).length && <p className="muted small">No one in Student Quit right now.</p>}
          {quitStudents(m).map((s) => (
            <div key={s.name} className="quit-row">
              <div className="qr-top">
                <b>{s.name}</b>
                <span className="credit-pill low">{creditsOf(m, s.name) ?? 0} credits</span>
              </div>
              <span className="muted small">
                Last class: {s.lifecycle?.lastClassLabel || '—'} · Last attended: {s.lifecycle?.lastAttended ? shortD(s.lifecycle.lastAttended) : '—'}
              </span>
              <button
                className="btn glass sm"
                onClick={() => {
                  const raw = window.prompt(`New credit balance for ${s.name}? (Above 0 reactivates them; add them to a class afterwards with Existing student.)`, '5');
                  const n = parseInt(raw, 10);
                  if (raw != null && n > 0) mutateClasses(path, (x) => setCredits(x, s.name, n));
                }}
              >
                Reactivate…
              </button>
            </div>
          ))}
        </section>
      )}

      {mode === 'hall' && (
        <section className="home-card">
          <p className="muted small">Bronze, Silver & Gold — from each student’s Swimming Achievement, plus anyone added here directly.</p>
          <button className="btn glass sm" onClick={() => setSheet({ kind: 'hall' })}>
            ＋ Add student
          </button>
          {!hallEntries(m).length && <p className="muted small">No achievements yet.</p>}
          <div className="hall-grid">
            {hallEntries(m).map((e) => (
              <button key={e.name} className={`hall-card ${e.rank}`} onClick={() => setSheet({ kind: 'hall', name: e.name })}>
                <b>{e.name}</b>
                <span>{RANK_LABELS[e.rank]}</span>
                <span className="small">Achieved {fullD(e.dateKnown)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {sheet?.kind === 'class' && <ClassSheet path={path} m={m} cls={sheet.cls} day={sheet.day} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'student' && <StudentSheet path={path} m={m} name={sheet.name} cls={lessonsOf(m).find((c) => c.id === sheet.cls.id) || sheet.cls} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'skills' && <SkillsSheet path={path} type={sheet.cls.type} title="Skills · whole class" sub={classLabel(sheet.cls)} skills={sheet.cls.skills} target={{ classId: sheet.cls.id }} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'hall' && <HallSheet path={path} m={m} name={sheet.name} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'left' && <LessonsLeftSheet m={m} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'import' && <ImportClassesSheet path={path} m={m} day={day} onClose={() => setSheet(null)} />}
    </div>
  );
}

function CalendarGrid({ m, y, mo, swimDays, sel, onSel }) {
  const first = new Date(y, mo, 1).getDay();
  const n = new Date(y, mo + 1, 0).getDate();
  const t = todayStr();
  const logged = new Set(swimDays.map((d) => d.date));
  return (
    <div className="cal-grid">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
        <span key={i} className="cal-dow">
          {d}
        </span>
      ))}
      {Array.from({ length: first }, (_, i) => (
        <span key={`b${i}`} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
        const dk = DAY_ORDER[(new Date(y, mo, i + 1).getDay() + 6) % 7];
        return (
          <button key={ds} className={`cal-cell ${ds === t ? 'today' : ''} ${ds === sel ? 'sel' : ''}`} onClick={() => onSel(ds)}>
            <span className="dnum">{i + 1}</span>
            <span className="cal-dots">
              {classesForDay(m, dk).length > 0 && <i className="lesson" />}
              {logged.has(ds) && <i className="s" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
