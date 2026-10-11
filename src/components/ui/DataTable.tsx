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
    <div className="overflow-x-auto rounded-2xl border border-gray-100" dir={isRtl ? 'rtl' : 'ltr'}>
      <table className="w-full text-sm text-gray-900">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-xs text-gray-500 font-semibold px-4 py-3 whitespace-nowrap text-right first:pr-6 last:pl-6"
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
              className={`border-t border-gray-100 transition-colors duration-150 ${
                onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-4 py-3 whitespace-nowrap text-right first:pr-6 last:pl-6"
                >
                  {row[col.key] ?? 'أ€‌'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          {isRtl ? 'لا توجد بيانات لعرضها' : 'No data to display'}
        </div>
      )}
    </div>
  );
}
