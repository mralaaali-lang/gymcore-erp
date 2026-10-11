import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-500 text-white rounded-xl shadow-sm shadow-emerald-500/25 hover:bg-emerald-600 active:scale-[0.98]',
  secondary:
    'bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl shadow-sm hover:bg-emerald-100 active:scale-[0.98]',
  ghost:
    'text-gray-600 hover:bg-gray-100 rounded-xl',
  outline:
    'bg-white border border-gray-200 text-gray-900 rounded-xl hover:bg-gray-50',
};

export default function Button({
  variant = 'primary',
  children,
  fullWidth,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-label-md font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
