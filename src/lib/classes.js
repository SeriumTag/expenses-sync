// Swim classes at Happy Fish: the weekly schedule, rosters, lesson credits
// (used up automatically as lessons finish), skills, achievements and the
// Hall of Swimming. Ported from the Body Log app's Swim → Classes.
//
// One record per person, ledgers/{lid}/swim/{pid}/classes:
//   lessons:  { id: { day, time, duration, type, level, students: [names], startDate, levelSince, skills } }
//   students: { key: { name, credits, skills, achievement: { rank, dateKnown }, lifecycle } }
//   occ:      { 'classId_YYYY-MM-DD': { status: 'completed'|'cancelled', processedAt, charged: [names], historical } }
//   autoCreditStart: 'YYYY-MM-DD'   (the first time credits were counted; earlier lessons never charge)
//   reminders: { 'mon-2026-11': true }
// Every change goes through mutateClasses (classesDb.js), a transaction on this
// record, so two phones can't double-charge a lesson or lose each other's edits.

export const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const JS_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_TO_JS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export const TYPE_LABELS = { baby: 'Baby', toddler: 'Toddler', kids: 'Kids' };
export const LEVEL_LABELS = { foundation: 'Foundation', beginner: 'Beginner', intermediate: 'Intermediate', advance: 'Advance', bronze: 'Swimsafer Bronze', silver: 'Swimsafer Silver', gold: 'Swimsafer Gold' };
export const LEVELS_STANDARD = ['foundation', 'beginner', 'intermediate', 'advance'];
export const LEVELS_KIDS_EXTRA = ['bronze', 'silver', 'gold']; // Swimsafer levels: Kids only
export const levelsFor = (type) => (type === 'kids' ? [...LEVELS_STANDARD, ...LEVELS_KIDS_EXTRA] : LEVELS_STANDARD);
export const DEFAULT_CREDITS = 5;
export const LOW_CREDIT_THRESHOLD = 3;
export const STUCK_WEEKS = 5;
export const RANK_ORDER = ['bronze', 'silver', 'gold'];
export const RANK_LABELS = { bronze: '🥉 Bronze', silver: '🥈 Silver', gold: '🥇 Gold' };

