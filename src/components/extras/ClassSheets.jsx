import { useState } from 'react';
import {
  DAY_LABELS,
  DAY_ORDER,
  DEFAULT_CREDITS,
  LEVEL_LABELS,
  RANK_LABELS,
  RANK_ORDER,
  TYPE_LABELS,
  addExistingStudent,
  addNewStudent,
  allStudentNames,
  applySchedule,
  applyStudentList,
  capacity,
  classDuration,
  classLabel,
  classesWithStudent,
  countClass,
  creditsOf,
  deleteClass,
  doneSet,
  effectiveSkills,
  fullD,
  latestPerCategory,
  lessonsLeft,
  lessonsOf,
  levelsFor,
  parseSchedule,
  parseStudentList,
  removeFromClass,
  renameStudent,
  saveClass,
  setAchievement,
  setCredits,
  setHallEntry,
  setSkills,
  shortD,
  skillSetFor,
  studentOf,
  timeLabel,
  todayKey,
  transferStudent,
  weeksSince,
  withCategoryDates,
} from '../../lib/classes';
import { confirmTwice } from '../../lib/confirm';
import { mutateClasses } from '../../lib/classesDb';
import Modal from '../Modal';
import { RosterRows } from './ClassParts';

const sortClasses = (list) => [...list].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.time.localeCompare(b.time));

