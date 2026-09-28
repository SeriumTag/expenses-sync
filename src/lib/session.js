// Device-local login memory. There's no password, so "logged in" just means
// this device remembers which username to open, for up to 6 months.
const SESSION_KEY = 'expense-sync:session';
const PROFILES_KEY = 'expense-sync:profiles';
const LEGACY_USER_KEY = 'expense-sync:user';
const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) */
  }
}

export function loadSession() {
  // Carry over logins from the first version of the app.
  try {
    const legacy = localStorage.getItem(LEGACY_USER_KEY);
    if (legacy) {
      localStorage.removeItem(LEGACY_USER_KEY);
      saveSession(legacy);
    }
  } catch {
    /* ignore */
  }

  const session = read(SESSION_KEY);
  if (!session?.username) return null;
  if (!(session.expires > Date.now())) {
    write(SESSION_KEY, null);
    return null;
  }
  return session.username;
}

export function saveSession(username) {
  write(SESSION_KEY, { username, expires: Date.now() + SIX_MONTHS_MS });
}

export function clearSession() {
  write(SESSION_KEY, null);
}

// Profiles that have logged in on this device, for the "Who's spending?" screen.
export function loadProfiles() {
  const list = read(PROFILES_KEY);
  return Array.isArray(list) ? [...list].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)) : [];
}

export function rememberProfile(name, patch = {}) {
  const list = loadProfiles().filter((p) => p.name !== name);
  const existing = loadProfiles().find((p) => p.name === name) || {};
  write(PROFILES_KEY, [{ ...existing, name, lastUsed: Date.now(), ...patch }, ...list].slice(0, 8));
}

export function forgetProfile(name) {
  write(PROFILES_KEY, loadProfiles().filter((p) => p.name !== name));
}

export function cachedTheme(name) {
  return loadProfiles().find((p) => p.name === name)?.theme || null;
}

// Small per-device UI memories (e.g. the dismissed install hint).
export const prefs = {
  get: (key) => read(`expense-sync:${key}`),
  set: (key, value) => write(`expense-sync:${key}`, value),
};
