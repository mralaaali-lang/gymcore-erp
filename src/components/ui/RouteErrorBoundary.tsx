// ── RouteErrorBoundary — Universal error fallback for all routes ──
// Prevents white screen by catching render errors and showing a friendly message.
import { useRouteError, isRouteErrorResponse } from 'react-router';

export default function RouteErrorBoundary() {
  const error = useRouteError();

  // Determine error message based on type
  let title = '⚠️ خطأ في تحميل الصفحة';
  let message = 'حدث خطأ غير متوقع. يُرجى المحاولة مرة أخرى.';

  if (isRouteErrorResponse(error)) {
    // HTTP error from loader/action
    title = `⚠️ خطأ ${error.status}`;
    message = error.statusText || message;
    if (error.data?.message) {
      message = error.data.message;
    }
  } else if (error instanceof Error) {
    message = error.message || message;
    if (import.meta.env.DEV) {
      console.error('[RouteErrorBoundary]', error);
    }
  }

  const handleReload = () => window.location.reload();
  const handleBack = () => window.history.back();

  return (
    <div dir="rtl" className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 max-w-md mx-auto">
        <div className="text-6xl mb-6">⚠️</div>
        <h2 className="text-2xl font-bold text-red-600 mb-4">{title}</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={handleReload}
            className="px-6 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium"
          >
            إعادة تحميل
          </button>
          <button
            onClick={handleBack}
            className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            العودة للصفحة السابقة
          </button>
        </div>
      </div>
    </div>
  );
}
