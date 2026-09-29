import { useState } from 'react';
import { MONTHS, isYearKey, monthKey, periodLabel, previousPeriod, sumTab, yearOf } from '../lib/budget';
import { copyPeriod, deletePeriod, startEmptyPeriod } from '../lib/db';
import { formatMoney } from '../lib/format';
import Modal from './Modal';

const periodTotal = (p) => Object.values(p?.items || {}).reduce((s, items) => s + sumTab(items), 0);

// Pick a month or a whole year, create one (copied or empty), or copy the
// current budget to other months/years.
export default function PeriodSheet({ ledgerId, periods, current, currency, onSelect, onClose }) {
  const keys = Object.keys(periods);
  const [year, setYear] = useState(yearOf(current));
  const [pending, setPending] = useState(null); // a period that doesn't exist yet
  const [copying, setCopying] = useState(false);
  const [targets, setTargets] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const tiles = [{ key: String(year), label: 'Whole year' }, ...MONTHS.map((m, i) => ({ key: monthKey(year, i), label: m }))];

  function tap(key) {
    if (copying) {
      if (key === current) return;
      setTargets((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    } else if (periods[key]) {
      onSelect(key);
      onClose();
    } else setPending(key);
  }

  async function create(from) {
    setBusy(true);
    if (from) await copyPeriod(ledgerId, periods[from], [pending]);
    else await startEmptyPeriod(ledgerId, pending);
    onSelect(pending);
    onClose();
  }

  async function copyToTargets() {
    const list = [...targets];
    const existing = list.filter((k) => periods[k]);
    if (existing.length && !window.confirm(`Replace what’s already in ${existing.map(periodLabel).join(', ')}?`)) return;
    setBusy(true);
    await copyPeriod(ledgerId, periods[current], list);
    setBusy(false);
    setCopying(false);
    setTargets(new Set());
  }

  async function removeCurrent() {
    if (keys.length <= 1) return;
    if (!window.confirm(`Delete the whole budget for ${periodLabel(current)}? Other months stay as they are.`)) return;
    const next = keys.filter((k) => k !== current).sort().at(-1);
    onSelect(next);
    onClose();
    await deletePeriod(ledgerId, current);
  }

  const copyFrom = pending ? previousPeriod(pending, keys) || current : null;

  return (
    <Modal title={copying ? 'Copy this budget to…' : 'Choose month or year'} onClose={onClose}>
      <div className="year-step">
        <button className="icon-btn" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
          ‹
        </button>
        <b>{year}</b>
        <button className="icon-btn" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
          ›
        </button>
      </div>

      <div className="period-grid">
        {tiles.map((t) => {
          const exists = Boolean(periods[t.key]);
          const cls = [
            'period-tile',
            isYearKey(t.key) ? 'year' : '',
            exists ? 'exists' : '',
            t.key === current ? 'current' : '',
            targets.has(t.key) ? 'target' : '',
            pending === t.key ? 'pending' : '',
          ].join(' ');
          return (
            <button key={t.key} className={cls} onClick={() => tap(t.key)} disabled={busy}>
              <span>{t.label}</span>
              <small>{exists ? formatMoney(periodTotal(periods[t.key]), currency) : copying ? '' : '＋'}</small>
            </button>
          );
        })}
      </div>

      {pending && !copying && (
        <div className="period-new">
          <p>
            <b>{periodLabel(pending)}</b> has no budget yet.
          </p>
          <div className="row-gap">
            <button className="btn primary" disabled={busy} onClick={() => create(copyFrom)}>
              Copy from {periodLabel(copyFrom)}
            </button>
            <button className="btn glass" disabled={busy} onClick={() => create(null)}>
              Start empty
            </button>
          </div>
        </div>
      )}

      <div className="period-actions">
        {copying ? (
          <>
            <span className="muted small">
              {targets.size ? `${targets.size} selected` : `Tap the months or years to copy ${periodLabel(current)} into.`}
            </span>
            <div className="row-gap">
              <button
                className="btn ghost sm"
                onClick={() => {
                  setCopying(false);
                  setTargets(new Set());
                }}
              >
                Cancel
              </button>
              <button className="btn primary sm" disabled={!targets.size || busy} onClick={copyToTargets}>
                Copy
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              className="btn glass sm"
              onClick={() => {
                setCopying(true);
                setPending(null);
              }}
            >
              Copy {periodLabel(current)} to…
            </button>
            {keys.length > 1 && (
              <button className="btn danger sm" onClick={removeCurrent}>
                Delete {periodLabel(current)}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
