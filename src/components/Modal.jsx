import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// A sheet over everything (rendered at the end of the page, so the bottom
// tab bar never covers its buttons). dirty: there's unsaved typing, so
// closing asks first instead of silently dropping it.
export default function Modal({ title, onClose, dirty = false, children }) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const close = useRef(null);
  const backdrop = useRef(null);
  close.current = () => {
    if (dirtyRef.current && !window.confirm('Close without saving? What you typed will be lost.')) return;
    onClose();
  };

  useEffect(() => {
    // Escape closes only the topmost sheet.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const all = document.querySelectorAll('.backdrop');
      if (all[all.length - 1] === backdrop.current) close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div ref={backdrop} className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close.current()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={() => close.current()} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
