import { useEffect, useState } from 'react';
import { prefs } from '../lib/session';

const DISMISS_DAYS = 14;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Anything can open the sheet again (e.g. the profile menu) by dispatching this.
export const showInstallPrompt = () => window.dispatchEvent(new Event('show-install'));

function ShareIcon() {
  return (
    <svg className="ios-share" viewBox="0 0 24 24" width="18" height="18" aria-label="Share">
      <path
        d="M12 3v12M12 3l-4 4M12 3l4 4M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (isStandalone()) return;

    const onManual = () => setShow(true);
    window.addEventListener('show-install', onManual);

    const onInstallable = (e) => {
      e.preventDefault();
      setDeferred(e);
      if (!(prefs.get('install-dismissed-until') > Date.now())) setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onInstallable);

    let timer;
    if (ios && !(prefs.get('install-dismissed-until') > Date.now())) timer = setTimeout(() => setShow(true), 3000);

    return () => {
      window.removeEventListener('show-install', onManual);
      window.removeEventListener('beforeinstallprompt', onInstallable);
      clearTimeout(timer);
    };
  }, [ios]);

  if (!show || isStandalone()) return null;

  const dismiss = () => {
    prefs.set('install-dismissed-until', Date.now() + DISMISS_DAYS * 86400000);
    setShow(false);
  };

  return (
    <div className="install-sheet" role="dialog" aria-label="Install the app">
      <img src="/apple-touch-icon.png" className="install-icon" alt="" />
      <div className="install-text">
        <b>Get the Expense Sync app</b>
        {ios ? (
          <span>
            Tap <ShareIcon /> <b>Share</b> below, then <b>Add to Home Screen</b>
          </span>
        ) : deferred ? (
          <span>Install it for full-screen, one-tap access.</span>
        ) : (
          <span>Use your browser menu → Install app / Add to Home screen.</span>
        )}
      </div>
      {deferred && (
        <button
          className="btn primary sm"
          onClick={async () => {
            deferred.prompt();
            await deferred.userChoice.catch(() => {});
            setDeferred(null);
            setShow(false);
          }}
        >
          Install
        </button>
      )}
      <button className="icon-btn" onClick={dismiss} aria-label="Not now">
        ✕
      </button>
      {ios && <span className="install-arrow" aria-hidden="true" />}
    </div>
  );
}
