import { useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { CaretDown, CaretUp, CaretUpDown } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { cn } from '@/lib/utils';

export interface TableColumn<T> {
  /** Stable column id. Defaults to `key`, or to the column index for header-only columns. */
  id?: string;
  /**
   * Field name on the row. This is the legacy `{ key, label }` shape that
   * `ui/DataTable` has always taken, so the older screens keep compiling while
   * they move onto `cell`/`value`.
   */
  key?: string;
  /** Legacy alias for `header`. */
  label?: ReactNode;
  header?: ReactNode;
  /** Read something that is not a plain field: a joined label, a derived total. */
  value?: (row: T) => unknown;
  /** Cell content, with the row index for ordinal columns (م/#). Without `cell` the
   * value renders as-is, and null/undefined become an em dash. */
  cell?: (row: T, index: number) => ReactNode;
  /** Opt-in: a column is sortable only when the ordering is real. */
  sortable?: boolean;
  /** Which direction the first click applies. Defaults to ascending. */
  sortDescFirst?: boolean;
  align?: 'start' | 'center' | 'end';
  /** Money, counts, ids: pushed to the end edge in both directions plus
   * tabular figures, so the digits of one column stack on the same edge. */
  numeric?: boolean;
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  /** Defaults to `row.id`, then the row index. */
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Hover hint on a clickable row — the per-row `title` the hand-rolled
   * tables used for "اضغط للتعديل السريع". Only meaningful with `onRowClick`. */
  rowTitle?: (row: T) => string | undefined;
  /**
   * Controlled sorting, for the screens where the SERVER re-runs the query
   * (the `/api/members` whitelist). Pair it with `manualSorting`.
   */
  sorting?: SortingState;
  onSortingChange?: (next: SortingState) => void;
  /**
   * Set when the backend orders the rows. The component then stops re-sorting
   * the page it already has, because re-ordering five loaded rows and calling
   * that "sorted by name" would be a lie.
   */
  manualSorting?: boolean;
  empty?: ReactNode;
  /**
   * Rendered inside the same shell, under a hairline — this is where a page
   * puts its pagination row so the table and its controls stay one card.
   */
  footer?: ReactNode;
  /** Scroll body (e.g. `max-h-80`) with a sticky header. Omit for auto height. */
  maxHeight?: string;
  /**
   * Floor for the `<table>` itself (e.g. `880px`). The shell already scrolls
   * horizontally, so this is how a ten-column grid keeps its shape on a phone
   * instead of crushing every cell.
   */
  minWidth?: string;
  dense?: boolean;
  /**
   * Drop the card (keyline, radius, surface) so the table can live inside a
   * panel that already owns them — the cash-box day cards, for example.
   *
   * A prop rather than `className="border-0 rounded-none bg-transparent"` on
   * purpose: tailwind-merge does not know the project-local `rounded-shell`
   * key, so a caller override of that name and ours would both survive and CSS
   * source order would decide which radius wins (AGENT_HANDOVER §6).
   */
  bare?: boolean;
  /**
   * Screen-reader name for the whole grid. Without one, a table announces
   * itself as "table" and the page's heading has to be found by ear — pass a
   * short label ("أعضاء ببقيّة أقل من 7 أيام") on the screens where several
   * tables share a view. Renders a `<caption>` kept in the sr-only flow, so it
   * never changes the visual layout or the 45px row rhythm.
   */
  caption?: ReactNode;
  className?: string;
}

const ALIGN: Record<NonNullable<TableColumn<unknown>['align']>, string> = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

/** End edge + equal-width digits: the two things a column of numbers needs. */
const NUMERIC = 'text-end tabular-nums';

/** The dash every empty cell shows. Same glyph the previous DataTable settled on. */
const DASH = '—';

/** Explicit `align` wins; otherwise a numeric column goes to the end edge. */
function alignFor(def: { align?: TableColumn<unknown>['align']; numeric?: boolean }): string {
  if (def.align) return ALIGN[def.align];
  if (def.numeric) return NUMERIC;
  return 'text-start';
}

function readValue<T>(col: TableColumn<T>, row: T): unknown {
  if (col.value) return col.value(row);
  if (!col.key) return undefined;
  const raw = (row as Record<string, unknown>)?.[col.key];
  return raw === '' ? null : raw;
}

/**
 * DataTable — one table contract for the ~57 screens that draw rows.
 *
 * The duplication it removes is not the `<table>` tag, it is the cell recipe
 * that every page re-invented, and the two defects that recipe carried:
 *
 * - `text-gray-900` on every cell — near-black ink inside a warm shell, the
 *   exact complaint about the old tables. Cells now use `--table-fg`
 *   (#4a4239 light / #eef0e8 dark) and headers `--table-head`.
 * - `text-right` on every column, which is start-alignment in Arabic and
 *   END-alignment in English, so the same table mis-aligned when the language
 *   changed. Alignment is logical here (`text-start`/`text-end`).
 *
 * @tanstack/react-table carries the sorting state machine only: this build has
 * no filters, no pinning, no pagination UI, because no screen asked for them
 * yet — and pagination here is server-side, where a client pager would be a
 * second source of truth about which rows exist.
 */
export default function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  rowTitle,
  sorting,
  onSortingChange,
  manualSorting = false,
  empty,
  footer,
  maxHeight,
  minWidth,
  dense = false,
  bare = false,
  caption,
  className = '',
}: DataTableProps<T>) {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [internal, setInternal] = useState<SortingState>([]);
  const controlled = sorting !== undefined;
  const activeSorting = controlled ? sorting : internal;

  const applySorting = (updater: Updater<SortingState>) => {
    const next = typeof updater === 'function' ? updater(activeSorting) : updater;
    // A single column at a time: the server contract is `sort=<one key>` plus
    // `order=asc|desc`, and a multi-sort the backend cannot honour would render
    // an order the rows were not actually fetched in.
    const one = next.slice(-1);
    if (!controlled) setInternal(one);
    onSortingChange?.(one);
  };

  // Looked up by column id, never by index: `col.getIndex()` is a flattening
  // detail of the header tree, and a header-only or grouped column would
  // silently shift every style after it.
  const defById: Record<string, TableColumn<T>> = {};
  const defs: ColumnDef<T, unknown>[] = columns.map((col, i) => {
    const id = col.id ?? col.key ?? `col_${i}`;
    defById[id] = col;
    return {
      id,
      accessorFn: (row: T) => readValue(col, row),
      header: () => <>{col.header ?? col.label}</>,
      cell: (info) => {
        if (col.cell) return col.cell(info.row.original, info.row.index);
        const v = info.getValue();
        return v === null || v === undefined ? DASH : String(v);
      },
      enableSorting: !!col.sortable,
      enableMultiSort: false,
      sortDescFirst: !!col.sortDescFirst,
    };
  });

  const table = useReactTable<T>({
    data,
    columns: defs,
    state: { sorting: activeSorting },
    onSortingChange: applySorting,
    // `enableSortingRemoval: false` — cycling back to "no sort" would hand the
    // page an ordering the server picked by default, indistinguishable from the
    // last explicit choice. asc/desc is the honest two-state loop.
    enableSortingRemoval: false,
    manualSorting,
    getRowId: (row, index) => String(rowKey?.(row, index) ?? (row as { id?: string }).id ?? index),
    getCoreRowModel: getCoreRowModel(),
    // Client-side sorting only when the component itself owns the order.
    ...(manualSorting ? {} : { getSortedRowModel: getSortedRowModel() }),
  });

  const bodyPad = dense ? 'px-3 py-2' : 'px-4 py-3';
  const headPad = dense ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'overflow-x-auto',
        !bare && 'rounded-shell border border-hairline bg-card',
        maxHeight && cn('overflow-y-auto', maxHeight),
        className,
      )}
    >
      <table className="w-full border-collapse text-sm" style={minWidth ? { minWidth } : undefined}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="bg-muted">
              {hg.headers.map((header) => {
                const col = header.column;
                const def = defById[col.id];
                const sorted = col.getIsSorted();
                const Icon = !col.getCanSort() ? null : sorted === 'asc' ? CaretUp : sorted === 'desc' ? CaretDown : CaretUpDown;
                return (
                  <th
                    key={header.id}
                    // aria-sort only on sortable columns: announcing "none" on a
                    // column that can never sort is noise, not information.
                    aria-sort={
                      col.getCanSort()
                        ? sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                    scope="col"
                    style={def?.width ? { width: def.width } : undefined}
                    className={cn(
                      'whitespace-nowrap border-b border-hairline text-xs font-semibold text-table-head',
                      headPad,
                      alignFor(def ?? {}),
                      def?.headerClassName,
                      maxHeight && 'sticky top-0 z-10 bg-muted',
                    )}
                  >
                    {Icon ? (
                      <button
                        type="button"
                        onClick={col.getToggleSortingHandler()}
                        title={isRtl ? 'اضغط للترتيب' : 'Click to sort'}
                        className={cn(
                          '-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground',
                          sorted && 'text-brass',
                        )}
                      >
                        {flexRender(col.columnDef.header, header.getContext())}
                        <Icon size={13} weight="bold" className="shrink-0 opacity-70" />
                      </button>
                    ) : (
                      flexRender(col.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              title={onRowClick ? rowTitle?.(row.original) : undefined}
              // A clickable row is otherwise mouse-only, which is a WCAG 2.1.1
              // failure: the edit dialog cannot be opened from the keyboard at
              // all. `tabIndex={0}` plus Enter/Space makes the row a real
              // affordance; the floor in `styles/index.css` draws its focus
              // ring because the selector covers `[tabindex]`.
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      // Only the row itself: a button or field inside a cell
                      // bubbles its own Enter/Space up here, and firing the row
                      // for it would open the dialog on top of the inner action.
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row.original);
                      }
                    }
                  : undefined
              }
              className={cn(
                'border-b border-hairline transition-colors duration-150 last:border-b-0 hover:bg-muted/50',
                onRowClick && 'cursor-pointer focus-visible:bg-muted/50',
              )}
            >
              {row.getVisibleCells().map((cell) => {
                const def = defById[cell.column.id];
                return (
                  <td
                    key={cell.id}
                    className={cn(
                      'text-table-fg',
                      bodyPad,
                      alignFor(def ?? {}),
                      def?.cellClassName,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}

          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={cn('px-4 text-center text-table-head', dense ? 'py-8' : 'py-12')}>
                {empty ?? (isRtl ? 'لا توجد بيانات لعرضها' : 'No data to display')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {footer ? <div className="border-t border-hairline px-4 py-3">{footer}</div> : null}
    </div>
  );
}
