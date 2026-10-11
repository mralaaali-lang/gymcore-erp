import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';

export interface ExportColumn {
  key: string;
  label: string;
}

interface ExportButtonProps {
  /** Column definitions for the export */
  columns: ExportColumn[];
  /** Data rows (array of objects) */
  data: Record<string, unknown>[];
  /** Optional filename (without extension) */
  filename?: string;
  /** Optional label override */
  label?: string;
  /** Optional icon override */
  icon?: string;
  /** Button variant */
  variant?: 'primary' | 'outline' | 'ghost';
  /** Extra CSS classes */
  className?: string;
  /** Custom formatter for cell values */
  formatCell?: (key: string, value: unknown) => string;
}

/**
 * ExportButton — Export data to CSV with column selection.
 *
 * Usage:
 * ```tsx
 * const columns = [
 *   { key: 'name', label: 'Name' },
 *   { key: 'email', label: 'Email' },
 * ];
 *
 * <ExportButton
 *   columns={columns}
 *   data={members}
 *   filename='members-export'
 *   variant='outline'
 * />
 * ```
 */
export default function ExportButton({
  columns,
  data,
  filename = 'export',
  label,
  icon = 'download',
  variant = 'outline',
  className = '',
  formatCell,
}: ExportButtonProps) {
  const { language } = useApp();
  const { showToast } = useToast();
  const isRtl = language === 'ar';
  const [isExporting, setIsExporting] = useState(false);

  const defaultLabel = isRtl ? 'تصدير' : 'Export';

  const variantStyles: Record<string, string> = {
    primary:
      'bg-primary text-on-primary hover:bg-primary/90 border-primary',
    outline:
      'bg-surface-container-low text-on-surface-variant border-outline-variant hover:bg-surface-container-high',
    ghost:
      'text-on-surface-variant hover:bg-surface-container-high border-transparent',
  };

  const handleExport = () => {
    if (data.length === 0) {
      showToast(isRtl ? 'لا توجد بيانات للتصدير' : 'No data to export', 'warning');
      return;
    }

    setIsExporting(true);

    try {
      // Generate CSV header
      const header = columns.map((col) => `"${col.label}"`).join(',');

      // Generate CSV rows
      const rows = data.map((row) =>
        columns
          .map((col) => {
            const value = row[col.key];
            const formatted = formatCell?.(col.key, value) ?? String(value ?? '');
            // Escape quotes and wrap in quotes
            return `"${formatted.replace(/"/g, '""')}"`;
          })
          .join(',')
      );

      const csv = [header, ...rows].join('\n');
      const BOM = '\uFEFF'; // For Excel UTF-8 support
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(
        isRtl ? `تم تصدير ${data.length} سجل` : `Exported ${data.length} records`,
        'success'
      );
    } catch {
      showToast(isRtl ? 'فشل التصدير' : 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`flex items-center gap-1.5 h-10 px-3 border rounded-lg text-label-sm transition-colors ${
        variantStyles[variant]
      } ${isExporting ? 'opacity-60 cursor-wait' : 'cursor-pointer'} ${className}`}
    >
      <span className="material-symbols-outlined text-lg">
        {isExporting ? 'progress_activity' : icon}
      </span>
      <span>{label || defaultLabel}</span>
    </button>
  );
}
