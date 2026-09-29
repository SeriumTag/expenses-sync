import { useEffect, useState } from 'react';
import { hideSplash } from '../lib/splash';
import { LogoMark } from './Logo';

const SLOW_MS = 12000;

// Shown while waiting on the server, instead of a blank page. If it takes too
// long, say what we're waiting for and offer a way out.
export default function Loading({ label = 'Loading…', detail, onSignOut }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSlow(true);
      hideSplash();
    }, SLOW_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="center-screen">
      <div className="loading-card">
        <LogoMark size={54} className="loading-mark" />
        <p className="loading-label">{slow ? 'This is taking longer than usual…' : label}</p>
        {slow && (
          <>
            <p className="muted small">
              {detail || 'Still waiting for the server.'} Check your internet connection, then try reloading.
            </p>
            <div className="row-gap center">
              <button className="btn primary sm" onClick={() => window.location.reload()}>
                Reload
              </button>
              {onSignOut && (
                <button className="btn ghost sm" onClick={onSignOut}>
                  Sign out
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
