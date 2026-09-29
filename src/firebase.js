import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(config.apiKey && config.databaseURL);

const app = isConfigured ? initializeApp(config) : null;
export const db = app ? getDatabase(app) : null;

// initializeAuth (not getAuth) on purpose: getAuth also loads Google's
// pop-up/redirect sign-in machinery, which can hang in iPhone home-screen
// apps and leave the app waiting forever. We only use anonymous sign-in.
export const auth = app
  ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence] })
  : null;

const AUTH_TIMEOUT_MS = 15000;

// Username login has no password, but every device still gets an anonymous
// Firebase session so the database rules can reject unauthenticated traffic.
export function ensureAuth() {
  const signIn = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        if (user) resolve(user);
        else signInAnonymously(auth).then((cred) => resolve(cred.user), reject);
      },
      reject,
    );
  });
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Connecting to the server took too long. Check your internet connection.')), AUTH_TIMEOUT_MS),
  );
  return Promise.race([signIn, timeout]);
}
