import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="material-symbols-outlined text-5xl text-destructive mb-4">error</span>
          <h2 className="text-lg font-bold text-foreground mb-2">حدث خطأ غير متوقع</h2>
          <p className="text-sm text-muted-foreground mb-4">يرجى المحاولة مرة أخرى أو الاتصال بالدعم</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
