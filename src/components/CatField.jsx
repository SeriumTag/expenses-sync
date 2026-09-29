import { useState } from 'react';
import { splitCats } from '../lib/budget';
import LiveInput from './LiveInput';

// An item's categories as chips. Tap to edit them as text: "Insurance, Kids".
export default function CatField({ fieldKey, value, onSave, listId, disabled, className = '' }) {
  const [editing, setEditing] = useState(false);
  const cats = splitCats(value);

  if (editing || !cats.length) {
    return (
      <LiveInput
        className={`ep-cat ${className}`}
        fieldKey={fieldKey}
        value={value || ''}
        onSave={onSave}
        placeholder="Category"
        title="Separate several categories with commas, e.g. Insurance, Kids"
        list={listId}
        maxLength={80}
        disabled={disabled}
        autoFocusOnMount={editing}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <button
      type="button"
      className={`ep-cat cat-chips ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) setEditing(true);
      }}
      disabled={disabled}
      title="Edit categories"
    >
      {cats.map((c) => (
        <span key={c} className="cat-chip">
          {c}
        </span>
      ))}
    </button>
  );
}

// Read-only category of a merged item: its parts' shared category, or "Mixed".
export function GroupCat({ label, cats }) {
  if (!label) return null;
  return (
    <span className={`ep-cat cat-chips static`} title={cats.join(', ')}>
      <span className={`cat-chip ${label === 'Mixed' ? 'mixed' : ''}`}>{label}</span>
    </span>
  );
}
