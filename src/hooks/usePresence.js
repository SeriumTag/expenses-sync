import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onDisconnect, onValue, push, ref, remove, serverTimestamp, set, update } from 'firebase/database';
import { db } from '../firebase';

export const PresenceContext = createContext(null);
export const usePresenceCtx = () => useContext(PresenceContext);

/**
 * Each open browser tab registers one connection node under
 * presence/{ledgerId}/{username}. The server deletes it automatically when the
 * connection drops (onDisconnect), so "online" and "editing" never get stuck.
 */
export function usePresence(ledgerId, me) {
  const [others, setOthers] = useState({});
  const connRef = useRef(null);
  const live = useRef(false);
  const local = useRef({ tab: null, editing: null, since: 0 });

  useEffect(() => {
    const cref = push(ref(db, `presence/${ledgerId}/${me}`));
    connRef.current = cref;
    live.current = false;

    const offConnected = onValue(ref(db, '.info/connected'), (snap) => {
      if (snap.val() !== true) {
        live.current = false;
        return;
      }
      onDisconnect(cref)
        .remove()
        .then(() => set(cref, { ...local.current, at: serverTimestamp() }))
        .then(() => {
          if (connRef.current !== cref) return;
          live.current = true;
          // Catch anything that changed while the set() was in flight.
          return update(cref, { ...local.current });
        })
        .catch(() => {});
    });

    const offPresence = onValue(ref(db, `presence/${ledgerId}`), (snap) => {
      const next = {};
      snap.forEach((userSnap) => {
        if (userSnap.key === me) return;
        const conns = Object.values(userSnap.val() || {});
        if (!conns.length) return;
        next[userSnap.key] = {
          tab: conns.find((c) => c.tab)?.tab ?? null,
          editing: conns.filter((c) => c.editing).map((c) => ({ key: c.editing, since: c.since || 0 })),
        };
      });
      setOthers(next);
    });

    return () => {
      offConnected();
      offPresence();
      connRef.current = null;
      live.current = false;
      onDisconnect(cref).cancel().catch(() => {});
      remove(cref).catch(() => {});
    };
  }, [ledgerId, me]);

  const publish = useCallback((patch) => {
    Object.assign(local.current, patch);
    if (live.current && connRef.current) update(connRef.current, patch).catch(() => {});
  }, []);

  const setTab = useCallback((tab) => publish({ tab: tab ?? null }), [publish]);

  const setEditing = useCallback(
    (key) => {
      const since = key ? Date.now() : 0;
      publish({ editing: key ?? null, since });
      return since;
    },
    [publish],
  );

  const lockFor = useCallback(
    (key) => {
      for (const [user, info] of Object.entries(others)) {
        const hit = info.editing.find((e) => e.key === key);
        if (hit) return { user, since: hit.since };
      }
      return null;
    },
    [others],
  );

  const colorFor = useCallback((user) => (user === me ? 'var(--me)' : 'var(--partner)'), [me]);

  return useMemo(
    () => ({ me, others, setTab, setEditing, lockFor, colorFor }),
    [me, others, setTab, setEditing, lockFor, colorFor],
  );
}
