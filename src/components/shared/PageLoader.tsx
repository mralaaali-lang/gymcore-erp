
import { useApp } from '../../context/GymBrandContext';
import Spinner from '../ui/Spinner';

interface PageLoaderProps {
  /** Optional loading message */
  message?: string;
  /** Show skeleton placeholders instead of spinner */
  variant?: 'spinner' | 'skeleton';
  /** Number of skeleton rows (only for 'skeleton' variant) */
  rows?: number;
  /** Full page mode (centers content) */
  fullPage?: boolean;
  /** Extra CSS classes */
  className?: string;
}

/**
 * PageLoader — Loading state component for pages and sections.
 *
 * Variants:
 * - `spinner`: Centered spinner with optional message (default)
 * - `skeleton`: Skeleton placeholder rows for table-like content
 *
 * Usage:
 * ```tsx
 * // Simple loading
 * if (loading) return <PageLoader />;
 *
 * // With message
 * if (loading) return <PageLoader message='جاري التحميل...' />;
 *
 * // Skeleton variant
 * if (loading) return <PageLoader variant='skeleton' rows={5} />;
 * ```
 */
export default function PageLoader({
  message,
  variant = 'spinner',
  rows = 3,
  fullPage = false,
  className = '',
}: PageLoaderProps) {
  const { language } = useApp();
  const isRtl = language === 'ar';

  // Skeleton variant
  if (variant === 'skeleton') {
    return (
      <div
        className={`flex flex-col gap-3 ${fullPage ? 'p-6' : ''} ${className}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="animate-pulse flex gap-4 items-center">
            <div className="h-4 bg-surface-container-high rounded w-12" />
            <div className="h-4 bg-surface-container-high rounded flex-1" />
            <div className="h-4 bg-surface-container-high rounded w-24" />
            <div className="h-4 bg-surface-container-high rounded w-20" />
            <div className="h-4 bg-surface-container-high rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  // Spinner variant
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${
        fullPage ? 'min-h-[400px]' : 'py-12'
      } ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <Spinner size="lg" />
      {message && (
        <p className="text-body-md text-on-surface-variant animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
}
