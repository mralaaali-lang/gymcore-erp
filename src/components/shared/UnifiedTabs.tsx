import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';

export interface Tab {
  /** Unique key for the tab */
  key: string;
  /** Arabic label */
  labelAr: string;
  /** English label */
  labelEn: string;
  /** Optional Material Symbol icon name */
  icon?: string;
  /** Optional badge count shown beside the label */
  count?: number;
  /** Optional disabled state */
  disabled?: boolean;
}

interface UnifiedTabsProps {
  /** Array of tab definitions */
  tabs: Tab[];
  /** Controlled active tab key */
  activeKey?: string;
  /** Default active tab key (uncontrolled) */
  defaultKey?: string;
  /** Callback when tab changes */
  onChange?: (key: string) => void;
  /** Visual variant */
  variant?: 'underline' | 'pills' | 'buttons';
  /** Extra CSS classes */
  className?: string;
}

/**
 * UnifiedTabs — Standardized tab component supporting RTL, icons, badges, and multiple variants.
 *
 * Variants:
 * - `underline`: Classic underline style (default)
 * - `pills`: Pill-shaped buttons
 * - `buttons`: Contained button style
 *
 * Usage:
 * ```tsx
 * const tabs = [
 *   { key: 'overview', labelAr: 'نظرة عامة', labelEn: 'Overview', icon: 'bar_chart' },
 *   { key: 'details', labelAr: 'تفاصيل', labelEn: 'Details', count: 5 },
 * ];
 *
 * <UnifiedTabs tabs={tabs} defaultKey='overview' onChange={(k) => setTab(k)} />
 * ```
 */
export default function UnifiedTabs({
  tabs,
  activeKey: controlledKey,
  defaultKey,
  onChange,
  variant = 'underline',
  className = '',
}: UnifiedTabsProps) {
  const { language } = useApp();
  const isRtl = language === 'ar';

  const [internalKey, setInternalKey] = useState(defaultKey ?? tabs[0]?.key ?? '');
  const activeKey = controlledKey ?? internalKey;

  const handleChange = (key: string) => {
    if (key === activeKey) return;
    setInternalKey(key);
    onChange?.(key);
  };

  const variantStyles = {
    underline: {
      container: 'flex border-b border-outline-variant gap-0',
      tab: (isActive: boolean, disabled: boolean) =>
        `flex items-center gap-1.5 px-4 py-2.5 text-label-md font-medium transition-colors border-b-2 -mb-px cursor-pointer
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:text-primary hover:border-primary'}
        ${isActive ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'}`,
    },
    pills: {
      container: 'flex gap-1.5 flex-wrap',
      tab: (isActive: boolean, disabled: boolean) =>
        `flex items-center gap-1.5 px-3.5 py-2 text-label-sm font-medium rounded-lg transition-colors cursor-pointer
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${isActive ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`,
    },
    buttons: {
      container: 'flex gap-1 flex-wrap',
      tab: (isActive: boolean, disabled: boolean) =>
        `flex items-center gap-1.5 px-3 py-2 text-label-sm font-medium rounded-md transition-colors cursor-pointer border
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${isActive
          ? 'bg-primary-container text-on-primary-container border-primary'
          : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:bg-surface-container-high'}`,
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className={`${styles.container} ${className}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {tabs.map((tab) => {
        const isActive = activeKey === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => !tab.disabled && handleChange(tab.key)}
            disabled={tab.disabled}
            className={styles.tab(isActive, !!tab.disabled)}
            title={isRtl ? tab.labelAr : tab.labelEn}
          >
            {tab.icon && (
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
            )}
            <span>{isRtl ? tab.labelAr : tab.labelEn}</span>
            {tab.count !== undefined && (
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-label-xs font-bold
                ${isActive ? 'bg-on-primary text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}
              >
                {tab.count > 99 ? '99+' : tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
