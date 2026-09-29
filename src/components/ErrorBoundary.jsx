import { Component } from 'react';
import { hideSplash } from '../lib/splash';

// If something crashes while drawing the page, show what happened and a way
// out instead of a blank screen.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info?.componentStack);
    hideSplash();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-screen">
        <div className="card">
          <h2>Something went wrong</h2>
          <p className="muted">The app hit an error while showing this page. Reloading usually fixes it.</p>
          <pre className="error-detail">{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
