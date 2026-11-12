import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flushAllSaves } from "@/utils/flushSaves";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort UI for an unexpected render error. Without it, a component
 * exception leaves the Tauri window completely blank with no way to recover
 * except killing the process.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app] Unhandled render error:", error, info.componentStack);
    // Give any debounced edit one last chance to reach disk before the user
    // reloads.
    void flushAllSaves();
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <div
          role="alert"
          className="w-full max-w-lg rounded-lg border border-destructive/40 bg-surface p-6 text-text-primary shadow-lg"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="mt-1 text-sm text-text-secondary">
                The screen hit an unexpected error. Your saved applications and
                profile are still on disk; unsaved edits were flushed where
                possible.
              </p>
              <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-field p-2 font-mono text-[11px] text-text-muted">
                {this.state.error.message}
              </pre>
              <Button
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Reload the app
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
