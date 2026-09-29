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

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
