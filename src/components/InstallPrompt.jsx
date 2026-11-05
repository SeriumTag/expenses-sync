import { useEffect, useState } from 'react';
import { prefs } from '../lib/session';

const SHOW_AFTER_MS = 1500; // once the splash has gone
const SESSION_KEY = 'expense-sync:install-dismissed'; // "Not now" lasts for this visit only

// ── Where are we? ────────────────────────────────────────────────────
const ua = () => navigator.userAgent || '';
const isIOS = () => /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(ua());
const isMobile = () => isIOS() || isAndroid() || /mobi/i.test(ua());
function browserName() {
  const u = ua();
  if (/samsungbrowser/i.test(u)) return 'samsung';
  if (/edg(e|ios|a)?\//i.test(u)) return 'edge';
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

const dismissedThisVisit = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
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

// How to install, step by step, when the browser has no one-click Install.
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
    <>Firefox on a computer can’t install web apps.</>,
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

const PHONE_STEPS = {
  iosSafari: [
    <>
      Tap <ShareIcon /> <b>Share</b> in the bar at the bottom (or top on iPad)
    </>,
    <>
      Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>
    </>,
  ],
  iosOther: [
    <>
      Tap <ShareIcon /> <b>Share</b> in the address bar
    </>,
    <>
      Tap <b>Add to Home Screen</b>, then <b>Add</b>
    </>,
    <>If you don’t see it, open this page in Safari and do the same there.</>,
  ],
  chrome: [
    <>
      Tap the <b>⋮ menu</b> at the top right
    </>,
    <>
      Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b>
    </>,
  ],
  samsung: [
    <>
      Tap the <b>≡ menu</b> at the bottom
    </>,
    <>
      Tap <b>Add page to</b> → <b>Home screen</b>
    </>,
  ],
  firefox: [
    <>
      Tap the <b>⋮ menu</b>
    </>,
    <>
      Tap <b>Install</b> (or <b>Add to Home screen</b>)
    </>,
  ],
  other: [
    <>
      Open your browser’s menu and look for <b>Add to Home screen</b> or <b>Install app</b>
    </>,
    <>If there isn’t one, open this page in Chrome (Android) or Safari (iPhone).</>,
  ],
};

function stepsFor(ios, mobile, browser) {
  if (ios) return browser === 'safari' ? PHONE_STEPS.iosSafari : PHONE_STEPS.iosOther;
  if (mobile) return PHONE_STEPS[browser === 'edge' ? 'chrome' : browser] || PHONE_STEPS.other;
  return DESKTOP_STEPS[browser] || DESKTOP_STEPS.other;
}

// Asks to install the app every time the site is opened in a browser (not
// when it's already running as the installed app). "Not now" lasts for this
// visit; "I've already installed it" stops it on this browser.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // the browser's own install prompt (Chrome / Edge / Android)
  const [show, setShow] = useState(false);
  const ios = isIOS();
  const mobile = isMobile();
  const browser = browserName();

  useEffect(() => {
    // Opened as the installed app: remember, so this browser stops asking.
    if (isStandalone()) {
      prefs.set('installed', true);
      return undefined;
    }
    const quiet = () => prefs.get('installed') || dismissedThisVisit();

    const onManual = () => setShow(true);
    const onInstallable = (e) => {
      e.preventDefault();
      setDeferred(e); // the guide (if already showing) becomes a one-click Install
      if (!quiet()) setShow(true);
    };
    const onInstalled = () => {
      prefs.set('installed', true);
      setDeferred(null);
      setShow(false);
    };
    window.addEventListener('show-install', onManual);
    window.addEventListener('beforeinstallprompt', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    const timer = setTimeout(() => !quiet() && setShow(true), SHOW_AFTER_MS);

    return () => {
      window.removeEventListener('show-install', onManual);
      window.removeEventListener('beforeinstallprompt', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(timer);
    };
  }, []);

  if (!show || isStandalone()) return null;

  const notNow = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* private mode: it just shows again next time */
    }
    setShow(false);
  };
  const alreadyInstalled = () => {
    prefs.set('installed', true);
    setShow(false);
  };
  const install = async () => {
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') prefs.set('installed', true);
    setDeferred(null);
    setShow(false);
  };

  const steps = stepsFor(ios, mobile, browser);

  return (
    <div className={`install-card ${mobile ? 'phone' : 'desk'}`} role="dialog" aria-label="Install Expense Sync">
      <button className="icon-btn install-x" onClick={notNow} aria-label="Not now">
        ✕
      </button>
      <div className="install-head">
        <img src="/duffy.webp" className="install-mascot" alt="" />
        <div>
          <b>Get Expense Sync as an app</b>
          <span>{mobile ? 'One tap from your home screen, full screen and faster.' : 'One click from your desktop, in its own window and faster.'}</span>
        </div>
      </div>
      {deferred ? (
        <button className="btn primary install-go" onClick={install}>
          ⬇ Install
        </button>
      ) : (
        <ol className="install-steps">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      <div className="install-foot">
        <button className="link-btn" onClick={alreadyInstalled}>
          I’ve already installed it
        </button>
        <button className="btn glass sm" onClick={notNow}>
          Not now
        </button>
      </div>
      {ios && browser === 'safari' && !deferred && <span className="install-arrow" aria-hidden="true" />}
    </div>
  );
}
