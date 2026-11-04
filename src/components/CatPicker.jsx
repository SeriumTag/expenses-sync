import { useState } from 'react';
import { splitCats } from '../lib/budget';

// Choose categories from the ones that already exist (for someone who can't
// create new ones): the current ones as chips, and a list to tick.
// Saves the same "Insurance, Kids" text as typing would.
export default function CatPicker({ value, options = [], onSave, disabled, className = '', single = false }) {
  const [open, setOpen] = useState(false);
  const cats = splitCats(value);
  const has = (c) => cats.some((x) => x.toLowerCase() === c.toLowerCase());
  const toggle = (c) => {
    if (single) {
      onSave(has(c) ? '' : c);
      setOpen(false);
      return;
    }
    const next = has(c) ? cats.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...cats, c];
    onSave(next.join(', '));
  };

  return (
    <div className={`cat-picker ${className}`}>
      <div className="cp-chips">
        {cats.map((c) => (
          <span key={c} className="cat-chip">
            {c}
          </span>
        ))}
        <button type="button" className="btn ghost sm cp-btn" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open}>
          {cats.length ? 'Change' : '＋ Choose'}
        </button>
      </div>
      {open && (
        <div className="cp-list" role="listbox" aria-label="Categories">
          {options.length === 0 ? (
            <p className="muted small">No categories yet. Only the account owner can add new ones.</p>
          ) : (
            options.map((c) => (
              <label key={c} className={`cp-opt ${has(c) ? 'on' : ''}`}>
                <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} />
                {c}
              </label>
            ))
          )}
          <button type="button" className="btn glass sm" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
