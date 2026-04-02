import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary — catches uncaught render errors and shows a
 * friendly fallback instead of a white screen.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[BlockID] ErrorBoundary caught:", error, info.componentStack);
  }

  private handleReload = () => window.location.reload();
  private handleHome = () => (window.location.href = "/");

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>

            {/* Heading */}
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground mb-2">
                Something went wrong
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An unexpected error occurred. This has been logged automatically.
              </p>
            </div>

            {/* Error details (dev only) */}
            {import.meta.env.DEV && this.state.error && (
              <div className="bg-muted rounded-xl p-4 text-left">
                <p className="text-xs font-mono text-destructive break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </button>
              <button
                onClick={this.handleHome}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
              >
                <Home className="h-4 w-4" />
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
