import { useEffect, useState } from 'react';
import { prefs } from '../lib/session';

const DISMISS_DAYS = 14;
const AUTO_SHOW_MS = 4000;

// ── Where are we? ────────────────────────────────────────────────────
const ua = () => navigator.userAgent || '';
const isIOS = () => /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(ua());
const isMobile = () => isIOS() || isAndroid() || /mobi/i.test(ua());
function browserName() {
  const u = ua();
  if (/edg\//i.test(u)) return 'edge';
  if (/firefox|fxios/i.test(u)) return 'firefox';
  if (/chrome|chromium|crios/i.test(u)) return 'chrome';
  if (/safari/i.test(u)) return 'safari';
  return 'other';
}

// Running as the installed app (phone home screen, or its own window on a computer).
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
  window.matchMedia?.('(display-mode: minimal-ui)').matches ||
  window.navigator.standalone === true;

// Anything can open the guide again (e.g. the profile menu) by dispatching this.
export const showInstallPrompt = () => window.dispatchEvent(new Event('show-install'));

// How to install, step by step, for computers without a one-click Install.
const DESKTOP_STEPS = {
  chrome: [
    <>
      Click the <b>install icon</b> <span className="kbd">⊕</span> at the right end of the address bar,
    </>,
    <>
      or open the <b>⋮ menu</b> → <b>Cast, save and share</b> → <b>Install page as app…</b>
    </>,
    <>
      Click <b>Install</b>. Expense Sync opens in its own window and gets a shortcut on your desktop and Start menu / Dock.
    </>,
  ],
  edge: [
    <>
      Click <b>App available</b> <span className="kbd">⊞</span> in the address bar,
    </>,
    <>
      or open the <b>⋯ menu</b> → <b>Apps</b> → <b>Install this site as an app</b>
    </>,
    <>
      Click <b>Install</b>, then pin it to the taskbar if you like.
    </>,
  ],
  safari: [
    <>
      In the menu bar at the top, choose <b>File</b> → <b>Add to Dock…</b> (macOS Sonoma or later)
    </>,
    <>
      Click <b>Add</b>. Expense Sync appears in your Dock and Launchpad, and opens in its own window.
    </>,
  ],
  firefox: [
    <>Firefox can’t install web apps.</>,
    <>
      Open this page in <b>Chrome</b>, <b>Edge</b> or <b>Safari</b>, then install it from there. You stay signed in on each browser for 6 months.
    </>,
  ],
  other: [
    <>
      Look for <b>Install app</b> or <b>Add to Dock / desktop</b> in your browser’s menu.
    </>,
    <>If there isn’t one, Chrome, Edge or Safari can install it.</>,
  ],
};

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

// Suggests installing the app — on phones and on computers — until it's
// installed. Remembers once it is (and when it was last dismissed).
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // the browser's own install prompt (Chrome / Edge / Android)
  const [show, setShow] = useState(false);
  const ios = isIOS();
  const mobile = isMobile();
  const browser = browserName();

  useEffect(() => {
    // Opened as the installed app: remember, so the browser tab never asks again.
    if (isStandalone()) {
      prefs.set('installed', true);
      return undefined;
    }
    const snoozed = () => prefs.get('installed') || prefs.get('install-dismissed-until') > Date.now();

    const onManual = () => setShow(true);
    const onInstallable = (e) => {
      e.preventDefault();
      setDeferred(e);
      if (!snoozed()) setShow(true);
    };
    const onInstalled = () => {
      prefs.set('installed', true);
      setDeferred(null);
      setShow(false);
    };
    window.addEventListener('show-install', onManual);
    window.addEventListener('beforeinstallprompt', onInstallable);
    window.addEventListener('appinstalled', onInstalled);

    // Browsers without a one-click install: show how, once in a while. (Chrome
    // and Edge announce themselves with beforeinstallprompt; when they don't,
    // the app is usually installed already, so they aren't nagged.)
    let timer;
    const guided = ios || (!mobile && (browser === 'safari' || browser === 'firefox'));
    if (guided && !snoozed()) timer = setTimeout(() => setShow(true), AUTO_SHOW_MS);

    return () => {
      window.removeEventListener('show-install', onManual);
      window.removeEventListener('beforeinstallprompt', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(timer);
    };
  }, [ios, mobile, browser]);

  if (!show || isStandalone()) return null;

  const dismiss = () => {
    // Firefox can't install at all, so it's only mentioned once.
    const days = browser === 'firefox' && !mobile ? 3650 : DISMISS_DAYS;
    prefs.set('install-dismissed-until', Date.now() + days * 86400000);
    setShow(false);
  };
  const install = async () => {
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') prefs.set('installed', true);
    setDeferred(null);
    setShow(false);
  };

  // ── Computer ──
  if (!mobile) {
    const steps = DESKTOP_STEPS[browser] || DESKTOP_STEPS.other;
    return (
      <div className="install-desk" role="dialog" aria-label="Install Expense Sync on this computer">
        <button className="icon-btn install-x" onClick={dismiss} aria-label="Not now">
          ✕
        </button>
        <div className="install-desk-head">
          <img src="/mochi.webp" className="install-mochi" alt="" />
          <div>
            <b>Install Expense Sync on this computer</b>
            <span>Opens in its own window like a normal app, with a shortcut on your desktop.</span>
          </div>
        </div>
        {deferred ? (
          <div className="row-gap">
            <button className="btn primary" onClick={install}>
              ⬇ Install
            </button>
            <button className="btn ghost sm" onClick={dismiss}>
              Not now
            </button>
          </div>
        ) : (
          <>
            <ol className="install-steps">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <button className="btn glass sm" onClick={dismiss}>
              Got it
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Phone / tablet ──
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
          <span>
            Open your browser’s <b>⋮ menu</b> → <b>Install app</b> or <b>Add to Home screen</b>.
          </span>
        )}
      </div>
      {deferred && (
        <button className="btn primary sm" onClick={install}>
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