const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => localDate(new Date());
export const todayKey = () => JS_DAY[new Date().getDay()];
export const dayKeyOf = (ds) => JS_DAY[new Date(`${ds}T00:00:00`).getDay()];
export function timeLabel(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortD = (s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
export const fullD = (s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;

// Max students: 6, except Kids above Beginner (8).
export const capacity = (type, level) => (type !== 'kids' ? 6 : level === 'foundation' || level === 'beginner' ? 6 : 8);
// Full green, at least half yellow, under half red.
export const countClass = (count, cap) => (cap <= 0 ? 'red' : count / cap >= 1 ? 'green' : count / cap >= 0.5 ? 'yellow' : 'red');
export const classLabel = (c) => `${DAY_LABELS[c.day]} ${timeLabel(c.time)} · ${TYPE_LABELS[c.type]} ${LEVEL_LABELS[c.level]}`;
export const classDuration = (c) => (Number(c.duration) > 0 ? Number(c.duration) : 60);

// ── Reading the record (Firebase may hand back arrays as objects, or drop empty ones) ──
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : v && typeof v === 'object' ? Object.values(v).filter((x) => x != null) : []);
export const studentsOf = (c) => arr(c?.students);
export const lessonsOf = (m) =>
  Object.entries(m?.lessons || {})
    .filter(([, c]) => c)
    .map(([id, c]) => ({ id, ...c, students: studentsOf(c) }));
export const classesForDay = (m, day) => lessonsOf(m).filter((c) => c.day === day).sort((a, b) => a.time.localeCompare(b.time));
export const classDays = (m) => new Set(lessonsOf(m).map((c) => c.day));
// Students are keyed by their name, ignoring case (the same as Body Log's matching).
export const keyOf = (name) => String(name).trim().toLowerCase().replace(/[.#$/[\]]/g, (ch) => `%${ch.charCodeAt(0).toString(16)}`) || '_';
export const studentOf = (m, name) => m?.students?.[keyOf(name)] || null;
export const creditsOf = (m, name) => {
  const s = studentOf(m, name);
  return s?.credits != null ? Number(s.credits) : null;
};
export const isQuit = (m, name) => studentOf(m, name)?.lifecycle?.status === 'quit';
export const classHasLowCredits = (m, c) => studentsOf(c).some((n) => creditsOf(m, n) != null && creditsOf(m, n) <= LOW_CREDIT_THRESHOLD);
export const classesWithStudent = (m, name, exceptId) => lessonsOf(m).filter((c) => c.id !== exceptId && studentsOf(c).some((n) => n.toLowerCase() === String(name).toLowerCase()));

// When a class started (and has been at its level).
export const classStart = (c) => c.startDate || todayStr();
export const levelSince = (c) => c.levelSince || classStart(c);
// How many times this weekly slot has happened since a date (a class starting
// today shows 0 until its time has passed).
export function countCompleted(c, since) {
  if (!since || DAY_TO_JS[c.day] == null) return 0;
  const d = new Date(`${since}T00:00:00`);
  while (d.getDay() !== DAY_TO_JS[c.day]) d.setDate(d.getDate() + 1);
  const [h, mi] = (c.time || '00:00').split(':').map(Number);
  const now = new Date();
  let n = 0;
  for (let i = 0; i < 5000; i++) {
    if (new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi) > now) break;
    n++;
    d.setDate(d.getDate() + 7);
  }
  return n;
}

// ── Lesson credits: one used per rostered student when each lesson ENDS ──
const occKey = (classId, ds) => `${classId}_${ds}`;
export const occurrenceOf = (m, classId, ds) => m?.occ?.[occKey(classId, ds)] || null;
function occurrenceEnd(c, ds) {
  const [h, mi] = (c.time || '00:00').split(':').map(Number);
  const start = new Date(`${ds}T00:00:00`);
  start.setHours(h, mi, 0, 0);
  return new Date(start.getTime() + classDuration(c) * 60000);
}
function occurrenceDatesUpTo(c, until) {
  const out = [];
  if (DAY_TO_JS[c.day] == null) return out;
  const d = new Date(`${classStart(c)}T00:00:00`);
  while (d.getDay() !== DAY_TO_JS[c.day]) d.setDate(d.getDate() + 1);
  for (let i = 0; d <= until && i < 5000; i++) {
    out.push(localDate(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}
function setStudent(m, name, patch) {
  m.students ||= {};
  const k = keyOf(name);
  m.students[k] = { ...(m.students[k] || {}), name: m.students[k]?.name || name, ...patch };
  return m.students[k];
}
// Off every roster and into Student Quit — history is never deleted.
function quitStudent(m, name, c, ds) {
  setStudent(m, name, { lifecycle: { ...(studentOf(m, name)?.lifecycle || {}), status: 'quit', quitAt: new Date().toISOString(), lastClassLabel: classLabel(c), lastAttended: ds } });
  for (const l of Object.values(m.lessons || {})) if (l) l.students = studentsOf(l).filter((n) => n.toLowerCase() !== name.toLowerCase());
}
// A quit student whose balance goes above 0 again is reactivated.
function reactivateIfNeeded(m, name) {
  const s = studentOf(m, name);
  if (s?.lifecycle?.status !== 'quit' || !(Number(s.credits) > 0)) return;
  s.lifecycle = { ...s.lifecycle, status: 'active', reactivatedAt: new Date().toISOString() };
}
// Charges every finished, unrecorded lesson exactly once. The first ever run
// records everything up to today as already handled (no retroactive charges).
// Returns true if anything changed.
export function processDue(m, now = new Date()) {
  let changed = false;
  m.occ ||= {};
  const today = localDate(now);
  if (!m.autoCreditStart) {
    m.autoCreditStart = today;
    for (const c of lessonsOf(m))
      for (const ds of occurrenceDatesUpTo(c, now)) if (ds <= today && !m.occ[occKey(c.id, ds)]) m.occ[occKey(c.id, ds)] = { status: 'completed', processedAt: now.toISOString(), historical: true };
    changed = true;
  }
  for (const c of lessonsOf(m)) {
    for (const ds of occurrenceDatesUpTo(c, now)) {
      const k = occKey(c.id, ds);
      if (m.occ[k] || occurrenceEnd(c, ds) > now) continue;
      const charged = [];
      for (const name of studentsOf(m.lessons[c.id])) {
        const after = (creditsOf(m, name) ?? 0) - 1;
        setStudent(m, name, { credits: after });
        charged.push(name);
        if (after <= 0) quitStudent(m, name, c, ds);
      }
      m.occ[k] = { status: 'completed', processedAt: now.toISOString(), charged };
      changed = true;
    }
  }
  return changed;
}
// Today's lesson won't happen: no one is charged for it.
export function cancelToday(m, classId) {
  m.occ ||= {};
  const k = occKey(classId, todayStr());
  if (m.occ[k]) return false;
  m.occ[k] = { status: 'cancelled', processedAt: new Date().toISOString() };
  return true;
}

// ── Monthly per-weekday review: due from the first of that weekday each month until marked ──
export function remindersDue(m, now = new Date()) {
  const y = now.getFullYear();
  const mo = now.getMonth();
  return DAY_ORDER.map((day) => {
    const first = new Date(y, mo, 1);
    while (first.getDay() !== DAY_TO_JS[day]) first.setDate(first.getDate() + 1);
    const key = `${day}-${y}-${pad(mo + 1)}`;
    return { day, key, label: DAY_LABELS[day], due: first <= now && !m?.reminders?.[key] };
  }).filter((r) => r.due);
}

// ── Skills: a curriculum per class type, tracked by position ──
export const SKILL_SETS = {
  baby: {
    sequence: ['Prone side kick', 'Face to face kick', 'Submerge', 'Submerge and glide', 'Free float to self', 'Free float between adults', 'Long gliding', 'Short distance swim', 'Swim to float', 'Float to swim', 'Assisted Swim float swim', 'Swim float swim', 'Assisted Lift to breathe', 'Lift to breathe', 'Cradle backfloat', 'Shoulder backfloat', '3 point backfloat', '2 point backfloat', 'Changing hands backfloat', 'Backfloat'],
    categories: [
      { name: 'Category 1', start: 0, end: 13 },
      { name: 'Category 2', start: 14, end: 19 },
    ],
    options: [
      { val: 'backfloat', label: 'Backfloat' },
      { val: 'board', label: 'Board' },
      { val: 'dumbbells', label: 'Dumbbells' },
    ],
  },
  toddler: {
    sequence: ['Noodle kicking', 'Streamline', 'One hand', 'Change hand', 'Rainbow hands', 'Side breathing', 'RBRB', 'Shoulder backfloat', 'Backkicking', 'Backstroke'],
    categories: [
      { name: 'Category 1', start: 0, end: 6 },
      { name: 'Category 2', start: 7, end: 9 },
    ],
    options: [
      { val: 'backfloat', label: 'Backfloat' },
      { val: 'board', label: 'Board' },
      { val: 'dumbbells', label: 'Dumbbells' },
    ],
  },
  kids: {
    sequence: ['Streamline kicking', 'One hand', 'Change hand', 'Rainbow hand', 'Side breathing', 'Rainbow and breath', 'RBRB', 'Backkicking board', 'Backkicking', 'Backstroke', 'Froggy kick with noodle and backfloat', 'Breastroke', 'Survival backstroke kick only with board', 'Survival backstroke', 'Survival breaststroke with board or backfloat', 'Survival breaststroke', 'Side stroke with board', 'Sidestroke', 'Slanted Somersaults', 'Somersault', 'Cant dive', 'Short dive', 'Long dive'],
    categories: [
      { name: 'RBRB', start: 0, end: 6 },
      { name: 'Backstroke', start: 7, end: 9 },
      { name: 'Breaststroke', start: 10, end: 11 },
      { name: 'Survival', start: 12, end: 17 },
      { name: 'Somersault', start: 18, end: 19 },
      { name: 'Dive', start: 20, end: 22 },
    ],
    options: [
      { val: 'backfloat_board', label: 'Board & Float' },
      { val: 'board', label: 'Board' },
      { val: 'backfloat', label: 'Float' },
    ],
  },
};
export const skillSetFor = (type) => SKILL_SETS[type] || SKILL_SETS.kids;
export const EQUIPMENT_ICONS = { backfloat_board: '🏄🛟', board: '🏄', backfloat: '🛟', dumbbells: '🏋️' };
// Positions done (older Body Log data stored names instead).
export function doneSet(skills, type) {
  const seq = arr(skills?.sequence);
  if (!seq.length) return new Set();
  if (typeof seq[0] === 'number') return new Set(seq.map(Number));
  const set = skillSetFor(type);
  return new Set(seq.map((n) => set.sequence.indexOf(n)).filter((i) => i > -1));
}
export const weeksSince = (ds) => (ds ? Math.max(0, Math.floor((Date.now() - new Date(`${ds}T00:00:00`).getTime()) / 86400000 / 7)) + 1 : null);
// The furthest skill reached in each category, with how long they've been on it.
export function latestPerCategory(skills, type) {
  const set = skillSetFor(type);
  const done = doneSet(skills, type);
  const dates = skills?.categoryDates || {};
  const out = [];
  set.categories.forEach((cat, ci) => {
    for (let i = cat.end; i >= cat.start; i--) {
      if (!done.has(i)) continue;
      const date = dates[ci] || null;
      const weeks = weeksSince(date);
      out.push({ catIndex: ci, idx: i, label: set.sequence[i], date, weeks, stuck: weeks != null && weeks >= STUCK_WEEKS });
      break;
    }
  });
  return out;
}
const furthestByCategory = (skills, type) => {
  const done = doneSet(skills, type);
  return skillSetFor(type).categories.map((cat) => {
    for (let i = cat.end; i >= cat.start; i--) if (done.has(i)) return i;
    return -1;
  });
};
// The skill being worked on right now: the most recently changed category.
export function primarySkill(skills, type) {
  const all = latestPerCategory(skills, type);
  if (!all.length) return null;
  const best = all.reduce((b, t) => (t.date && (!b.date || t.date > b.date) ? t : b), all[0]);
  return { ...best, equipment: (skills?.equipment || {})[best.idx] || null };
}
// Categories where a student differs from their class.
export function skillDiff(studentSkills, classSkills, type) {
  const cls = furthestByCategory(classSkills, type);
  return latestPerCategory(studentSkills, type).filter((t) => t.idx !== cls[t.catIndex]);
}
// A student follows their class's skills until they have their own.
export const effectiveSkills = (m, name, c) => studentOf(m, name)?.skills || c?.skills || null;
// A category's "since" date resets when its furthest skill changes.
export function withCategoryDates(newSkills, oldSkills, type) {
  const before = furthestByCategory(oldSkills, type);
  const after = furthestByCategory(newSkills, type);
  const old = oldSkills?.categoryDates || {};
  const dates = {};
  after.forEach((idx, ci) => {
    if (idx !== -1) dates[ci] = idx !== before[ci] ? todayStr() : old[ci] || todayStr();
  });
  return { ...newSkills, categoryDates: dates };
}

// ── Achievements & the Hall of Swimming ──
// Any rank completes every Kids category's last skill (only ever raises progress).
function applyAchievementSkills(m, name) {
  const set = SKILL_SETS.kids;
  const existing = studentOf(m, name)?.skills || {};
  const done = doneSet(existing, 'kids');
  const dates = { ...(existing.categoryDates || {}) };
  let changed = false;
  set.categories.forEach((cat, ci) => {
    let furthest = -1;
    for (let i = cat.end; i >= cat.start; i--)
      if (done.has(i)) {
        furthest = i;
        break;
      }
    if (furthest < cat.end) {
      done.add(cat.end);
      dates[ci] = todayStr();
      changed = true;
    }
  });
  if (changed) setStudent(m, name, { skills: { ...existing, sequence: [...done].sort((a, b) => a - b), categoryDates: dates } });
}
export function setAchievement(m, name, rank) {
  const prev = studentOf(m, name)?.achievement;
  if (!rank) {
    if (prev) setStudent(m, name, { achievement: null });
    return;
  }
  if (prev?.rank === rank) return;
  setStudent(m, name, { achievement: { rank, dateKnown: prev?.dateKnown || todayStr() } }); // upgrades keep the first date
  applyAchievementSkills(m, name);
}
export const hallEntries = (m) =>
  Object.values(m?.students || {})
    .filter((s) => s?.achievement?.rank)
    .map((s) => ({ name: s.name, ...s.achievement }))
    .sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank) || a.name.localeCompare(b.name));

// ── Lists ──
// Students with 1–3 lessons left, starting from today's weekday.
export function lessonsLeft(m) {
  const t = DAY_ORDER.indexOf(todayKey());
  const rot = (d) => (DAY_ORDER.indexOf(d) - t + 7) % 7;
  const out = [];
  for (const c of lessonsOf(m))
    for (const name of c.students) {
      const cr = creditsOf(m, name);
      if (cr != null && cr >= 1 && cr <= 3) out.push({ name, day: c.day, time: c.time, credits: cr });
    }
  return out.sort((a, b) => rot(a.day) - rot(b.day) || a.credits - b.credits || a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}
export const quitStudents = (m) =>
  Object.values(m?.students || {})
    .filter((s) => s?.lifecycle?.status === 'quit')
    .sort((a, b) => a.name.localeCompare(b.name));
export const allStudentNames = (m) =>
  Object.values(m?.students || {})
    .filter((s) => s?.name)
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b));

// ── Changes (each runs inside mutateClasses) ──
export function saveClass(m, id, fields) {
  m.lessons ||= {};
  const today = todayStr();
  const prev = m.lessons[id];
  if (prev) m.lessons[id] = { ...prev, ...fields, levelSince: prev.level !== fields.level ? today : prev.levelSince || prev.startDate || today };
  else m.lessons[id] = { ...fields, students: [], startDate: today, levelSince: today };
}
export function deleteClass(m, id) {
  if (m.lessons) delete m.lessons[id];
}
function rosterAdd(m, classId, name) {
  const c = m.lessons?.[classId];
  if (!c) return;
  const list = studentsOf(c);
  if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
  c.students = list;
}
function rosterRemove(m, classId, name) {
  const c = m.lessons?.[classId];
  if (c) c.students = studentsOf(c).filter((n) => n.toLowerCase() !== name.toLowerCase());
}
// A brand-new student on a class (5 credits).
export function addNewStudent(m, classId, name) {
  setStudent(m, name, { name, credits: DEFAULT_CREDITS });
  rosterAdd(m, classId, name);
}
// An existing student onto a class; keepClassId (from the duplicate question)
// says which one class they actually belong to; null = keep every roster as is.
export function addExistingStudent(m, classId, name, credits, keepClassId = undefined) {
  setStudent(m, name, { credits });
  reactivateIfNeeded(m, name);
  if (keepClassId === undefined) return rosterAdd(m, classId, name);
  if (keepClassId === null) return rosterAdd(m, classId, name); // two different people who share a name
  for (const c of classesWithStudent(m, name)) if (c.id !== keepClassId) rosterRemove(m, c.id, name);
  rosterAdd(m, keepClassId, name);
}
export function setCredits(m, name, credits) {
  setStudent(m, name, { credits });
  reactivateIfNeeded(m, name);
}
export function removeFromClass(m, classId, name) {
  rosterRemove(m, classId, name);
}
export function transferStudent(m, fromId, toId, name, keepClassId = undefined) {
  if (keepClassId !== undefined) {
    for (const id of [fromId, toId]) if (id !== keepClassId) rosterRemove(m, id, name);
    return rosterAdd(m, keepClassId, name);
  }
  rosterRemove(m, fromId, name);
  rosterAdd(m, toId, name);
}
// Rename everywhere (records and every roster). merge = the new name is the
// same student already on record: keep that record, drop the old one.
export function renameStudent(m, oldName, newName, merge = false) {
  if (oldName.toLowerCase() === newName.toLowerCase()) {
    const s = studentOf(m, oldName);
    if (s) s.name = newName;
  } else {
    const oldRec = studentOf(m, oldName);
    if (oldRec) delete m.students[keyOf(oldName)];
    if (!merge || !studentOf(m, newName)) setStudent(m, newName, { ...(oldRec || {}), name: newName });
  }
  for (const c of Object.values(m.lessons || {})) if (c) c.students = studentsOf(c).map((n) => (n.toLowerCase() === oldName.toLowerCase() ? newName : n));
}
export function setSkills(m, target, skills) {
  if (target.classId) m.lessons[target.classId].skills = skills;
  else setStudent(m, target.name, { skills });
}
export function markReminder(m, key) {
  m.reminders = { ...(m.reminders || {}), [key]: true };
}
export function setHallEntry(m, oldName, name, rank) {
  if (oldName && oldName.toLowerCase() !== name.toLowerCase()) setStudent(m, oldName, { achievement: null });
  if (!studentOf(m, name)) setStudent(m, name, { name });
  setAchievement(m, name, rank);
}

// ── Pasting from the booking system ──
// A day's schedule: a time line, then Students: x/y, Instructor, Lesson level,
// then six lines per student (name, guardian, "Age:", age, "Lesson Balance:", balance).
const TAGS = new Set(['TRIAL', 'NEW CLASS', 'LOW']);
const isTag = (l) => TAGS.has(l.toUpperCase()) || /^\d+(ST|ND|RD|TH)$/i.test(l);
export function parseLevelText(text) {
  const t = String(text).toLowerCase();
  const type = /\bbaby\b/.test(t) ? 'baby' : /\btoddler\b/.test(t) ? 'toddler' : 'kids';
  const level = /bronze/.test(t) ? 'bronze' : /silver/.test(t) ? 'silver' : /\bgold\b/.test(t) ? 'gold' : /intermediate/.test(t) ? 'intermediate' : /advance/.test(t) ? 'advance' : /beginner/.test(t) ? 'beginner' : /foundation/.test(t) ? 'foundation' : null;
  return { type, level };
}
export function parseSchedule(raw) {
  const lines = String(raw)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const timeRe = /^(\d{1,2}):([0-5]\d)$/;
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!timeRe.test(lines[i])) {
      i++;
      continue;
    }
    const [hh, mm] = lines[i].split(':');
    const time = `${hh.padStart(2, '0')}:${mm}`;
    i++;
    let capFromText = null;
    let levelText = null;
    while (i < lines.length && !timeRe.test(lines[i])) {
      if (/^students:/i.test(lines[i])) {
        const mt = /(\d+)\s*\/\s*(\d+)/.exec(lines[i]);
        if (mt) capFromText = Number(mt[2]);
        i++;
      } else if (/^instructor:/i.test(lines[i])) i++;
      else if (/^lesson level:/i.test(lines[i])) {
        levelText = lines[i].replace(/^lesson level:/i, '').trim();
        i++;
      } else break;
    }
    const body = [];
    while (i < lines.length && !timeRe.test(lines[i])) body.push(lines[i++]);
    const kept = [];
    const rescheduledAfter = new Set(); // RESCHEDULED drops just the student block before it
    for (const l of body) {
      if (/^rescheduled$/i.test(l)) rescheduledAfter.add(kept.length);
      else if (!isTag(l)) kept.push(l);
    }
    const students = [];
    for (let k = 0; k + 5 < kept.length; k += 6) {
      const name = kept[k].replace(/^@/, '').trim();
      const bal = parseInt(kept[k + 5], 10);
      if (name && !rescheduledAfter.has(k + 6)) students.push({ name, credits: Number.isNaN(bal) ? null : bal });
    }
    const { type, level } = levelText ? parseLevelText(levelText) : { type: 'kids', level: null };
    out.push({ time, levelText: levelText || '(no level line found)', type, level, students, capFromText });
  }
  return out;
}
// Put a parsed day into the schedule: same day+time+type+level is the same
// class (its roster is merged, never replaced). Returns a summary.
export function applySchedule(m, day, parsed) {
  let created = 0;
  let updated = 0;
  let seen = 0;
  const notes = { levels: [], caps: [], moved: [], kept: [] };
  m.lessons ||= {};
  for (const pc of parsed) {
    const level = pc.level || 'foundation';
    if (!pc.level) notes.levels.push(`${pc.time} “${pc.levelText}” — level not recognised, set to Foundation, please fix it`);
    const cap = capacity(pc.type, level);
    if (pc.capFromText != null && pc.capFromText !== cap) notes.caps.push(`${pc.time} shows max ${pc.capFromText} there vs ${cap} here`);
    let c = lessonsOf(m).find((x) => x.day === day && x.time === pc.time && x.type === pc.type && x.level === level);
    let id = c?.id;
    if (!c) {
      id = `lesson-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      saveClass(m, id, { day, time: pc.time, duration: 60, type: pc.type, level });
      created++;
    } else updated++;
    const existing = studentsOf(m.lessons[id]);
    const pastedLower = new Set(pc.students.map((s) => s.name.toLowerCase()));
    for (const s of pc.students) {
      // Match to the roster's own spelling: exact, else a unique whole-word prefix either way.
      const pl = s.name.toLowerCase();
      const exact = existing.find((n) => n.toLowerCase() === pl);
      if (exact) s.name = exact;
      else {
        const cands = existing.filter((n) => !pastedLower.has(n.toLowerCase()) && (pl.startsWith(`${n.toLowerCase()} `) || n.toLowerCase().startsWith(`${pl} `)));
        if (cands.length === 1) s.name = cands[0];
      }
      const dup = classesWithStudent(m, s.name, id);
      if (dup.length) {
        dup.forEach((d) => rosterRemove(m, d.id, s.name));
        notes.moved.push(`${s.name} — moved here from ${dup.map(classLabel).join(', ')}`);
      }
    }
    const kept = existing.filter((n) => !pc.students.some((s) => s.name.toLowerCase() === n.toLowerCase()));
    if (kept.length) notes.kept.push(`${pc.time}: ${kept.join(', ')}`);
    for (const s of pc.students) {
      rosterAdd(m, id, s.name);
      if (s.credits != null) setStudent(m, s.name, { credits: s.credits });
      else if (creditsOf(m, s.name) == null) setStudent(m, s.name, { credits: DEFAULT_CREDITS });
      reactivateIfNeeded(m, s.name);
      seen++;
    }
  }
  return { created, updated, seen, notes };
}
// A roster-only paste (Name … Balance rows); the class is picked afterwards.
export function parseStudentList(raw) {
  const out = [];
  for (const line of String(raw)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    if (/^rescheduled$/i.test(line)) {
      out.pop();
      continue;
    }
    if (/^students$/i.test(line) || /^\d+$/.test(line) || (/^name\b/i.test(line) && /balance/i.test(line))) continue;
    const fields = line
      .split('\t')
      .map((s) => s.trim())
      .filter(Boolean);
    let name;
    let bal;
    if (fields.length >= 4) [name, bal] = [fields[0], fields[fields.length - 1]];
    else {
      const mt = /^(.+?)\s+(?:\d+\s*years?\s*\d*\s*months?|\d+\s*months?)\s+(?:Male|Female)\s+(\d+)$/i.exec(line);
      if (mt) [name, bal] = [mt[1].trim(), mt[2]];
    }
    if (!name) continue;
    const b = parseInt(bal, 10);
    out.push({ name, credits: Number.isNaN(b) ? null : b });
  }
  return out;
}
export function applyStudentList(m, classId, list) {
  for (const s of list) for (const d of classesWithStudent(m, s.name, classId)) rosterRemove(m, d.id, s.name);
  m.lessons[classId].students = list.map((s) => s.name);
  for (const s of list) {
    if (s.credits != null) setStudent(m, s.name, { credits: s.credits });
    else if (creditsOf(m, s.name) == null) setStudent(m, s.name, { credits: DEFAULT_CREDITS });
    reactivateIfNeeded(m, s.name);
  }
}

// ── Import from a Body Log backup ──
// exportedAt: when the backup was made. Body Log records every lesson it has charged by
// then, so any imported lesson before that with no record counts as already handled.
export function parseClassesBackup(stores, exportedAt = null) {
  const lessons = stores['body-log-lessons'];
  if (!Array.isArray(lessons) && !stores['body-log-students']) throw new Error('No classes found in that backup.');
  const m = { lessons: {}, students: {}, occ: {}, reminders: {} };
  for (const c of lessons || []) {
    if (!c?.id || !DAY_LABELS[c.day]) continue;
    m.lessons[String(c.id).replace(/[.#$/[\]]/g, '_')] = {
      day: c.day,
      time: c.time || '16:00',
      duration: Number(c.duration) || 60,
      type: c.type || 'kids',
      level: c.level || 'foundation',
      students: (c.students || []).filter(Boolean),
      startDate: c.startDate || (/^lesson-(\d+)/.exec(c.id) ? localDate(new Date(Number(/^lesson-(\d+)/.exec(c.id)[1]))) : todayStr()),
      levelSince: c.levelSince || c.startDate || null,
      ...(c.skills ? { skills: c.skills } : {}),
    };
  }
  const put = (name, patch) => {
    const k = keyOf(name);
    m.students[k] = { ...(m.students[k] || { name }), ...patch };
  };
  for (const [name, cr] of Object.entries(stores['body-log-students'] || {})) put(name, { credits: Number(cr) });
  for (const [name, sk] of Object.entries(stores['body-log-student-skills'] || {})) put(name, { skills: sk });
  for (const [name, a] of Object.entries(stores['body-log-student-achievements'] || {})) if (a?.rank) put(name, { achievement: { rank: a.rank, dateKnown: a.dateKnown || todayStr() } });
  for (const [name, lc] of Object.entries(stores['body-log-student-lifecycle'] || {})) if (lc) put(name, { lifecycle: lc });
  for (const [k, o] of Object.entries(stores['body-log-lesson-occurrences'] || {})) {
    const [cid, ds] = k.split('|');
    if (cid && ds) m.occ[`${cid.replace(/[.#$/[\]]/g, '_')}_${ds}`] = { status: o?.status || 'completed', processedAt: o?.processedAt || null, charged: o?.chargedStudents || [], ...(o?.historical ? { historical: true } : {}) };
  }
  const upTo = exportedAt && !Number.isNaN(new Date(exportedAt).getTime()) ? new Date(exportedAt) : new Date();
  for (const c of lessonsOf(m))
    for (const ds of occurrenceDatesUpTo(c, upTo)) {
      const k = occKey(c.id, ds);
      if (!m.occ[k] && occurrenceEnd(c, ds) <= upTo) m.occ[k] = { status: 'completed', processedAt: upTo.toISOString(), historical: true };
    }
  if (typeof stores['body-log-autocredit-start'] === 'string') m.autoCreditStart = stores['body-log-autocredit-start'];
  for (const [k, v] of Object.entries(stores['body-log-monthly-reminders'] || {})) if (v) m.reminders[k] = true;
  return m;
}
// Merge an imported record: new classes, students, lesson records and reminders are
// added; anything already here is left as it is. Returns counts.
export function mergeImported(m, imp) {
  const count = { classes: 0, students: 0 };
  for (const part of ['lessons', 'students', 'occ', 'reminders']) {
    m[part] ||= {};
    for (const [k, v] of Object.entries(imp[part] || {})) {
      if (m[part][k] !== undefined) continue;
      m[part][k] = v;
      if (part === 'lessons') count.classes++;
      if (part === 'students') count.students++;
    }
  }
  // Keep the earliest "counting since" date, so lessons already handled in Body Log aren't charged again.
  if (imp.autoCreditStart && (!m.autoCreditStart || imp.autoCreditStart < m.autoCreditStart)) m.autoCreditStart = imp.autoCreditStart;
  return count;
}
