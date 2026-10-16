import type { ElementType, ReactNode } from 'react';
import { ACCENTS, CARD_CLASS, type AccentName } from './tokens';

interface PanelProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  icon?: ElementType;
  accent?: AccentName;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** White rounded-3xl content panel with optional dashboard-style header. */
export default function Panel({
  children,
  title,
  subtitle,
  icon: Icon,
  accent = 'emerald',
  actions,
  className = '',
  bodyClassName = '',
}: PanelProps) {
  const a = ACCENTS[accent];
  return (
    <section className={`${CARD_CLASS} ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.chip}`}>
                <Icon size={20} strokeWidth={1.75} className={a.icon} />
              </div>
            )}
            <div>
              {title && <h2 className="text-lg font-bold text-foreground">{title}</h2>}
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
