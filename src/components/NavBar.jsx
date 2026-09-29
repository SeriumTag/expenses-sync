import { useState } from 'react';
import { isStandalone, showInstallPrompt } from './InstallPrompt';
import { LogoMark, Wordmark } from './Logo';

// Top bar: brand, account switcher, partner presence and the profile menu.
export default function NavBar(props) {
  const { scrolled, ledgers, ledgerId, onSwitch, partner, partnerOnline, username, connected, binCount } = props;
  const { onTheme, onShare, onNewAccount, onOpenBin, onDeleteAccount, onLogout } = props;
  const [open, setOpen] = useState(false);
  const run = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <header className={`nav ${scrolled ? 'solid' : ''}`}>
      <div className="nav-brand">
        <LogoMark size={20} />
        <Wordmark className="hide-sm" />
      </div>

      {ledgers.length > 1 && (
        <label className="account-pill">
          <select value={ledgerId} onChange={(e) => onSwitch(e.target.value)} aria-label="Expense account">
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <span aria-hidden="true">▾</span>
        </label>
      )}

      <div className="nav-right">
        {partner && (
          <span
            className={`avatar sq ${partnerOnline ? 'online' : ''}`}
            style={{ '--c': 'var(--partner)' }}
            title={`${partner}: ${partnerOnline ? 'online' : 'offline'}`}
          >
            {partner[0].toUpperCase()}
            <span className="dot" />
          </span>
        )}
        <div className="menu-wrap">
          <button className="me-btn" onClick={() => setOpen((o) => !o)} aria-label="Profile menu" aria-expanded={open}>
            <span className={`avatar sq ${connected ? 'online' : ''}`} style={{ '--c': 'var(--accent)' }}>
              {username[0].toUpperCase()}
              <span className="dot" />
            </span>
            <span className={`caret ${open ? 'up' : ''}`}>▾</span>
          </button>
          {open && (
            <>
              <div className="menu-scrim" onClick={() => setOpen(false)} />
              <div className="menu" role="menu">
                <div className="menu-head">
                  <span className="avatar sq lg" style={{ '--c': 'var(--accent)' }}>
                    {username[0].toUpperCase()}
                  </span>
                  <div>
                    <b>{username}</b>
                    <span className="muted small">Signed in on this device</span>
                  </div>
                </div>
                <button role="menuitem" onClick={run(onTheme)}>
                  <span className="menu-swatch" /> Theme colour
                </button>
                <button role="menuitem" onClick={run(onShare)}>
                  <span className="menu-ico">⇄</span> Share &amp; sync
                </button>
                <button role="menuitem" onClick={run(onNewAccount)}>
                  <span className="menu-ico">＋</span> New expense account
                </button>
                {!isStandalone() && (
                  <button role="menuitem" onClick={run(showInstallPrompt)}>
                    <span className="menu-ico">⬇</span> Add to Home Screen
                  </button>
                )}
                <button role="menuitem" onClick={run(onOpenBin)}>
                  <span className="menu-ico">🗑</span> Bin{binCount ? ` (${binCount})` : ''}
                </button>
                <button role="menuitem" className="menu-danger" onClick={run(onDeleteAccount)}>
                  <span className="menu-ico">✕</span> Delete this account
                </button>
                <hr />
                <button role="menuitem" onClick={onLogout}>
                  Sign out of Expense Sync
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
