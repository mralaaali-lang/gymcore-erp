interface StatusBadgeProps {
  status: string;
  variant?: 'success' | 'warning' | 'error' | 'neutral';
}

const variantMap: Record<string, { bg: string; text: string; dot: string }> = {
  success: { bg: 'bg-secondary-container', text: 'text-on-secondary-container', dot: 'bg-secondary' },
  warning: { bg: 'bg-amber-100', text: 'text-amber-900', dot: 'bg-amber-500' },
  error: { bg: 'bg-error-container', text: 'text-on-error-container', dot: 'bg-error' },
  neutral: { bg: 'bg-surface-container', text: 'text-on-surface-variant', dot: 'bg-outline' },
};

export default function StatusBadge({ status, variant = 'neutral' }: StatusBadgeProps) {
  const v = variantMap[variant];

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold ${v.bg} ${v.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
      {status}
    </span>
  );
}
