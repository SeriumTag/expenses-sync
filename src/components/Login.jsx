import { useState } from 'react';
import { USERNAME_RE, normalizeUsername } from '../lib/db';

export default function Login({ onLogin, ready, pendingJoin }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const username = normalizeUsername(name);
    if (!USERNAME_RE.test(username)) {
      setError('Use 3–20 characters: letters, numbers, _ or -');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onLogin(username);
    } catch (err) {
      setError(err.message || 'Login failed');
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={submit}>
        <div className="logo">💸</div>
        <h1>Expense Sync</h1>
        <p className="muted">Track expenses together, live. Just pick a username, no password needed.</p>
        {pendingJoin && (
          <p className="notice">
            After you log in, you’ll be asked to join shared account <b>{pendingJoin}</b>.
          </p>
        )}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="username"
          autoCapitalize="none"
          autoComplete="username"
          spellCheck={false}
          maxLength={20}
        />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || !ready}>
          {!ready ? 'Connecting…' : busy ? 'Logging in…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
