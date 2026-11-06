import {
  EQUIPMENT_ICONS,
  LEVEL_LABELS,
  LOW_CREDIT_THRESHOLD,
  STUCK_WEEKS,
  TYPE_LABELS,
  capacity,
  classHasLowCredits,
  classStart,
  countClass,
  countCompleted,
  creditsOf,
  doneSet,
  effectiveSkills,
  latestPerCategory,
  levelSince,
  occurrenceOf,
  primarySkill,
  shortD,
  skillDiff,
  skillSetFor,
  timeLabel,
  todayKey,
  todayStr,
} from '../../lib/classes';

const weeksText = (w) => (w != null ? ` · ${w} week${w === 1 ? '' : 's'}` : '');

export function SkillChips({ tags }) {
  if (!tags?.length) return null;
  return (
    <span className="skill-chips">
      {tags.map((t) => (
        <span key={`${t.catIndex}-${t.idx}`} className={`skill-chip ${t.stuck ? 'stuck' : ''}`} title={t.stuck ? `On this skill ${STUCK_WEEKS}+ weeks — may need a progression or more time` : undefined}>
          {t.label}
          {weeksText(t.weeks)}
          {t.stuck ? ' 🔴' : ''}
        </span>
      ))}
    </span>
  );
}

// Who's in a class: credits, the skill each is on (with the aid used), and
// anything that differs from the class's shared skills.
export function RosterRows({ m, cls, onOpen }) {
  if (!cls.students.length) return <p className="muted small">No students added yet.</p>;
  const shared = latestPerCategory(cls.skills, cls.type);
  return (
    <div className="roster">
      {shared.length > 0 && (
        <div className="shared-skills">
          <span className="ss-label">Everyone</span>
          <SkillChips tags={shared} />
        </div>
      )}
      {cls.students.map((name) => {
        const credits = creditsOf(m, name);
        const own = effectiveSkills(m, name, cls);
        const primary = primarySkill(own, cls.type);
        const extra = skillDiff(own, cls.skills, cls.type).filter((t) => !primary || t.catIndex !== primary.catIndex);
        return (
          <button key={name} className="roster-row" onClick={() => onOpen(name)}>
            <span className="rr-main">
              <span className="rr-name">
                {name}
                {primary?.equipment ? ` ${EQUIPMENT_ICONS[primary.equipment] || ''}` : ''}
                {credits != null && credits <= LOW_CREDIT_THRESHOLD && <span className="low-flag" title={`${LOW_CREDIT_THRESHOLD} or fewer credits left`}>!</span>}
                <span className={`credit-pill ${credits != null && credits <= 1 ? 'low' : ''}`}>{credits != null ? `${credits} left` : '—'}</span>
              </span>
              {primary && (
                <span className={`skill-primary ${primary.stuck ? 'stuck' : ''}`}>
                  {primary.label}
                  {weeksText(primary.weeks)}
                  {primary.stuck ? ' 🔴' : ''}
                </span>
              )}
              <SkillChips tags={extra} />
            </span>
            <span className="rr-chev">›</span>
          </button>
        );
      })}
    </div>
  );
}

// One class in a day's list: tap to fold; open shows its roster and actions.
export function ClassBlock({ m, cls, open, onToggle, onStudent, onEdit, onDelete, onSkills, onCancelToday }) {
  const cap = capacity(cls.type, cls.level);
  const start = classStart(cls);
  const since = levelSince(cls);
  const total = countCompleted(cls, start);
  const atLevel = countCompleted(cls, since);
  const set = skillSetFor(cls.type);
  const canCancel = cls.day === todayKey() && !occurrenceOf(m, cls.id, todayStr());
  return (
    <div className="class-block">
      <button className="class-row" onClick={onToggle} aria-expanded={open}>
        <span className="cr-time">{timeLabel(cls.time)}</span>
        <span className="cr-info">
          <b>
            {TYPE_LABELS[cls.type]} · {LEVEL_LABELS[cls.level]}
            {classHasLowCredits(m, cls) && <span className="low-flag">!</span>}
          </b>
          <span className="muted small">
            Since {shortD(start)} · {total} lesson{total === 1 ? '' : 's'} done
          </span>
        </span>
        <span className={`lesson-count ${countClass(cls.students.length, cap)}`}>
          {cls.students.length}/{cap}
        </span>
        <span className={`cr-chev ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="class-body">
          <p className="muted small">
            Since {shortD(start)} · {total} lesson{total === 1 ? '' : 's'} completed
            {since !== start && ` · at ${LEVEL_LABELS[cls.level]} since ${shortD(since)} (${atLevel})`}
            {cls.skills && ` · skills ${doneSet(cls.skills, cls.type).size}/${set.sequence.length} in sequence`}
          </p>
          <RosterRows m={m} cls={cls} onOpen={onStudent} />
          {canCancel && (
            <button className="link-btn" onClick={onCancelToday}>
              Cancel today’s lesson
            </button>
          )}
          <div className="row-gap">
            <button className="btn glass sm" onClick={onEdit}>
              Edit
            </button>
            <button className="btn glass sm" onClick={onSkills}>
              Skills
            </button>
            <button className="btn ghost sm danger-text" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
