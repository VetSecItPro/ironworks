import { Component, type ErrorInfo, type ReactNode } from "react";

// Error boundary wrapper to catch and display crashes instead of black screen
export class SettingsErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CompanySettings crash:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <h2 className="text-sm font-semibold text-red-500 mb-2">Settings page encountered an error</h2>
            <pre className="text-xs text-red-400 whitespace-pre-wrap">{this.state.error.message}</pre>
            <button type="button"
              className="mt-3 px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 text-xs hover:bg-red-500/20 transition-colors"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
