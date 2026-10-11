import type { Dispatch, SetStateAction, RefObject } from 'react';
import {
  MagnifyingGlass, Funnel, Printer, Download, ArrowsClockwise, GridFour, Table, Gear
} from '@phosphor-icons/react';
import { colKeyToLabel } from './utils';

interface TenantToolbarProps {
  search: string;
  setSearch: (search: string) => void;
  setPage: (page: number) => void;
  isRtl: boolean;
  columnPadding: number;
  setColumnPadding: (padding: number) => void;
  visibleColumns: Record<string, boolean>;
  setVisibleColumns: Dispatch<SetStateAction<Record<string, boolean>>>;
  showColumnPicker: boolean;
  setShowColumnPicker: (show: boolean) => void;
  columnPickerRef: RefObject<HTMLDivElement>;
  viewMode: 'table' | 'cards';
  setViewMode: (mode: 'table' | 'cards') => void;
  exportCSV: () => void;
  onRefresh: () => void;
}

export default function TenantToolbar({
  search,
  setSearch,
  setPage,
  isRtl,
  columnPadding,
  setColumnPadding,
  visibleColumns,
  setVisibleColumns,
  showColumnPicker,
  setShowColumnPicker,
  columnPickerRef,
  viewMode,
  setViewMode,
  exportCSV,
  onRefresh,
}: TenantToolbarProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <MagnifyingGlass size={18} className="absolute right-3 top-2.5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={isRtl ? 'بحث باسم الصالة أو النطاق...' : 'Search by name or subdomain...'}
          className="w-full pr-10 pl-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>
      {/* â”€â”€ Column Width Mode â”€â”€ */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5">
        <Gear size={14} className="text-gray-400" />
        <select
          value={columnPadding}
          onChange={(e) => setColumnPadding(Number(e.target.value))}
          className="px-2 py-1 bg-transparent border-0 text-gray-700 text-sm focus:outline-none focus:ring-0 cursor-pointer"
          title={isRtl ? 'حجم الأعمدة' : 'Column size'}
        >
          <option value={8}>{isRtl ? 'ضيق' : 'Compact'}</option>
          <option value={16}>{isRtl ? 'عادي' : 'Normal'}</option>
          <option value={24}>{isRtl ? 'واسع' : 'Wide'}</option>
          <option value={32}>{isRtl ? 'فائق الاتساع' : 'Extra Wide'}</option>
        </select>
      </div>
      {/* â”€â”€ Column visibility toggle â”€â”€ */}
      <div className="relative" ref={columnPickerRef}>
        <button
          type="button"
          onClick={() => setShowColumnPicker(!showColumnPicker)}
          className={`p-2.5 border rounded-xl transition-colors ${
            showColumnPicker
              ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
              : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-600'
          }`}
          title={isRtl ? 'إظهار/إخفاء الأعمدة' : 'Show/Hide Columns'}
        >
          <Funnel size={16} />
        </button>
        {showColumnPicker && (
          <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-white border border-gray-100 rounded-xl shadow-xl py-2 max-h-80 overflow-y-auto">
            {Object.keys(visibleColumns).map((colKey) => (
              <label
                key={colKey}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns[colKey]}
                  onChange={() => setVisibleColumns((prev) => ({ ...prev, [colKey]: !prev[colKey] }))}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                {colKeyToLabel(colKey, isRtl)}
              </label>
            ))}
          </div>
        )}
      </div>
      {/* â”€â”€ Print / Export â”€â”€ */}
      <button
        type="button"
        onClick={() => window.print()}
        className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
        title={isRtl ? 'طباعة' : 'Print'}
      >
        <Printer size={16} />
      </button>
      <button
        type="button"
        onClick={exportCSV}
        className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
        title={isRtl ? 'تصدير CSV' : 'Export CSV'}
      >
        <Download size={16} />
      </button>
      <button
        type="button"
        onClick={onRefresh}
        className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
        title={isRtl ? 'تحديث' : 'Refresh'}
      >
        <ArrowsClockwise size={16} />
      </button>
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setViewMode('table')}
          className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-400 hover:text-gray-700'}`}
          title={isRtl ? 'جدول' : 'Table'}
        >
          <Table size={16} />
        </button>
        <button
          type="button"
          onClick={() => setViewMode('cards')}
          className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-400 hover:text-gray-700'}`}
          title={isRtl ? 'بطاقات' : 'Cards'}
        >
          <GridFour size={16} />
        </button>
      </div>
    </div>
  );
}
