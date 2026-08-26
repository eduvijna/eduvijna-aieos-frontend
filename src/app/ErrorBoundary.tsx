import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Teacher OS error boundary", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ padding: "2rem", maxWidth: "40rem" }}>
          <h1>Something went wrong</h1>
          <p className="muted">
            The Teacher OS shell hit an unexpected error. Reload the page to
            continue.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
