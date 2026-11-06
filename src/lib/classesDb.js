import { ref, runTransaction } from 'firebase/database';
import { db } from '../firebase';

// Apply a change to a person's classes record (see classes.js) as one
// transaction: change(m) edits a copy; returning false means nothing to do.
export function mutateClasses(path, change) {
  return runTransaction(ref(db, path), (cur) => {
    const m = structuredClone(cur || {});
    if (change(m) === false) return undefined;
    return m;
  });
}
