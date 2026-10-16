import type { ElementType, ReactNode } from 'react';
import { Package } from '@phosphor-icons/react';
import { ACCENTS, type AccentName } from './tokens';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ElementType;
  accent?: AccentName;
  actions?: ReactNode;
}

/** Muted empty state for lists/tables. */
export default function EmptyState({
  title,
  description,
  icon: Icon = Package,
  accent = 'gray',
  actions,
}: EmptyStateProps) {
  const a = ACCENTS[accent];
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${a.chip}`}>
        <Icon size={26} strokeWidth={1.75} className={a.icon} />
      </div>
      <p className="text-base font-bold text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>}
      {actions && <div className="flex items-center gap-2 mt-4">{actions}</div>}
    </div>
  );
}
