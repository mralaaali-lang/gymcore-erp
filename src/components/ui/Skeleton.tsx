interface SkeletonProps {
  className?: string;
  rows?: number;
  count?: number;
}

export function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-[#d9e3f6] rounded-lg animate-pulse ${className}`}
      style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
    />
  );
}

export function SkeletonTable({ rows = 5 }: SkeletonProps) {
  return (
    <div className="bg-white rounded-2xl border border-surface-variant p-4 space-y-3">
      <div className="flex gap-4 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonLine key={i} className="h-6 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: 5 }).map((_, j) => (
            <SkeletonLine key={j} className={`h-5 flex-1 ${j === 0 ? 'w-1/6' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3 }: SkeletonProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-surface-variant p-5 space-y-3">
          <SkeletonLine className="h-8 w-8 rounded-lg" />
          <SkeletonLine className="h-4 w-1/2" />
          <SkeletonLine className="h-6 w-1/3" />
        </div>
      ))}
    </div>
  );
}
