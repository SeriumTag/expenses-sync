import { useEffect, useRef } from 'react';
import { catStyle } from '../lib/catStyle';

// Every category as a chip (like genres); the one picked shows its page below.
// categories: [{ key, label, count, spendCount }] — favourites (★) come first.
export default function CategoriesScreen({ categories, favs, selected, onSelect, children }) {
  const chipsRef = useRef(null);
  const ordered = [...categories].sort((a, b) => Boolean(favs?.[b.key]) - Boolean(favs?.[a.key]));

  // Keep the picked chip in view when it changes from elsewhere (e.g. a link on the page).
  useEffect(() => {
    chipsRef.current?.querySelector('.cat-chip-btn.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);

  return (
    <div className="cats-screen">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Categories</h1>
          <span className="muted small">
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} · tap one to see what’s in it
          </span>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="empty-card">
          <span className="empty-ico">🏷️</span>
          <p className="muted">No categories yet. Give a bill or a spend a category and it shows up here.</p>
        </div>
      ) : (
        <div className="cat-chip-grid" ref={chipsRef} role="tablist" aria-label="Categories">
          {ordered.map((c) => {
            const st = catStyle(c.label);
            const n = (c.count || 0) + (c.spendCount || 0);
            return (
              <button
                key={c.key}
                role="tab"
                aria-selected={selected === c.key}
                className={`cat-chip-btn ${selected === c.key ? 'on' : ''}`}
                style={{ '--cc': st.color, '--cc-bg': st.bg }}
                onClick={() => onSelect(c.key)}
              >
                <span className="ccb-ico" aria-hidden="true">
                  {favs?.[c.key]?.icon || st.icon}
                </span>
                <span className="ccb-name">{c.label}</span>
                {n > 0 && <span className="ccb-count">{n}</span>}
              </button>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
}
