import { useMemo, useState } from 'react';
import { setPath } from '../../lib/db';
import {
  DAY_LABELS,
  LOCATIONS,
  checkPayslip,
  dailyTotals,
  dayKeyOf,
  daysOf,
  locationTotals,
  parseSwimBackup,
  schoolStudents,
  swimDayTotal,
  lessonList,
  lessonsSummary,
  swimModeOf,
  swimTotals,
  todayStr,
  weeksOfMonth,
} from '../../lib/swim';
import { periodLabel } from '../../lib/budget';
import ImportBackup, { backupStores, countText } from './ImportBackup';
import { PasteDaysSheet, SwimDaySheet, lessonsLine, shortD } from './SwimSheets';
import HappyFishIcon from './HappyFishIcon';
import ClassesView from './ClassesView';
import { mergeImported, parseClassesBackup } from '../../lib/classes';
import { prefs } from '../../lib/session';

const money = (n) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;
const LOC_COLORS = { CC: 'var(--pink)', WWW: 'var(--sky)', JE: 'var(--mint)' };

// One person's Happy Fish swim teaching, for the month in the top bar: what
// it earned (which is their salary), students by week, away days and the
// payslip check.
export default function SwimScreen({ ledgerId, pk, personId, personName, data, onBack, onRemove }) {
  const path = `ledgers/${ledgerId}/swim/${personId}`;
  const days = useMemo(() => daysOf(data), [data]);
  const [y, m] = /^\d{4}-\d{2}$/.test(pk) ? [Number(pk.slice(0, 4)), Number(pk.slice(5, 7)) - 1] : [Number(pk), new Date().getMonth()];
  const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
  // Paid a month later: this month's swim days are next month's salary.
  const nextMonthKey = `${m === 11 ? y + 1 : y}-${String(m === 11 ? 1 : m + 2).padStart(2, '0')}`;
  const t = swimTotals(days, y, m);
  const [sheet, setSheet] = useState(null); // { kind, ... }
  const [week, setWeek] = useState(null);
  const [pickDay, setPickDay] = useState(null);
  const [menu, setMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const [top, setTopState] = useState(() => prefs.get('swimTop') || 'overview');
  const setTop = (v) => {
    setTopState(v);
    prefs.set('swimTop', v);
  };

  const { weeks, current } = weeksOfMonth(days, y, m);
  const maxWeek = Math.max(...weeks.map((w) => w.students), 1);
  const thisWeek = weeks[current];
  const weekLoc = thisWeek ? locationTotals(days, thisWeek.start, thisWeek.end).totals : { CC: 0, WWW: 0, JE: 0 };
  const perDay = dailyTotals(days, y, m);
  const maxDay = Math.max(...perDay.map((d) => d.value), 1);
  const dayEntries = pickDay ? days.filter((d) => d.date === pickDay) : [];
  const today = todayStr();

  function planImport(raw) {
    const stores = backupStores(raw);
    let found = {};
    try {
      found = parseSwimBackup(stores);
    } catch {
      /* no swim days, away days or payslips — classes may still be there */
    }
    const patch = {};
    const counts = { days: 0, away: 0, payslips: 0 };
    for (const [folder, items] of Object.entries(found)) {
      for (const [id, v] of Object.entries(items)) {
        if (folder === 'away' || data?.[folder]?.[id] !== undefined) continue;
        patch[`${folder}/${id}`] = v;
        counts[folder]++;
      }
    }
    // Classes: new classes, students, lesson records and reminders; nothing already here is touched.
    let cls = { classes: 0, students: 0 };
    let hadClasses = false;
    try {
      let exported = null;
      try {
        exported = JSON.parse(raw).exported || null;
      } catch {
        /* pasted stores only */
      }
      const imp = parseClassesBackup(stores, exported);
      hadClasses = true;
      const merged = structuredClone(data?.classes || {});
      cls = mergeImported(merged, imp);
      for (const part of ['lessons', 'students', 'occ', 'reminders']) for (const [k, v] of Object.entries(merged[part] || {})) if (data?.classes?.[part]?.[k] === undefined) patch[`classes/${part}/${k}`] = v;
      if (merged.autoCreditStart && merged.autoCreditStart !== data?.classes?.autoCreditStart) patch['classes/autoCreditStart'] = merged.autoCreditStart;
    } catch {
      /* no classes in that backup */
    }
    const parts = [counts.days && countText(counts.days, 'swim day', 'swim days'), counts.payslips && countText(counts.payslips, 'payslip', 'payslips'), cls.classes && countText(cls.classes, 'class', 'classes'), cls.students && countText(cls.students, 'student', 'students')].filter(Boolean);
    if (!hadClasses && !Object.keys(found).length) throw new Error('No swim data or classes found in that backup.');
    return { patch, summary: parts.join(', ') || 'lesson records' };
  }

  return (
    <div className="drive extra-page">
      <div className="drive-head">
        <button className="btn ghost sm back" onClick={onBack}>
          ‹ Back
        </button>
        <span className="list-menu-wrap">
          <button className="btn ghost sm" onClick={() => setMenu((o) => !o)} aria-expanded={menu} aria-label="Swim options">
            ⋯
          </button>
          {menu && (
            <>
              <div className="menu-scrim" onClick={() => setMenu(false)} />
              <div className="list-menu right" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setImporting(true);
                  }}
                >
                  <span className="menu-ico">📥</span> Import from Body Log backup
                </button>
              </div>
            </>
          )}
        </span>
      </div>
      <div className="drive-title">
        <span className="extra-badge swim">
          <HappyFishIcon size={40} />
        </span>
        <div>
          <h1 className="screen-title">Happy Fish</h1>
          <span className="muted small">{personName ? `${personName}’s swim teaching` : 'Swim teaching'}</span>
        </div>
      </div>

      <div className="seg swim-top" role="tablist" aria-label="Happy Fish">
        {[
          ['overview', 'Earnings'],
          ['classes', 'Classes'],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={top === k} className={top === k ? 'on' : ''} onClick={() => setTop(k)}>
            {l}
          </button>
        ))}
      </div>

      {top === 'overview' && (
        <>
        {/* Swimming: the month's earnings — this is the salary */}
        <section className="home-card">
          <div className="home-card-head">
            <h2>Swimming · {periodLabel(monthKey)}</h2>
            <span className="swim-head-btns">
              <button className="btn glass sm" onClick={() => setSheet({ kind: 'paste' })}>
                📋 Paste days
              </button>
              <button className="btn primary sm" onClick={() => setSheet({ kind: 'day', date: today.startsWith(monthKey) ? today : `${monthKey}-01` })}>
                ＋ Swim day
              </button>
            </span>
          </div>
          <div className="dh-split four">
            <Cell k="Earned" v={money(t.total)} cls="swim" />
            <Cell k="School students" v={t.students} />
            <Cell k="Outside" v={t.outside} />
            <Cell k="Days taught" v={t.days} />
          </div>
          <p className="muted small swim-salary-note">
            <b>{money(t.total)}</b> earned in {periodLabel(monthKey)} is paid as {personName || 'this person'}’s {periodLabel(nextMonthKey)} salary.
          </p>
  
          <p className="section-label">School students by week</p>
          <p className="small">
            {thisWeek ? (
              <>
                This week: <b>{weekLoc.CC + weekLoc.WWW + weekLoc.JE}</b> student{weekLoc.CC + weekLoc.WWW + weekLoc.JE === 1 ? '' : 's'}
              </>
            ) : (
              <span className="muted">Pick this month in the top bar to see this week.</span>
            )}
          </p>
          <div className="loc-legend">
            {LOCATIONS.map((l) => (
              <span key={l}>
                <i style={{ background: LOC_COLORS[l] }} /> {l}
                {thisWeek ? ` — ${weekLoc[l]}` : ''}
              </span>
            ))}
          </div>
          {weeks.some((w) => w.students > 0) ? (
            <div className="wk-bars">
              {weeks.map((w, i) => (
                <button key={w.start} className={`wk-col ${week === i ? 'picked' : ''}`} onClick={() => setWeek(week === i ? null : i)} aria-label={`Week of ${shortD(w.start)}: ${w.students} students`}>
                  <span className="wk-n">{w.students}</span>
                  <span className="wk-wrap">
                    <i className={i === current ? 'current' : ''} style={{ height: `${Math.max(3, (w.students / maxWeek) * 100)}%`, opacity: w.students || i === current ? 1 : 0.25 }} />
                  </span>
                  <span className={`wk-l ${i === current ? 'current' : ''}`}>{i === current ? 'This wk' : `Wk ${i + 1}`}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small">Paste a day from the booking page (📋 Paste days) or log a swim day, and the weekly student counts appear here.</p>
          )}
          {week != null && weeks[week] && <WeekDetail days={days} w={weeks[week]} label={week === current ? 'This week' : `Week ${week + 1}`} />}
  
          <p className="section-label">Swim earnings per day · tap a day to edit</p>
          {perDay.some((d) => d.value > 0) ? (
            <div className="day-bars">
              {perDay.map((d) => (
                <button key={d.date} className={`day-bar-col ${pickDay === d.date ? 'picked' : ''}`} onClick={() => setPickDay(pickDay === d.date ? null : d.date)} aria-label={`${shortD(d.date)}: ${money(d.value)}`}>
                  <span className="db-v">{d.value > 0 ? Math.round(d.value) : ''}</span>
                  <span className="db-wrap">
                    <i className="swim" style={{ height: `${Math.max(2, (d.value / maxDay) * 100)}%`, opacity: d.value ? 1 : 0.2 }} />
                  </span>
                  <span className="db-l">{d.date.slice(8)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small">Log a swim day and each day’s earnings appear here.</p>
          )}
          {pickDay && (
            <div className="day-report">
              <div className="dr-head">
                <b>{new Date(`${pickDay}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                <button className="btn glass sm" onClick={() => setSheet({ kind: 'day', date: pickDay })}>
                  ＋ Log this day
                </button>
              </div>
              {dayEntries.length === 0 && <p className="muted small">Nothing logged.</p>}
              {dayEntries.map((d) => (
                <div key={d.id}>
                  <button className="history-row swim-day-row" onClick={() => setSheet({ kind: 'day', day: d })}>
                    <span className="hr-v">{dayText(d)}</span>
                    <b>{money(swimDayTotal(d))}</b>
                    <span className="rr-e">✎</span>
                  </button>
                  {swimModeOf(d) === 'lessons' && (
                    <div className="lesson-list">
                      {lessonList(d).map((l, i) => (
                        <span key={i}>
                          <span>
                            {l.time} {l.title}
                            {l.kind !== 'group' ? ` · ${l.kind}` : ''}
                          </span>
                          <span>
                            {l.kids} × · {money(l.pay)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
  
        <PayslipCard path={path} saved={data?.payslips?.[monthKey]} days={days} y={y} m={m} monthKey={monthKey} />
  
          </>
      )}

      {top === 'classes' && <ClassesView path={`${path}/classes`} m={data?.classes || {}} swimDays={days} onSwimDay={(s) => setSheet({ kind: 'day', ...s })} />}

      <button className="link-btn extra-remove" onClick={onRemove}>
        Untick Happy Fish for {personName || 'this person'}
      </button>

      {sheet?.kind === 'day' && <SwimDaySheet path={path} day={sheet.day} date={sheet.date} days={days} onSaved={(d) => setPickDay(d)} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'paste' && <PasteDaysSheet path={path} days={days} onSaved={(d) => setPickDay(d.startsWith(monthKey) ? d : null)} onClose={() => setSheet(null)} />}
      {importing && <ImportBackup path={path} what="your swim days, payslips and classes" plan={planImport} onClose={() => setImporting(false)} />}
    </div>
  );
}

function Cell({ k, v, cls = '' }) {
  return (
    <div className="dh-cell">
      <span className="dh-k">{k}</span>
      <b className={`dh-v ${cls}`}>{v}</b>
    </div>
  );
}

function dayText(d) {
  const mode = swimModeOf(d);
  if (mode === 'lessons') return lessonsLine(lessonsSummary(lessonList(d)));
  if (mode === 'flat') return `Flat rate ${money(d.amount)}`;
  if (mode === 'relief') return `Relief ${d.reliefHeads || 0} heads`;
  const bits = [`School ${money(d.amount)}`];
  const st = schoolStudents(d);
  if (st != null) bits.push(`${st} school`);
  const priv = [d.p1 && `${d.p1}×1`, d.p2 && `${d.p2}×2`, d.p3 && `${d.p3}×3`].filter(Boolean);
  if (priv.length) bits.push(`private ${priv.join(', ')}`);
  if (d.trials) bits.push(`${d.trials} trial`);
  if (d.outside) bits.push(`${d.outside} outside`);
  return bits.join(' · ');
}

function WeekDetail({ days, w, label }) {
  const { totals, days: n } = locationTotals(days, w.start, w.end);
  const grand = totals.CC + totals.WWW + totals.JE;
  const max = Math.max(totals.CC, totals.WWW, totals.JE, 1);
  return (
    <div className="wk-detail">
      <div className="wd-head">
        <b>
          {label} · {grand} student{grand === 1 ? '' : 's'}
        </b>
        <span className="muted small">
          {shortD(w.start)} to {shortD(w.end)}
        </span>
      </div>
      {LOCATIONS.map((l) => (
        <div key={l} className="wk-loc-row">
          <span>{l}</span>
          <span className="wk-track">
            <i style={{ width: `${(totals[l] / max) * 100}%`, background: LOC_COLORS[l] }} />
          </span>
          <b>{totals[l]}</b>
        </div>
      ))}
      <p className="muted small">{n ? `${n} swim day${n === 1 ? '' : 's'} logged in this week.` : 'No swim days logged in this week yet.'}</p>
    </div>
  );
}

// Paste the payslip and check it against what was logged; saved per month.
function PayslipCard({ path, saved, days, y, m, monthKey }) {
  const [text, setText] = useState(saved?.text || '');
  const [basis, setBasis] = useState(saved?.basis || 'school');
  const [result, setResult] = useState(() => (saved?.text ? checkPayslip(saved.text, days, y, m, saved.basis || 'school') : null));
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [loadedFor, setLoadedFor] = useState(monthKey);
  if (loadedFor !== monthKey) {
    // Another month in the top bar: show that month's saved slip.
    setLoadedFor(monthKey);
    setText(saved?.text || '');
    setBasis(saved?.basis || 'school');
    setResult(saved?.text ? checkPayslip(saved.text, days, y, m, saved.basis || 'school') : null);
    setNote('');
  }

  async function run(b = basis) {
    const r = checkPayslip(text, days, y, m, b);
    setResult(r);
    if (!r) return setNote('Nothing readable yet. One line per day, like “5 Nov 184.00”, or paste the payslip page.');
    setNote('');
    await setPath(`${path}/payslips/${monthKey}`, { text, basis: b, checkedAt: new Date().toISOString(), issues: r.issues, slipTotal: r.slipTotal, logTotal: r.logTotal });
  }
  async function clear() {
    setText('');
    setResult(null);
    setNote('');
    await setPath(`${path}/payslips/${monthKey}`, null);
  }
  const dayLbl = (d) => `${DAY_LABELS[dayKeyOf(d)].slice(0, 3)} ${Number(d.slice(8, 10))}`;
  const gap = result ? result.logTotal - result.slipTotal : 0;
  const issueCount = result ? result.diffs.length + result.missingInLog.length + result.missingInSlip.length : 0;

  return (
    <section className="home-card">
      <button className="payslip-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h2>Payslip check</h2>
        <span className="muted small">{saved ? (saved.issues ? `${saved.issues} to fix` : 'All match') : 'Not checked yet'}</span>
        <span className={`cr-chev ${open ? 'open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <>
      <p className="muted small">Paste the whole payslip page as it is (class by class), or key it in as date amount, one per line. It’s checked against what you logged this month.</p>
      <textarea className="import-text payslip-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Group class (Kid)\n5 Nov 2026, 15:00\n3\t24\t56\n\nor: 5 Nov 184.00'} />
      <div className="seg" role="group" aria-label="Compare with">
        {[
          ['school', 'School only'],
          ['all', 'With outside'],
        ].map(([k, l]) => (
          <button
            key={k}
            className={basis === k ? 'on' : ''}
            onClick={() => {
              setBasis(k);
              if (text.trim()) run(k);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="row-gap">
        <button className="btn primary sm" onClick={() => run()} disabled={!text.trim()}>
          Check against my log
        </button>
        <button className="btn ghost sm" onClick={clear}>
          Clear
        </button>
      </div>
      {note && <p className="muted small">{note}</p>}
      {result && (
        <div className="payslip-result">
          <div className="dh-split three">
            <Cell k="Payslip" v={money(result.slipTotal)} />
            <Cell k="You logged" v={money(result.logTotal)} />
            <Cell k="Difference" v={`${gap >= 0 ? '+' : '−'}${money(Math.abs(gap))}`} cls={Math.abs(gap) < 0.005 ? 'grab' : 'coral'} />
          </div>
          <p className={`ps-verdict ${issueCount ? 'off' : 'ok'}`}>{issueCount ? `${issueCount} day${issueCount === 1 ? '' : 's'} to look at.` : `Every one of the ${result.slipDates.length} days matches.`}</p>
          {result.table && (
            <>
              <p className="section-label">The payslip’s own sums</p>
              <p className={`ps-verdict ${result.table.payIssues.length + result.table.totalIssues.length ? 'off' : 'ok'}`}>
                {result.table.payIssues.length + result.table.totalIssues.length
                  ? `${result.table.payIssues.length + result.table.totalIssues.length} thing(s) on the slip don’t add up.`
                  : `${result.table.classes.length} classes, ${result.table.sessions} sessions: every payout and class total adds up.`}
              </p>
              {result.table.payIssues.map((r, i) => (
                <PsRow key={`p${i}`} d={dayLbl(r.s.date)} w={`${r.cls.title} · ${r.s.students} student(s) paid ${money(r.s.payout)}, should be ${money(r.exp)}`} g={r.s.payout - r.exp} />
              ))}
              {result.table.totalIssues.map((c, i) => (
                <PsRow key={`t${i}`} d={dayLbl(c.sessions[0].date)} w={`${c.title} · slip total ${money(c.stated)}, sessions add to ${money(c.sum)}`} g={c.stated - c.sum} />
              ))}
              {(result.table.noTotal > 0 || result.table.computedRows > 0) && (
                <p className="muted small">
                  {[result.table.noTotal && `${result.table.noTotal} class(es) had no total shown, worked out from the sessions`, result.table.computedRows && `${result.table.computedRows} session(s) had no payout shown, priced from the student count`].filter(Boolean).join('. ')}.
                </p>
              )}
            </>
          )}
          {result.diffs.length > 0 && <p className="section-label">Amount doesn’t match</p>}
          {result.diffs.map((r) => (
            <PsRow key={r.date} d={dayLbl(r.date)} w={`slip ${money(r.slip)} · logged ${money(r.log)}`} g={r.gap} />
          ))}
          {result.missingInLog.length > 0 && <p className="section-label">On the payslip, not in your log</p>}
          {result.missingInLog.map((r) => (
            <PsRow key={r.date} d={dayLbl(r.date)} w={`slip ${money(r.amount)}, nothing keyed in`} tag="missing" />
          ))}
          {result.missingInSlip.length > 0 && <p className="section-label">In your log, not on the payslip</p>}
          {result.missingInSlip.map((r) => (
            <PsRow key={r.date} d={dayLbl(r.date)} w={`logged ${money(r.amount)}, not paid on this slip`} tag="extra" />
          ))}
          <p className="muted small">Checked against {basis === 'all' ? 'the school total plus outside lessons' : 'the school total only, outside lessons left out'}.</p>
        </div>
      )}
        </>
      )}
    </section>
  );
}

function PsRow({ d, w, g, tag }) {
  return (
    <div className="ps-row">
      <span className="hr-d">{d}</span>
      <span className="ps-w">{w}</span>
      {tag ? <span className="ps-g miss">{tag}</span> : <span className={`ps-g ${g > 0 ? 'up' : 'down'}`}>{`${g > 0 ? '+' : '−'}${money(Math.abs(g))}`}</span>}
    </div>
  );
}
