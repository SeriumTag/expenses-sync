import { useMemo, useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { newKey, setPath } from '../../lib/db';
import { FIELDS, METRICS, bmiCategory, fmt, latestWithDelta, parseBackupReadings, parsePasted, readingsOf } from '../../lib/weight';
import Modal from '../Modal';
import ImportBackup, { backupStores, countText } from './ImportBackup';
import ScanSheet from './ScanSheet';
import ScaleIcon from './ScaleIcon';
import TrendChart, { Sparkline } from './TrendChart';

const today = () => new Date().toLocaleDateString('en-CA');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortD = (s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;

// One person's weight log: the latest reading, body composition, the trend
// and every reading — added by hand, from pasted text or from scale photos.
export default function WeightScreen({ ledgerId, personId, personName, data, onBack, onRemove }) {
  const path = `ledgers/${ledgerId}/weight/${personId}`;
  const readings = useMemo(() => readingsOf(data), [data]);
  const head = latestWithDelta(readings);
  const [sheet, setSheet] = useState(null); // { reading? }
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [focus, setFocus] = useState(null); // pin and pulse a just-saved reading on the chart

  async function save(reading, id) {
    const key = id || newKey(`${path}/readings`);
    await setPath(`${path}/readings/${key}`, reading);
    // Show it on the chart: the metric it has (weight first), pinned and pulsing.
    const metric = METRICS.find((m) => reading[m.key] != null)?.key;
    setFocus({ metric, date: reading.date, at: Date.now() });
  }

  const comp = [
    { key: 'bodyAge', label: 'Body age', dec: 0, suffix: '', color: 'var(--coral)' },
    { key: 'fat', label: 'Body fat', dec: 1, suffix: '%', color: 'var(--peach)' },
    { key: 'muscle', label: 'Muscle mass', dec: 1, suffix: '%', color: 'var(--mint)' },
    { key: 'visceral', label: 'Visceral fat', dec: 1, suffix: '', color: 'var(--pink)' },
  ];

  function planImport(raw) {
    const found = parseBackupReadings(backupStores(raw));
    const patch = {};
    Object.entries(found).forEach(([id, r]) => {
      if (!data?.readings?.[id]) patch[`readings/${id}`] = r;
    });
    return { patch, summary: countText(Object.keys(patch).length, 'reading', 'readings') };
  }

  return (
    <div className="drive extra-page">
      <div className="drive-head">
        <button className="btn ghost sm back" onClick={onBack}>
          ‹ Back
        </button>
        <span className="list-menu-wrap">
          <button className="btn ghost sm" onClick={() => setMenu((o) => !o)} aria-expanded={menu} aria-label="Weight log options">
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
        <span className="extra-badge weight">
          <ScaleIcon size={24} />
        </span>
        <div>
          <h1 className="screen-title">Weight log</h1>
          <span className="muted small">{personName ? `${personName}’s readings` : 'Readings'}</span>
        </div>
      </div>

      <div className="row-gap">
        <button className="btn primary" onClick={() => setSheet({})}>
          ＋ Add reading
        </button>
        <button className="btn glass" onClick={() => setScanning(true)}>
          📷 Scan photos
        </button>
      </div>

      {/* Latest reading */}
      <section className="home-card weight-hero">
        {!head ? (
          <p className="muted">No readings yet. Add your first one, paste in what the scale says, or scan photos of it.</p>
        ) : (
          <>
            <div className="wh-weight">
              <b>{fmt(head.latest.weight, 1)}</b>
              <span className="wh-unit">kg</span>
              {head.delta &&
                (head.delta.diff === 0 ? (
                  <span className="wh-delta flat">No change {head.delta.label}</span>
                ) : (
                  <span className={`wh-delta ${head.delta.diff > 0 ? 'up' : 'down'}`}>
                    {head.delta.diff > 0 ? '+' : '−'}
                    {fmt(Math.abs(head.delta.diff), 1)} kg {head.delta.label}
                  </span>
                ))}
            </div>
            <p className="wh-sub">
              {head.latest.bmi != null ? (
                <>
                  BMI {fmt(head.latest.bmi, 1)} <span className={`wh-cat ${bmiCategory(head.latest.bmi).high ? 'high' : ''}`}>{bmiCategory(head.latest.bmi).text}</span>
                </>
              ) : (
                'No BMI logged for this reading'
              )}{' '}
              · {shortD(head.latest.date)}
            </p>
          </>
        )}
      </section>

      {/* Body composition */}
      {readings.length > 0 && (
        <section className="home-card">
          {comp.map((r) => {
            const withVal = readings.filter((x) => x[r.key] != null);
            const last = withVal[withVal.length - 1];
            const kg = (r.key === 'fat' || r.key === 'muscle') && last?.weight != null ? (last.weight * last[r.key]) / 100 : null;
            return (
              <div key={r.key} className="metric-row">
                <span className="mr-dot" style={{ background: r.color }} />
                <span className="mr-label">{r.label}</span>
                <span className="mr-val">
                  {last ? `${fmt(last[r.key], r.dec)}${r.suffix}` : '—'}
                  {kg != null && <span className="mr-kg">{fmt(kg, 1)} kg</span>}
                </span>
                <Sparkline values={withVal.map((x) => x[r.key])} color={r.color} />
              </div>
            );
          })}
        </section>
      )}

      {/* Trend */}
      <section className="home-card">
        <div className="home-card-head">
          <h2>Trend</h2>
          <span className="muted small">tap a point to pin its value</span>
        </div>
        <TrendChart
          metrics={METRICS.map((m) => ({ ...m, format: (v) => `${fmt(v, m.dec)}${m.suffix}` }))}
          rows={readings}
          focus={focus}
          emptyText="Log at least two readings to see a trend line."
        />
      </section>

      {/* History */}
      <section className="home-card">
        <div className="home-card-head">
          <h2>History</h2>
          <span className="muted small">{countText(readings.length, 'reading', 'readings')}</span>
        </div>
        {readings.length === 0 ? (
          <p className="muted small">Nothing logged yet.</p>
        ) : (
          <div className="history">
            {[...readings]
              .reverse()
              .slice(0, 15)
              .map((r) => (
                <button key={r.id} className="history-row" onClick={() => setSheet({ reading: r })}>
                  <span className="hr-d">{shortD(r.date)}</span>
                  <span className="hr-v">{summary(r)}</span>
                  <span className="rr-e">✎</span>
                </button>
              ))}
          </div>
        )}
      </section>

      <button className="link-btn extra-remove" onClick={onRemove}>
        Remove the Weight log from {personName || 'this person'}
      </button>

      {sheet && <ReadingSheet reading={sheet.reading} onSave={save} onDelete={(id) => setPath(`${path}/readings/${id}`, null)} onClose={() => setSheet(null)} />}
      {scanning && <ScanSheet onSave={(r) => save(r)} onClose={() => setScanning(false)} />}
      {importing && <ImportBackup path={path} what="your weight readings" plan={planImport} onClose={() => setImporting(false)} />}
    </div>
  );
}

function summary(r) {
  const parts = [];
  if (r.weight != null) parts.push(`${fmt(r.weight, 1)}kg`);
  if (r.bmi != null) parts.push(`BMI ${fmt(r.bmi, 1)}`);
  if (r.fat != null) parts.push(`fat ${fmt(r.fat, 1)}%`);
  if (r.muscle != null) parts.push(`muscle ${fmt(r.muscle, 1)}%`);
  if (r.visceral != null) parts.push(`visc ${fmt(r.visceral, 1)}`);
  if (r.bodyAge != null) parts.push(`age ${fmt(r.bodyAge, 0)}`);
  return parts.join(' · ');
}

const LABELS = { weight: 'Weight (kg)', bmi: 'BMI', bodyAge: 'Body age', fat: 'Body fat (%)', muscle: 'Muscle mass (%)', visceral: 'Visceral fat' };

// Add or edit one reading; paste what the scale app says to fill the boxes.
function ReadingSheet({ reading, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => ({ date: reading?.date || today(), ...Object.fromEntries(FIELDS.map((f) => [f, reading?.[f] != null ? String(reading[f]) : ''])) }));
  const [start] = useState(() => JSON.stringify(form)); // to tell if anything was typed
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState('');

  function fill() {
    const found = parsePasted(paste);
    if (!Object.keys(found).length) return setNote('Couldn’t find any values — try e.g. “weight 72.4 fat 21.3”.');
    setForm((f) => ({ ...f, ...found }));
    setNote('Fields filled from the pasted text — check them, then save.');
  }

  async function submit(e) {
    e.preventDefault();
    const out = { date: /^\d{4}-\d{2}-\d{2}$/.test(form.date) ? form.date : today() };
    let any = false;
    for (const f of FIELDS) {
      const v = form[f].trim() === '' ? null : parseFloat(form[f]);
      out[f] = v != null && !Number.isNaN(v) ? v : null;
      if (out[f] != null) any = true;
    }
    if (!any) return setNote('Enter at least one value before saving.');
    await onSave(out, reading?.id);
    onClose();
  }

  async function remove() {
    if (!confirmTwice(`Remove the reading from ${shortD(reading.date)}?`, 'this reading')) return;
    await onDelete(reading.id);
    onClose();
  }

  return (
    <Modal title={reading ? 'Edit reading' : 'Add reading'} onClose={onClose} dirty={JSON.stringify(form) !== start || Boolean(paste.trim())}>
      <form className="sheet drive-form" onSubmit={submit}>
        <div className="drive-grid">
          <label className="field full">
            <span>Date</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          {FIELDS.map((f) => (
            <label key={f} className="field">
              <span>{LABELS[f]}</span>
              <input inputMode="decimal" value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} autoFocus={!reading && f === 'weight'} />
            </label>
          ))}
        </div>
        <details className="paste-fill">
          <summary>Paste text to fill</summary>
          <textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="e.g. Weight 72.4 BMI 23.1 Body fat 21.3 Muscle 34.2 Visceral 8 Body age 35" />
          <button type="button" className="btn glass sm" onClick={fill}>
            Fill the boxes
          </button>
        </details>
        {note && <p className="muted small">{note}</p>}
        <div className="row-gap end">
          {reading && (
            <button type="button" className="btn danger-outline sm" onClick={remove}>
              Remove
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">{reading ? 'Save changes' : 'Save reading'}</button>
        </div>
      </form>
    </Modal>
  );
}
