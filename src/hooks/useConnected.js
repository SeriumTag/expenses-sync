import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebase';

// True while connected to Firebase. Short blips (and the initial handshake)
// are ignored so the offline banner doesn't flicker.
export function useConnected() {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let timer;
    const off = onValue(ref(db, '.info/connected'), (snap) => {
      clearTimeout(timer);
      if (snap.val()) setConnected(true);
      else timer = setTimeout(() => setConnected(false), 1500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  return connected;
}
