import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("LyricBook runtime error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
        <section className="reader-card" style={{ minHeight: 0, maxWidth: 640 }}>
          <span className="brand-mark">!</span>
          <h1 className="reader-title" style={{ fontSize: 42 }}>
            LyricBook could not start
          </h1>
          <p className="panel-copy">
            Your browser data has not been deleted. Reload once; if the problem remains, export
            console details and report an issue.
          </p>
          <pre className="notice error" style={{ overflow: "auto", whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
          </pre>
          <div className="inline-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <a
              className="button"
              href="https://github.com/cky008/lyricbook/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              Report issue
            </a>
          </div>
        </section>
      </main>
    );
  }
}
