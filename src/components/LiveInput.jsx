import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePresenceCtx } from '../hooks/usePresence';

// Keystrokes are sent at most this often, so the other person sees typing live
// without flooding the connection.
const SEND_EVERY_MS = 80;

const identity = (v) => v;
const toText = (v) => String(v ?? '');

/**
 * An input bound to one database field.
 * - While you're focused it keeps a local draft (no cursor jumps) and streams changes.
 * - It announces "editing" via presence; the other person's copy becomes read-only
 *   and shows who holds it.
 */
export default function LiveInput({
  fieldKey,
  value,
  onSave,
  parse = identity,
  format = toText,
  display,
  className = '',
  autoFocusOnMount = false,
  multiline = false,
  ...inputProps
}) {
  const { me, lockFor, setEditing, colorFor } = usePresenceCtx();
  const lock = lockFor(fieldKey);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const focusedRef = useRef(false);
  const mySince = useRef(0);
  const pending = useRef(undefined);
  const timer = useRef(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (pending.current === undefined) return;
    const v = pending.current;
    pending.current = undefined;
    Promise.resolve(saveRef.current(v)).catch(() => {});
  }, []);

  const claim = () => {
    focusedRef.current = true;
    setDraft(format(value));
    setFocused(true);
    mySince.current = setEditing(fieldKey);
  };

  const release = () => {
    if (!focusedRef.current) return;
    focusedRef.current = false;
    flush();
    setFocused(false);
    setEditing(null);
  };

  // Unmounting while focused (e.g. the row was deleted) must still send the
  // last keystrokes and release the lock.
  useEffect(
    () => () => {
      flush();
      if (focusedRef.current) setEditing(null);
    },
    [flush, setEditing],
  );

  useEffect(() => {
    if (!autoFocusOnMount) return;
    inputRef.current?.focus();
    try {
      inputRef.current?.select();
    } catch {
      /* not selectable (e.g. date) */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Both of us grabbed this field at the same moment: the earlier one keeps it.
    if (focused && lock) {
      const theyWin = lock.since < mySince.current || (lock.since === mySince.current && lock.user < me);
      if (theyWin) inputRef.current?.blur();
    }
    // The lock was released while my cursor was already parked in the field: take it.
    if (!lock && !focusedRef.current && document.activeElement === inputRef.current) claim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, lock?.user, lock?.since]);

  const onFocus = () => {
    if (!lock) claim();
  };

  const onChange = (e) => {
    if (!focusedRef.current) return;
    const text = e.target.value;
    setDraft(text);
    const parsed = parse(text);
    if (parsed === undefined) return;
    pending.current = parsed;
    if (!timer.current) timer.current = setTimeout(flush, SEND_EVERY_MS);
  };

  const shown = focused ? draft : (display || format)(value);
  const Field = multiline ? 'textarea' : 'input';

  // Multi-line notes grow to fit their text, including lines that wrap.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!multiline || !el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [multiline, shown]);

  return (
    <span
      className={`live ${className} ${lock ? 'is-locked' : ''} ${focused ? 'is-mine' : ''}`}
      style={lock ? { '--c': colorFor(lock.user) } : undefined}
    >
      <Field
        ref={inputRef}
        aria-label={inputProps.placeholder}
        {...inputProps}
        {...(multiline ? { rows: 1 } : {})}
        value={shown}
        readOnly={Boolean(lock) && !focused}
        onFocus={onFocus}
        onBlur={release}
        onChange={onChange}
        onKeyDown={(e) => {
          // In a multi-line note, Enter adds a new line; Escape still finishes.
          if (e.key === 'Escape' || (e.key === 'Enter' && !multiline)) e.currentTarget.blur();
        }}
      />
      {lock && <span className="lock-tag">🔒 {lock.user} is editing</span>}
    </span>
  );
}
