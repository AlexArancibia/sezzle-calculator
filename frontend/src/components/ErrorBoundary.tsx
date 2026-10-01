import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./Icon";

interface State {
  failed: boolean;
}

/** Catches rendering errors so a bug shows a clear recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled rendering error", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <main className="app">
        <div className="card fatal" role="alert">
          <Icon name="alert" size={28} className="fatal-icon" />
          <h1>Something went wrong</h1>
          <p className="muted">The page ran into an unexpected problem. Reloading usually fixes it.</p>
          <button type="button" className="submit" onClick={() => window.location.reload()}>
            <Icon name="refresh" size={18} /> Reload the page
          </button>
        </div>
      </main>
    );
  }
}
