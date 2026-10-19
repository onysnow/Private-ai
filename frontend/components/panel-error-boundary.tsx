'use client';
// One panel's crash shows an error in that panel instead of blanking the
// whole page (Foundation Fixes fix 3).
import {Component} from 'react';
import type {ErrorInfo, ReactNode} from 'react';

type Props = {name: string, children: ReactNode};
type State = {error: Error | null};

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.name} panel crashed`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return <div role="alert" className="card rounded-md border border-destructive/40 p-4">
        <b>{this.props.name} stopped working.</b>
        <p className="muted">{this.state.error.message || 'Unexpected error'}. The rest of the page still works; reload the page to try this panel again.</p>
      </div>;
    }
    return this.props.children;
  }
}
