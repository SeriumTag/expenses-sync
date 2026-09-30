import { useEffect, useRef, useState } from 'react';

// Drag to reorder (and move between groups), for touch and mouse alike.
//
// - Grab a handle (handleProps) and move a few pixels, or press and hold an
//   empty part of an item (itemProps) for a moment, then drag.
// - Groups (groupProps) are the lists you can drop into, e.g. subcategories.
// - onDrop({ id, fromGroup, toGroup, index }) — index is the new position in
//   the target group, counted without the dragged item.

const HOLD_MS = 320; // press-and-hold on an item
const HANDLE_START_PX = 4; // a handle starts dragging after this much movement
const CANCEL_PX = 8; // moving this far before the hold completes = scrolling
const EDGE_PX = 70; // auto-scroll near the top/bottom of the screen

export function useDragSort({ scope, axis = 'y', onDrop }) {
  const [draggingId, setDraggingId] = useState(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const session = useRef(null);
  const pending = useRef(null);

  // Stop listening if the list goes away mid-drag.
  useEffect(() => () => finish(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  function findTarget(x, y) {
    const s = session.current;
    const under = document.elementFromPoint(x, y);
    const groupEl = under?.closest(`[data-drop-scope="${scope}"]`);
    if (!groupEl) return null;
    const items = [...groupEl.querySelectorAll(`[data-drag-scope="${scope}"]`)].filter(
      (n) => n !== s.el && n.closest(`[data-drop-scope="${scope}"]`) === groupEl,
    );
    const pos = axis === 'y' ? y : x;
    let index = items.length;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (pos < (axis === 'y' ? r.top + r.height / 2 : r.left + r.width / 2)) {
        index = i;
        break;
      }
    }
    let line;
    if (!items.length) {
      const r = groupEl.getBoundingClientRect();
      line = { left: r.left + 8, top: r.bottom - 10, width: r.width - 16, height: 3 };
    } else if (index < items.length) {
      const r = items[index].getBoundingClientRect();
      line = axis === 'y' ? { left: r.left, top: r.top - 2, width: r.width, height: 3 } : { left: r.left - 4, top: r.top, width: 3, height: r.height };
    } else {
      const r = items[items.length - 1].getBoundingClientRect();
      line = axis === 'y' ? { left: r.left, top: r.bottom + 1, width: r.width, height: 3 } : { left: r.right + 2, top: r.top, width: 3, height: r.height };
    }
    return { group: groupEl.dataset.dropGroup, index, line };
  }

  function onMove(e) {
    const s = session.current;
    if (!s) return;
    s.ghost.style.transform = `translate(${e.clientX - s.startX}px, ${e.clientY - s.startY}px) rotate(-1deg)`;
    const t = findTarget(e.clientX, e.clientY);
    s.target = t;
    if (t) {
      Object.assign(s.line.style, { display: 'block', left: `${t.line.left}px`, top: `${t.line.top}px`, width: `${t.line.width}px`, height: `${t.line.height}px` });
      document.querySelectorAll('.drop-group-over').forEach((g) => g.classList.remove('drop-group-over'));
      document.querySelector(`[data-drop-scope="${scope}"][data-drop-group="${t.group}"]`)?.classList.add('drop-group-over');
    } else {
      s.line.style.display = 'none';
    }
    if (e.clientY < EDGE_PX) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - EDGE_PX) window.scrollBy(0, 14);
  }

  function onUp() {
    const s = session.current;
    finish(s?.target ? { id: s.id, fromGroup: s.group, toGroup: s.target.group, index: s.target.index } : null);
  }

  const blockScroll = (e) => e.preventDefault();

  function begin(el, id, group, x, y) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      zIndex: '1000',
      pointerEvents: 'none',
    });
    document.body.appendChild(ghost);
    const line = document.createElement('div');
    line.className = 'drop-line';
    document.body.appendChild(line);
    el.classList.add('drag-source');
    document.body.classList.add('dragging-now');
    // Keep the exact listener functions so they can be removed even if the
    // list re-renders during the drag.
    const handlers = { move: onMove, up: onUp, block: blockScroll };
    session.current = { id, group, el, ghost, line, startX: x, startY: y, target: null, handlers };
    setDraggingId(id);
    navigator.vibrate?.(12);
    window.addEventListener('pointermove', handlers.move);
    window.addEventListener('pointerup', handlers.up);
    window.addEventListener('pointercancel', handlers.up);
    document.addEventListener('touchmove', handlers.block, { passive: false });
    onMove({ clientX: x, clientY: y });
  }

  function finish(result) {
    clearPending();
    const s = session.current;
    if (!s) return;
    session.current = null;
    s.ghost.remove();
    s.line.remove();
    s.el.classList.remove('drag-source');
    document.body.classList.remove('dragging-now');
    document.querySelectorAll('.drop-group-over').forEach((g) => g.classList.remove('drop-group-over'));
    window.removeEventListener('pointermove', s.handlers.move);
    window.removeEventListener('pointerup', s.handlers.up);
    window.removeEventListener('pointercancel', s.handlers.up);
    document.removeEventListener('touchmove', s.handlers.block);
    // The release after a drag shouldn't also "tap" whatever was held.
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true), 350);
    setDraggingId(null);
    if (result) onDropRef.current?.(result);
  }

  function clearPending() {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    window.removeEventListener('pointermove', p.move);
    window.removeEventListener('pointerup', p.cancel);
    window.removeEventListener('pointercancel', p.cancel);
  }

  // A drag doesn't start on pointerdown: a handle waits for a small movement,
  // an item waits for a steady press (so taps and scrolling still work).
  function arm(e, id, group, viaHandle) {
    if (session.current || (e.button !== undefined && e.button !== 0)) return;
    const el = e.currentTarget.closest(`[data-drag-scope="${scope}"]`);
    if (!el) return;
    clearPending();
    const p = { x: e.clientX, y: e.clientY };
    p.cancel = () => clearPending();
    p.move = (ev) => {
      const dist = Math.hypot(ev.clientX - p.x, ev.clientY - p.y);
      if (viaHandle && dist > HANDLE_START_PX) {
        clearPending();
        begin(el, id, group, p.x, p.y);
        onMove(ev);
      } else if (!viaHandle && dist > CANCEL_PX) clearPending();
    };
    if (!viaHandle) {
      p.timer = setTimeout(() => {
        clearPending();
        begin(el, id, group, p.x, p.y);
      }, HOLD_MS);
    }
    pending.current = p;
    window.addEventListener('pointermove', p.move);
    window.addEventListener('pointerup', p.cancel);
    window.addEventListener('pointercancel', p.cancel);
  }

  return {
    draggingId,
    // The draggable thing. Press and hold on an empty part of it to drag.
    itemProps: (id, group = 'main') => ({
      'data-drag-scope': scope,
      'data-drag-id': id,
      onPointerDown: (e) => {
        // Typing fields keep their normal press; buttons and text can be held.
        if (e.target.closest('input, textarea, select, [contenteditable]')) return;
        arm(e, id, group, false);
      },
    }),
    // A grip: drag straight away.
    handleProps: (id, group = 'main') => ({
      'data-drag-handle': '',
      onPointerDown: (e) => {
        e.stopPropagation();
        arm(e, id, group, true);
      },
      onContextMenu: (e) => e.preventDefault(),
    }),
    // A list items can be dropped into.
    groupProps: (group = 'main') => ({ 'data-drop-scope': scope, 'data-drop-group': group }),
  };
}

// New order of ids after dropping `id` at `index` (index excludes `id`).
export function reordered(ids, id, index) {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}
