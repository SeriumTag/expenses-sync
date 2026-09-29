import { useMemo, useState } from 'react';
import { addItems, addTab } from '../lib/db';
import { FREQS as PERIODS } from '../lib/budget';
import { formatMoney, parseSheet } from '../lib/format';
import Modal from './Modal';

/**
 * Paste rows copied from Excel / Google Sheets. Each titled section of the
 * sheet ("Hamizan", "Kelly", …) goes into a tab of that name, created if needed;
 * untitled rows go into the tab you're on.
 */
// "Monthly" / "Yearly" / "Annual" in the amount column's header row.
function headerPeriod(text) {
  for (const line of text.split(/\r?\n/).slice(0, 40)) {
    const col = (line.split('\t')[1] || '').trim();
    if (/^(yearly|annual(ly)?|per year|per annum)$/i.test(col)) return 'yearly';
    if (/^(monthly|per month)$/i.test(col)) return 'monthly';
  }
  return null;
}

export default function ImportDialog({ base, tabId, tabName, tabs, username, currency, view, onImported, onClose }) {
  const [text, setText] = useState('');
  // Most sheets list monthly amounts; the header row, if any, decides.
  const [period, setPeriod] = useState('monthly');
  const [skipped, setSkipped] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sections = useMemo(() => parseSheet(text), [text]);
  const chosen = sections.filter((_, i) => !skipped.has(i));
  const rowCount = chosen.reduce((n, s) => n + s.rows.length, 0);
  const total = chosen.reduce((sum, s) => sum + s.rows.reduce((a, r) => a + r.amount, 0), 0);

  const existingTab = (title) => tabs.find((t) => (t.name || '').trim().toLowerCase() === title.trim().toLowerCase());
  const targetLabel = (s) => {
    if (!s.title) return `→ ${tabName || 'this tab'}`;
    return existingTab(s.title) ? `→ adds to “${s.title}”` : '→ new tab';
  };

  const toggle = (i) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  async function importRows() {
    setBusy(true);
    setError('');
    try {
      let firstTab = null;
      const start = Date.now();
      await Promise.all(
        chosen.map((s, i) => {
          const target = !s.title ? tabId : existingTab(s.title)?.id || addTab(base, s.title, start + i);
          firstTab ??= target;
          return addItems(base, target, username, s.rows, period);
        }),
      );
      onImported?.(firstTab);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Paste from sheet" onClose={onClose}>
      <p className="muted small">
        In Excel or Google Sheets, select your cells (item, amount, category, notes) and copy, then paste below. Each
        titled section, like <b>Kelly</b> or <b>Combined Account</b>, becomes its own tab. TOTAL rows are skipped.
      </p>
      <textarea
        className="paste-box"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSkipped(new Set());
          // Follow the sheet's own header ("Hamizan | Monthly | Category").
          const said = headerPeriod(e.target.value);
          if (said) setPeriod(said);
        }}
        placeholder={'Hamizan\tMonthly\tCategory\nGiga\t25.00\tPhone\nCar Repayment\t1932.00\tCar'}
        rows={6}
        autoFocus
        spellCheck={false}
      />

      <div className="import-period">
        <span className="muted small">These amounts are</span>
        <div className="seg" role="group" aria-label="Amounts are">
          {Object.entries(PERIODS).map(([key, p]) => (
            <button key={key} className={period === key ? 'on' : ''} aria-pressed={period === key} onClick={() => setPeriod(key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {sections.length > 0 && (
        <div className="import-preview">
          {sections.map((s, i) => {
            const sub = s.rows.reduce((a, r) => a + r.amount, 0);
            const on = !skipped.has(i);
            return (
              <div key={i} className={`import-section ${on ? '' : 'off'}`}>
                <label className="import-section-head">
                  <input type="checkbox" checked={on} onChange={() => toggle(i)} />
                  <b>{s.title || tabName || 'This tab'}</b>
                  <span className="muted small">{targetLabel(s)}</span>
                  <span className="import-sub">{formatMoney(sub, currency)}</span>
                </label>
                {on &&
                  s.rows.map((r, j) => (
                    <div key={j} className="import-row">
                      <span className="import-name">
                        {r.name}
                        {r.category && <span className="muted small"> · {r.category}</span>}
                        {r.note && <span className="muted small"> · 📝</span>}
                      </span>
                      <span>{formatMoney(r.amount, currency)}</span>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}
      {text.trim() && sections.length === 0 && (
        <p className="error">No rows found. Copy the cells themselves (not a screenshot), with the amount in the 2nd column.</p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="row-gap end">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!rowCount || busy} onClick={importRows}>
          {busy
            ? 'Adding…'
            : rowCount
              ? `Add ${rowCount} item${rowCount === 1 ? '' : 's'} · ${formatMoney(total, currency)}${PERIODS[period].short}`
              : 'Add items'}
        </button>
      </div>
    </Modal>
  );
}
