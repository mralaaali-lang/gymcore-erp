import { useApp } from '../../context/GymBrandContext';

interface Column {
  key: string;
  label: string;
}

interface DataTableProps {
  columns: Column[];
  data: Record<string, any>[];
  onRowClick?: (row: Record<string, any>) => void;
}

export default function DataTable({ columns, data, onRowClick }: DataTableProps) {
  const { language } = useApp();
  const isRtl = language === 'ar';

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card" dir={isRtl ? 'rtl' : 'ltr'}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-xs text-table-head font-semibold tracking-[0.02em] px-4 py-3 whitespace-nowrap text-right first:pr-6 last:pl-6"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.id ?? idx}
              onClick={() => onRowClick?.(row)}
              className={`border-t border-hairline transition-colors duration-150 ${
                onRowClick ? 'cursor-pointer hover:bg-muted' : ''
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-4 py-3 whitespace-nowrap text-right first:pr-6 last:pl-6"
                >
                  {/* Em dash, not the old 'أ€‌' — that literal was mojibake
                      (U+0622 + U+20AC + ZWNJ) from a bad save, and it rendered
                      as garbage in every empty cell. */}
                  {row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="text-center py-12 text-table-head text-sm">
          {isRtl ? 'لا توجد بيانات لعرضها' : 'No data to display'}
        </div>
      )}
    </div>
  );
}
