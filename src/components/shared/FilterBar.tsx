import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/GymBrandContext';

export interface FilterOption {
  /** Option value */
  value: string;
  /** Display label (Arabic) */
  labelAr: string;
  /** Display label (English) */
  labelEn: string;
}

export interface FilterGroup {
  /** Group key */
  key: string;
  /** Selected value */
  value: string;
  /** Available options */
  options: FilterOption[];
  /** Placeholder text */
  placeholder?: string;
}

interface FilterBarProps {
  /** Current search text */
  search: string;
  /** Callback when search changes */
  onSearchChange: (value: string) => void;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Optional filter groups for dropdown selects */
  filters?: FilterGroup[];
  /** Callback when a filter changes */
  onFilterChange?: (key: string, value: string) => void;
  /** Optional extra action buttons rendered after filters */
  extraActions?: React.ReactNode;
  /** Optional callback for refresh */
  onRefresh?: () => void;
  /** Extra CSS classes */
  className?: string;
}

/**
 * FilterBar — Standardized search bar with optional dropdown filters and actions.
 *
 * Usage:
 * ```tsx
 * const [search, setSearch] = useState('');
 * const filters = [
 *   { key: 'status', value: statusFilter, options: statusOptions, placeholder: 'الحالة' },
 * ];
 *
 * <FilterBar
 *   search={search}
 *   onSearchChange={setSearch}
 *   filters={filters}
 *   onFilterChange={(key, val) => setFilters(prev => ({ ...prev, [key]: val }))}
 *   onRefresh={() => queryClient.invalidateQueries(...)}
 * />
 * ```
 */
export default function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  onFilterChange,
  extraActions,
  onRefresh,
  className = '',
}: FilterBarProps) {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const defaultPlaceholder = isRtl ? 'بحث...' : 'Search...';

  const getSelectedLabel = (filter: FilterGroup): string => {
    if (!filter.value) return filter.placeholder || '';
    const opt = filter.options.find((o) => o.value === filter.value);
    if (!opt) return filter.value;
    return isRtl ? opt.labelAr : opt.labelEn;
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder || defaultPlaceholder}
          className="w-full h-10 pl-10 pr-3 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface text-lg"
          >
            close
          </button>
        )}
      </div>

      {/* Filter Dropdowns */}
      {filters?.map((filter) => (
        <div key={filter.key} className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpenDropdown(openDropdown === filter.key ? null : filter.key)}
            className={`flex items-center gap-1.5 h-10 px-3 border rounded-lg text-label-sm transition-colors ${
              filter.value
                ? 'bg-primary-container text-on-primary-container border-primary/30'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary/30'
            }`}
          >
            <span className="material-symbols-outlined text-lg">filter_list</span>
            <span className="max-w-[120px] truncate">{getSelectedLabel(filter)}</span>
            {filter.value && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterChange?.(filter.key, '');
                }}
                className="material-symbols-outlined text-base hover:text-error ml-1"
              >
                close
              </button>
            )}
          </button>

          {/* Dropdown Menu */}
          {openDropdown === filter.key && (
            <div
              className={`absolute z-50 mt-1 min-w-[180px] bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg py-1 ${
                isRtl ? 'right-0' : 'left-0'
              }`}
            >
              {/* "All" option */}
              <button
                onClick={() => {
                  onFilterChange?.(filter.key, '');
                  setOpenDropdown(null);
                }}
                className={`w-full text-left px-3 py-2 text-label-sm hover:bg-surface-container-high transition-colors ${
                  !filter.value ? 'text-primary font-medium' : 'text-on-surface-variant'
                } ${isRtl ? 'text-right' : 'text-left'}`}
              >
                {isRtl ? 'الكل' : 'All'}
              </button>
              <div className="border-t border-outline-variant my-1" />
              {filter.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onFilterChange?.(filter.key, opt.value);
                    setOpenDropdown(null);
                  }}
                  className={`w-full text-left px-3 py-2 text-label-sm hover:bg-surface-container-high transition-colors ${
                    filter.value === opt.value ? 'text-primary font-medium bg-primary-container/30' : 'text-on-surface-variant'
                  } ${isRtl ? 'text-right' : 'text-left'}`}
                >
                  {isRtl ? opt.labelAr : opt.labelEn}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Refresh Button */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 h-10 px-3 border border-outline-variant rounded-lg text-label-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
          title={isRtl ? 'تحديث' : 'Refresh'}
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
        </button>
      )}

      {/* Extra Actions */}
      {extraActions}
    </div>
  );
}
