import React from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import { reportError } from "@/lib/reportError";

// Catches a crash in any screen below it and shows a recovery card instead of
// a blank page. Keyed by route in App.jsx, so moving to another page clears it.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(error, { source: "boundary", extra: info?.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[70vh] grid place-items-center p-6">
        <div className="max-w-sm w-full text-center rounded-3xl border border-border bg-card p-8 space-y-4 shadow-xl">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 text-destructive grid place-items-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-heading font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              This screen hit a problem. The team has been notified automatically. Reloading usually fixes it.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2"
            >
              <RotateCw className="w-4 h-4" /> Reload
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = "/"; }}
              className="h-11 rounded-xl border border-border font-medium inline-flex items-center justify-center gap-2 hover:bg-accent"
            >
              <Home className="w-4 h-4" /> Go to home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
