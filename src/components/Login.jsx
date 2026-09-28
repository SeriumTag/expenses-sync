import { useState } from 'react';
import { USERNAME_RE, normalizeUsername } from '../lib/db';
import { forgetProfile, loadProfiles } from '../lib/session';
import { normalizeTheme } from '../lib/theme';
import { LogoMark, Wordmark } from './Logo';

export default function Login({ onLogin, ready, pendingJoin }) {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [mode, setMode] = useState(() => (loadProfiles().length ? 'pick' : 'new'));
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function login(raw) {
    const username = normalizeUsername(raw);
    if (!USERNAME_RE.test(username)) {
      setError('Use 3–20 characters: letters, numbers, _ or -');
      return;
    }
    setBusy(username);
    setError('');
    try {
      await onLogin(username);
    } catch (e) {
      setError(e.message || 'Sign in failed');
      setBusy(null);
    }
  }

  function removeProfile(profileName) {
    forgetProfile(profileName);
    const next = loadProfiles();
    setProfiles(next);
    if (!next.length) {
      setManaging(false);
      setMode('new');
    }
  }

  return (
    <div className="login-screen">
      <div className="login-bg" aria-hidden="true" />
      <header className="login-top">
        <LogoMark size={26} />
        <Wordmark />
      </header>

      {pendingJoin && (
        <p className="join-hint">
          Sign in to join the shared account <b>{pendingJoin}</b>
        </p>
      )}

      {mode === 'pick' ? (
        <section className="who">
          <h1>{managing ? 'Manage profiles' : 'Who’s spending?'}</h1>
          <div className="profile-grid">
            {profiles.map((p) => (
              <button
                key={p.name}
                className={`profile-tile ${managing ? 'managing' : ''}`}
                disabled={!ready || Boolean(busy)}
                onClick={() => (managing ? removeProfile(p.name) : login(p.name))}
                aria-label={managing ? `Remove ${p.name} from this device` : `Sign in as ${p.name}`}
              >
                <span className="profile-avatar" style={{ '--c': normalizeTheme(p.theme) }}>
                  {p.name[0].toUpperCase()}
                  {managing && <span className="profile-x">✕</span>}
                  {busy === p.name && <span className="spinner" />}
                </span>
                <span className="profile-name">{p.name}</span>
              </button>
            ))}
            {!managing && (
              <button
                className="profile-tile"
                onClick={() => {
                  setMode('new');
                  setError('');
                }}
              >
                <span className="profile-avatar add">+</span>
                <span className="profile-name">Add profile</span>
              </button>
            )}
          </div>
          {!ready && <p className="muted small">Connecting…</p>}
          {error && <p className="error">{error}</p>}
          <button className="btn outline" onClick={() => setManaging((m) => !m)}>
            {managing ? 'Done' : 'Manage profiles'}
          </button>
        </section>
      ) : (
        <form
          className="signin"
          onSubmit={(e) => {
            e.preventDefault();
            login(name);
          }}
        >
          <h1>{profiles.length ? 'Add profile' : 'Sign in'}</h1>
          <p className="muted">Just a username, no password. This device keeps you signed in for 6 months.</p>
          <div className="float-field">
            <input
              id="username"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder=" "
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
              maxLength={20}
            />
            <label htmlFor="username">Username</label>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn primary block lg" disabled={!ready || Boolean(busy)}>
            {!ready ? 'Connecting…' : busy ? 'Signing in…' : 'Continue'}
          </button>
          {profiles.length > 0 && (
            <button type="button" className="btn ghost block" onClick={() => setMode('pick')}>
              Back to profiles
            </button>
          )}
        </form>
      )}
    </div>
  );
}