// Add or edit a class; when editing, its roster too.
export function ClassSheet({ path, m, cls, day, onClose }) {
  const [form, setForm] = useState(() => ({ day: cls?.day || day || todayKey(), time: cls?.time || '16:00', duration: String(cls ? classDuration(cls) : 60), type: cls?.type || 'baby', level: cls?.level || 'foundation' }));
  const [start] = useState(() => JSON.stringify(form));
  const [mode, setMode] = useState('new'); // add a 'new' or an 'existing' student
  const [newName, setNewName] = useState('');
  const [pick, setPick] = useState('');
  const [pickCredits, setPickCredits] = useState('');
  const [status, setStatus] = useState('');
  const [student, setStudent] = useState(null);
  const [dup, setDup] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setType = (type) => setForm((f) => ({ ...f, type, level: levelsFor(type).includes(f.level) ? f.level : 'foundation' }));

  const live = cls ? lessonsOf(m).find((c) => c.id === cls.id) : null;
  const roster = live ? live.students : [];
  const cap = capacity(form.type, form.level);
  const [h, mi] = (form.time || '16:00').split(':').map(Number);
  const endMin = (h * 60 + mi + (parseInt(form.duration, 10) || 60)) % 1440;
  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  const others = allStudentNames(m).filter((n) => !roster.some((r) => r.toLowerCase() === n.toLowerCase()));
  const fields = () => ({ day: form.day, time: form.time || '16:00', duration: parseInt(form.duration, 10) > 0 ? parseInt(form.duration, 10) : 60, type: form.type, level: form.level });

  // Adds whatever student is typed / picked. Returns false if it couldn't.
  async function addPending() {
    if (!live) return true;
    if (mode === 'new') {
      const name = newName.trim();
      if (!name) return true;
      if (roster.length >= cap) return setStatus(`Class is full (${roster.length}/${cap}) — “${name}” wasn’t added.`), false;
      if (allStudentNames(m).some((n) => n.toLowerCase() === name.toLowerCase())) return setStatus(`“${name}” is already a student — switch to Existing student to add them here.`), false;
      await mutateClasses(path, (x) => addNewStudent(x, live.id, name));
      setNewName('');
      return true;
    }
    const name = pick || others[0];
    if (!name) return true;
    if (roster.length >= cap) return setStatus(`Class is full (${roster.length}/${cap}) — “${name}” wasn’t added.`), false;
    const credits = pickCredits === '' ? (creditsOf(m, name) ?? DEFAULT_CREDITS) : parseInt(pickCredits, 10);
    if (Number.isNaN(credits) || credits < 0) return setStatus('Enter a whole number of credits (0 or more).'), false;
    const elsewhere = classesWithStudent(m, name, live.id);
    if (elsewhere.length) {
      // A student belongs to one class: ask which (or whether it's someone else with the same name).
      setDup({
        name,
        involved: [live.id, ...elsewhere.map((c) => c.id)],
        target: live.id,
        onDifferent: () => mutateClasses(path, (x) => addExistingStudent(x, live.id, name, credits, null)).then(() => setStatus('Added — kept as a separate student on their other class too.')),
        onKeep: (keep) => mutateClasses(path, (x) => addExistingStudent(x, live.id, name, credits, keep)).then(() => setStatus(keep === live.id ? 'Moved here from their other class.' : 'Kept on their other class — not added here.')),
      });
      return 'pending';
    }
    await mutateClasses(path, (x) => addExistingStudent(x, live.id, name, credits));
    setPick('');
    setPickCredits('');
    return true;
  }

  async function save(e) {
    e.preventDefault();
    const id = cls?.id || `lesson-${Date.now()}`;
    await mutateClasses(path, (x) => saveClass(x, id, fields()));
    const added = await addPending(); // typing a name then Save also adds them
    if (added === true) onClose();
  }
  async function remove() {
    if (!confirmTwice(`Delete ${classLabel(live)} and its whole roster?`, 'this class')) return;
    await mutateClasses(path, (x) => deleteClass(x, live.id));
    onClose();
  }

  return (
    <Modal title={cls ? 'Edit class' : 'Add class'} onClose={onClose} dirty={JSON.stringify(form) !== start || Boolean(newName.trim())}>
      <form className="sheet drive-form" onSubmit={save}>
        <div className="drive-grid">
          <label className="field">
            <span>Day</span>
            <select value={form.day} onChange={set('day')}>
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Time</span>
            <input type="time" value={form.time} onChange={set('time')} />
          </label>
          <label className="field">
            <span>Minutes</span>
            <input inputMode="numeric" value={form.duration} onChange={set('duration')} />
          </label>
          <label className="field">
            <span>Level</span>
            <select value={form.level} onChange={set('level')}>
              {levelsFor(form.type).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="seg" role="group" aria-label="Class type">
          {Object.entries(TYPE_LABELS).map(([k, l]) => (
            <button type="button" key={k} className={form.type === k ? 'on' : ''} onClick={() => setType(k)}>
              {l}
            </button>
          ))}
        </div>
        <p className="class-preview">
          {DAY_LABELS[form.day]} {timeLabel(form.time)}–{timeLabel(endTime)} · {TYPE_LABELS[form.type]} {LEVEL_LABELS[form.level]}
          <span className="muted small"> · up to {cap} students, every week</span>
        </p>

        {live && (
          <div className="class-roster">
            <div className="home-card-head">
              <h3>Students</h3>
              <span className={`lesson-count ${countClass(roster.length, cap)}`}>
                {roster.length}/{cap}
              </span>
            </div>
            <RosterRows m={m} cls={live} onOpen={(name) => setStudent(name)} />
            <div className="seg small-seg" role="group" aria-label="Add a student">
              {[
                ['new', 'New student'],
                ['existing', 'Existing student'],
              ].map(([k, l]) => (
                <button type="button" key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                  {l}
                </button>
              ))}
            </div>
            {mode === 'new' ? (
              <label className="field">
                <span>Name ({DEFAULT_CREDITS} credits to start)</span>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Kyler" />
              </label>
            ) : others.length ? (
              <div className="drive-grid">
                <label className="field">
                  <span>Student</span>
                  <select
                    value={pick || others[0]}
                    onChange={(e) => {
                      setPick(e.target.value);
                      setPickCredits(String(creditsOf(m, e.target.value) ?? ''));
                    }}
                  >
                    {others.map((n) => (
                      <option key={n} value={n}>
                        {n} ({creditsOf(m, n) ?? '—'} left)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Credits</span>
                  <input inputMode="numeric" value={pickCredits} onChange={(e) => setPickCredits(e.target.value)} placeholder={String(creditsOf(m, pick || others[0]) ?? DEFAULT_CREDITS)} />
                </label>
              </div>
            ) : (
              <p className="muted small">No other students yet.</p>
            )}
            <button type="button" className="btn glass sm" disabled={roster.length >= cap} onClick={addPending}>
              ＋ Add student
            </button>
          </div>
        )}
        {status && <p className="muted small">{status}</p>}
        <div className="row-gap end">
          {live && (
            <button type="button" className="btn danger-outline sm" onClick={remove}>
              Delete
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">{cls ? 'Save changes' : 'Save class'}</button>
        </div>
      </form>
      {student && live && <StudentSheet path={path} m={m} name={student} cls={live} onClose={() => setStudent(null)} />}
      {dup && <DupSheet m={m} {...dup} onClose={() => setDup(null)} />}
    </Modal>
  );
}

// One student: name, credits, achievement, skills, move to another class, or take off this one.
export function StudentSheet({ path, m, name, cls, onClose }) {
  const rec = studentOf(m, name);
  const [form, setForm] = useState({ name, credits: String(creditsOf(m, name) ?? DEFAULT_CREDITS), rank: rec?.achievement?.rank || '' });
  const [start] = useState(() => JSON.stringify(form));
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [skills, setSkillsOpen] = useState(false);
  const [dup, setDup] = useState(null);
  const otherClasses = sortClasses(lessonsOf(m).filter((c) => c.id !== cls.id));

  async function finish(finalName, credits) {
    await mutateClasses(path, (x) => {
      setCredits(x, finalName, credits);
      setAchievement(x, finalName, form.rank);
    });
  }
  async function save(e) {
    e.preventDefault();
    const newName = form.name.trim();
    const credits = parseInt(form.credits, 10);
    if (!newName) return setStatus('Name can’t be empty.');
    if (Number.isNaN(credits) || credits < 0) return setStatus('Enter a whole number of credits (0 or more).');
    if (newName.toLowerCase() !== name.toLowerCase()) {
      const elsewhere = classesWithStudent(m, newName, cls.id);
      if (elsewhere.length) {
        // Renaming into a name already on another roster: the same student, or two people?
        return setDup({
          name: newName,
          involved: [cls.id, ...elsewhere.map((c) => c.id)],
          target: cls.id,
          onDifferent: async () => {
            await finish(name, credits);
            setStatus(`Kept as a separate student — the name wasn’t changed, since “${newName}” already belongs to someone else.`);
          },
          onKeep: async (keep) => {
            await mutateClasses(path, (x) => {
              renameStudent(x, name, newName, true);
              for (const c of classesWithStudent(x, newName)) if (c.id !== keep) removeFromClass(x, c.id, newName);
              setCredits(x, newName, credits);
              setAchievement(x, newName, form.rank);
            });
            onClose();
          },
        });
      }
      if (allStudentNames(m).some((n) => n.toLowerCase() === newName.toLowerCase())) return setStatus(`“${newName}” is already a different student’s name — pick another.`);
      await mutateClasses(path, (x) => renameStudent(x, name, newName));
    }
    await finish(newName, credits);
    onClose();
  }
  async function transfer() {
    const toCls = otherClasses.find((c) => c.id === (to || otherClasses[0]?.id));
    if (!toCls) return setStatus('Pick a class to move to first.');
    if (toCls.students.some((n) => n.toLowerCase() === name.toLowerCase()))
      return setDup({
        name,
        involved: [cls.id, toCls.id],
        target: toCls.id,
        onDifferent: () => setStatus(`Left as is — “${name}” there is a different student.`),
        onKeep: (keep) => mutateClasses(path, (x) => transferStudent(x, cls.id, toCls.id, name, keep)).then(onClose),
      });
    if ((toCls.level !== cls.level || toCls.type !== cls.type) && !window.confirm(`This moves ${name} from ${TYPE_LABELS[cls.type]} ${LEVEL_LABELS[cls.level]} to ${TYPE_LABELS[toCls.type]} ${LEVEL_LABELS[toCls.level]}. Continue?`)) return;
    await mutateClasses(path, (x) => transferStudent(x, cls.id, toCls.id, name));
    onClose();
  }
  async function remove() {
    if (!confirmTwice(`Take ${name} off this class? Their credits and skills stay on record.`, name)) return;
    await mutateClasses(path, (x) => removeFromClass(x, cls.id, name));
    onClose();
  }

  return (
    <Modal title={name} onClose={onClose} dirty={JSON.stringify(form) !== start}>
      <form className="sheet drive-form" onSubmit={save}>
        <p className="muted small">{classLabel(cls)}</p>
        <div className="drive-grid">
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Credits left</span>
            <input inputMode="numeric" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
          </label>
        </div>
        <p className="section-label">Swimming achievement</p>
        <div className="seg" role="group" aria-label="Swimming achievement">
          {['', ...RANK_ORDER].map((r) => (
            <button type="button" key={r || 'none'} className={form.rank === r ? 'on' : ''} onClick={() => setForm({ ...form, rank: r })}>
              {r ? RANK_LABELS[r] : 'None'}
            </button>
          ))}
        </div>
        {rec?.achievement?.rank && form.rank && <p className="muted small">Known since {fullD(rec.achievement.dateKnown)} · in the Hall of Swimming.</p>}
        <button type="button" className="btn glass sm" onClick={() => setSkillsOpen(true)}>
          Skills {rec?.skills ? '(tracked individually)' : '(following the class)'}
        </button>
        <p className="section-label">Move to another class</p>
        {otherClasses.length ? (
          <div className="row-gap transfer-row">
            <select value={to || otherClasses[0].id} onChange={(e) => setTo(e.target.value)} aria-label="Class to move to">
              {otherClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)} ({c.students.length}/{capacity(c.type, c.level)})
                </option>
              ))}
            </select>
            <button type="button" className="btn glass sm" onClick={transfer}>
              Move
            </button>
          </div>
        ) : (
          <p className="muted small">No other classes yet.</p>
        )}
        {status && <p className="muted small">{status}</p>}
        <div className="row-gap end">
          <button type="button" className="btn danger-outline sm" onClick={remove}>
            Remove
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save</button>
        </div>
      </form>
      {skills && (
        <SkillsSheet
          path={path}
          type={cls.type}
          title={`Skills · ${name}`}
          sub={rec?.skills ? 'Tracked individually' : 'Following the class for now — saving tracks them individually'}
          skills={effectiveSkills(m, name, cls)}
          target={{ name }}
          onClose={() => setSkillsOpen(false)}
        />
      )}
      {dup && <DupSheet m={m} {...dup} onClose={() => setDup(null)} />}
    </Modal>
  );
}

// The curriculum for a class (or one student): tick what's done, with the aid used per skill.
export function SkillsSheet({ path, type, title, sub, skills, target, onClose }) {
  const set = skillSetFor(type);
  const [done, setDone] = useState(() => doneSet(skills, type));
  const [equip, setEquip] = useState(() => ({ ...(skills?.equipment || {}) }));
  const [start] = useState(() => JSON.stringify([[...doneSet(skills, type)].sort(), skills?.equipment || {}]));
  const dates = skills?.categoryDates || {};
  const latest = latestPerCategory(skills, type);
  const toggle = (i) =>
    setDone((d) => {
      const n = new Set(d);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  const dirty = JSON.stringify([[...done].sort(), Object.fromEntries(Object.entries(equip).filter(([, v]) => v))]) !== start;

  async function save(e) {
    e.preventDefault();
    const equipment = Object.fromEntries(Object.entries(equip).filter(([, v]) => v));
    const next = withCategoryDates({ sequence: [...done].sort((a, b) => a - b), equipment }, skills, type);
    await mutateClasses(path, (x) => setSkills(x, target, next));
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose} dirty={dirty}>
      <form className="sheet drive-form" onSubmit={save}>
        <p className="muted small">
          {sub} · <b>{done.size}</b>/{set.sequence.length} done
        </p>
        {set.categories.map((cat, ci) => {
          const idxs = Array.from({ length: cat.end - cat.start + 1 }, (_, k) => cat.start + k);
          const t = latest.find((l) => l.catIndex === ci);
          const weeks = dates[ci] ? weeksSince(dates[ci]) : null;
          return (
            <div key={cat.name} className="skill-cat">
              <p className="skill-cat-title">
                {cat.name} <span className="muted small">{idxs.filter((i) => done.has(i)).length}/{idxs.length}</span>
              </p>
              {t && weeks != null && (
                <p className={`muted small ${weeks >= 5 ? 'neg' : ''}`}>
                  {weeks} wk{weeks === 1 ? '' : 's'} on {t.label} · since {shortD(dates[ci])}
                  {weeks >= 5 ? ' 🔴' : ''}
                </p>
              )}
              {idxs.map((i) => (
                <div key={i} className={`skill-row ${done.has(i) ? 'done' : ''}`}>
                  <label>
                    <input type="checkbox" checked={done.has(i)} onChange={() => toggle(i)} />
                    <span>{set.sequence[i]}</span>
                  </label>
                  {set.options && (
                    <select value={equip[i] || ''} onChange={(e) => setEquip({ ...equip, [i]: e.target.value })} aria-label={`Aid for ${set.sequence[i]}`}>
                      <option value="">—</option>
                      {set.options.map((o) => (
                        <option key={o.val} value={o.val}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        <div className="row-gap end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save skills</button>
        </div>
      </form>
    </Modal>
  );
}

// A name about to sit on two rosters: which class is right, or are they two different people?
export function DupSheet({ m, name, involved, target, onDifferent, onKeep, onClose }) {
  const classes = involved.map((id) => lessonsOf(m).find((c) => c.id === id)).filter(Boolean);
  const [pick, setPick] = useState(classes[0]?.id);
  const keep = classes.find((c) => c.id === pick);
  const others = classes.filter((c) => c.id !== pick);
  const moving = keep && others.some((c) => c.level !== keep.level || c.type !== keep.type);
  return (
    <Modal title={`“${name}” is already on another roster`} onClose={onClose}>
      <div className="sheet">
        <p className="muted small">Pick which class {name} actually belongs to, or confirm these are two different students who share a name.</p>
        {classes.map((c) => (
          <label key={c.id} className={`dup-row ${pick === c.id ? 'on' : ''}`}>
            <input type="radio" name="dup" checked={pick === c.id} onChange={() => setPick(c.id)} />
            <span>{classLabel(c)}</span>
            <span className="muted small">{c.id === target ? 'just now' : 'current'}</span>
          </label>
        ))}
        {moving && (
          <p className="muted small">
            This moves {name} from {[...new Set(others.map((c) => `${TYPE_LABELS[c.type]} ${LEVEL_LABELS[c.level]}`))].join(', ')} to {TYPE_LABELS[keep.type]} {LEVEL_LABELS[keep.level]}.
          </p>
        )}
        <div className="row-gap end">
          <button
            className="btn ghost"
            onClick={() => {
              onClose();
              onDifferent();
            }}
          >
            They’re different students
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              onKeep(pick);
            }}
          >
            Same student — keep this class
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Add someone to the Hall of Swimming directly (they needn't be in a class), or edit an entry.
export function HallSheet({ path, m, name, onClose }) {
  const rec = name ? studentOf(m, name) : null;
  const enrolled = name ? classesWithStudent(m, name).length > 0 : false;
  const [who, setWho] = useState(name || '');
  const [rank, setRank] = useState(rec?.achievement?.rank || '');
  const [status, setStatus] = useState(enrolled ? 'Also in a class — rename them from their student card instead.' : '');
  async function save(e) {
    e.preventDefault();
    const n = who.trim();
    if (!n) return setStatus('Enter a name.');
    if (!rank) return setStatus('Pick a rank — Bronze, Silver or Gold.');
    if (name && name.toLowerCase() !== n.toLowerCase() && classesWithStudent(m, n).length) return setStatus('That name is already in a class — edit them from their student card instead.');
    await mutateClasses(path, (x) => setHallEntry(x, name, n, rank));
    onClose();
  }
  async function remove() {
    if (!confirmTwice(`Remove ${name} from the Hall of Swimming?`, name)) return;
    await mutateClasses(path, (x) => setAchievement(x, name, ''));
    onClose();
  }
  return (
    <Modal title={name ? 'Hall of Swimming entry' : 'Add to Hall of Swimming'} onClose={onClose} dirty={who !== (name || '') || rank !== (rec?.achievement?.rank || '')}>
      <form className="sheet drive-form" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input value={who} onChange={(e) => setWho(e.target.value)} disabled={enrolled} autoFocus={!name} />
        </label>
        <div className="seg" role="group" aria-label="Rank">
          {RANK_ORDER.map((r) => (
            <button type="button" key={r} className={rank === r ? 'on' : ''} onClick={() => setRank(r)}>
              {RANK_LABELS[r]}
            </button>
          ))}
        </div>
        {status && <p className="muted small">{status}</p>}
        <div className="row-gap end">
          {name && (
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

// Students with 1–3 lessons left, most urgent first, from today's weekday.
export function LessonsLeftSheet({ m, onClose }) {
  const rows = lessonsLeft(m);
  let last = null;
  return (
    <Modal title="Lessons left" onClose={onClose}>
      <div className="sheet">
        <p className="muted small">Students with 1–3 lessons left, starting from the next class day.</p>
        {!rows.length && <p className="muted">🎉 No students are at 1–3 lessons left.</p>}
        {rows.map((r, i) => {
          const head = r.day !== last;
          last = r.day;
          return (
            <div key={`${r.name}-${i}`}>
              {head && <p className="section-label">{DAY_LABELS[r.day]}</p>}
              <div className="left-row">
                <span>
                  <b>{r.name}</b> <span className="muted small">{timeLabel(r.time)}</span>
                </span>
                <span className={`credit-pill n${r.credits}`}>{r.credits} left</span>
              </div>
            </div>
          );
        })}
        <div className="row-gap end">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Paste from the booking system: a whole day's schedule, or one class's student list.
export function ImportClassesSheet({ path, m, day, onClose }) {
  const [kind, setKind] = useState('schedule');
  const [importDay, setImportDay] = useState(day);
  const [text, setText] = useState('');
  const [list, setList] = useState(null); // parsed student list, waiting for its class
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const classes = sortClasses(lessonsOf(m));

  async function runSchedule() {
    if (!text.trim()) return setStatus('Paste the schedule text first.');
    const parsed = parseSchedule(text);
    if (!parsed.length) return setStatus('Couldn’t find any classes in that text — check it’s pasted in full.');
    let res;
    await mutateClasses(path, (x) => {
      res = applySchedule(x, importDay, structuredClone(parsed));
    });
    const n = res.notes;
    setStatus(
      [
        `Imported ${DAY_LABELS[importDay]}: ${res.created} new class(es), ${res.updated} updated, ${res.seen} student slots.`,
        n.levels.length && `Unrecognised levels:\n${n.levels.join('\n')}`,
        n.caps.length && `Capacity notes:\n${n.caps.join('\n')}`,
        n.moved.length && `Moved from another class:\n${n.moved.join('\n')}`,
        n.kept.length && `Not in the paste, kept on the roster:\n${n.kept.join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
    setText('');
  }
  function readList() {
    if (!text.trim()) return setStatus('Paste the student list first.');
    const found = parseStudentList(text);
    if (!found.length) return setStatus('Couldn’t find any students — check it’s pasted in full, including the header row.');
    setList(found);
    setStatus('');
  }
  async function applyList() {
    const id = classId || classes[0]?.id;
    if (!id) return setStatus('Pick a class first.');
    const overlaps = list.map((s) => ({ s, on: classesWithStudent(m, s.name, id) })).filter((o) => o.on.length);
    if (overlaps.length && !window.confirm(`These students are already on another roster:\n\n${overlaps.map((o) => `${o.s.name} — ${o.on.map(classLabel).join(', ')}`).join('\n')}\n\nApplying moves them here. Continue?`)) return;
    await mutateClasses(path, (x) => applyStudentList(x, id, list));
    const c = classes.find((x) => x.id === id);
    setStatus(`Applied ${list.length} students to ${classLabel(c)}.`);
    setList(null);
    setText('');
  }

  return (
    <Modal title="Import from the booking system" onClose={onClose} dirty={Boolean(text.trim()) || Boolean(list)}>
      <div className="sheet drive-form">
        <div className="seg" role="group" aria-label="What to paste">
          {[
            ['schedule', 'A day’s schedule'],
            ['students', 'A class’s students'],
          ].map(([k, l]) => (
            <button
              key={k}
              className={kind === k ? 'on' : ''}
              onClick={() => {
                setKind(k);
                setList(null);
                setStatus('');
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {kind === 'schedule' ? (
          <>
            <label className="field">
              <span>Which day</span>
              <select value={importDay} onChange={(e) => setImportDay(e.target.value)}>
                {DAY_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">Copy the day from the booking system (times, levels and each student with their lesson balance) and paste it. Classes are matched by time and level; rosters are merged, never replaced.</p>
            <textarea className="import-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'09:00\nStudents: 3/6\nInstructor: …\nLesson level: Kids Beginner\nKyler\n…'} />
          </>
        ) : list ? (
          <>
            <p className="muted small">
              {list.length} students: {list.map((s) => `${s.name} (${s.credits ?? '—'})`).join(', ')}
            </p>
            <label className="field">
              <span>Which class</span>
              <select value={classId || classes[0]?.id || ''} onChange={(e) => setClassId(e.target.value)}>
                {!classes.length && <option value="">No classes yet — add one first</option>}
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)} ({c.students.length}/{capacity(c.type, c.level)})
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <p className="muted small">Paste a class’s student list (Name … Balance rows). You pick the class next — the list replaces that class’s roster.</p>
            <textarea className="import-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name\tAge\tGender\tBalance\nKyler\t7 years 2 months\tMale\t5'} />
          </>
        )}
        {status && <p className="muted small import-status">{status}</p>}
        <div className="row-gap end">
          {kind === 'students' && list && (
            <button className="btn ghost" onClick={() => setList(null)}>
              Back
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          {kind === 'schedule' ? (
            <button className="btn primary" onClick={runSchedule}>
              Import day
            </button>
          ) : list ? (
            <button className="btn primary" onClick={applyList}>
              Apply to class
            </button>
          ) : (
            <button className="btn primary" onClick={readList}>
              Read list
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

