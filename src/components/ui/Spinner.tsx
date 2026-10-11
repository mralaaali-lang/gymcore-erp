interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export default function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      className={`material-symbols-outlined animate-spin ${sizes[size]} ${className}`}
      style={{ animation: 'spin 1s linear infinite' }}
    >
      sync
    </span>
  );
}
