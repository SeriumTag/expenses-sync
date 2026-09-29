import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

// Tell the loading watchdog in index.html that the app code arrived.
window.__esStarted = true;

// Tidy up after a fresh-files reload (?fresh=…).
const url = new URL(window.location.href);
if (url.searchParams.has('fresh')) {
  url.searchParams.delete('fresh');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

// Unexpected errors outside the page drawing (e.g. in a background task)
// would otherwise fail silently. Show them, so there's never a mystery blank.
const IGNORED = /ResizeObserver loop|Script error\.?$/i;
function showError(message) {
  if (!message || IGNORED.test(message)) return;
  let box = document.getElementById('app-error');
  if (!box) {
    box = document.createElement('div');
    box.id = 'app-error';
    box.setAttribute('role', 'alert');
    document.body.appendChild(box);
  }
  box.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = `Something went wrong: ${message}`;
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.onclick = () => window.location.reload();
  const close = document.createElement('button');
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Dismiss');
  close.onclick = () => box.remove();
  box.append(text, reload, close);
}
window.addEventListener('error', (e) => showError(e.error?.message || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason?.message || String(e.reason || '')));

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
