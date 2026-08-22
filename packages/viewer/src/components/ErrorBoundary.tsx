import { Component, type ReactNode } from "react";

/**
 * The backstop for data this page did not produce.
 *
 * Every lens here renders an agent's JSON, and the server deliberately serves an
 * artifact through even when it fails schema validation — partial output beats
 * none, per the same reasoning `infraviz verify` follows. That means a
 * malformed field reaching a component that assumes the schema's shape is a
 * real, expected case, not a hypothetical one — and without this, one bad field
 * anywhere in the tree unmounts the entire page to a blank screen with the only
 * trace in a devtools console most people never open.
 *
 * Scoped per-section rather than once at the root: a broken deployment lens
 * should not also take down the topology diagram sitting right next to it.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[infraviz] ${this.props.label} failed to render`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-[12.5px] text-[var(--danger)] leading-relaxed">
          <b>{this.props.label} failed to render.</b> Most likely the artifact for this doesn't match what the page
          expects, rather than anything wrong on your end — the rest of the page is unaffected.{" "}
          <code className="text-[11px] break-all">{this.state.error.message}</code>
        </div>
      );
    }
    return this.props.children;
  }
}
