// §34ج — minimal RFC-4180 CSV helpers used by the real MigrationTab import.
// parseCsv returns header-keyed row objects; downloadCsv produces the
// per-entity template files (no server needed for a template).
// downloadXlsx writes a real .xlsx workbook (SheetJS) for Excel exports.

import * as XLSX from 'xlsx';

export function parseCsv(text: string): Record<string, string>[] {
  // strip BOM, normalize newlines
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
    else field += c;
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (nonEmpty.length < 2) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

export function downloadCsv(filename: string, content: string): void {
  // BOM first so Excel opens Arabic headers correctly.
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build a 2D string matrix (header + rows) shared by CSV and XLSX exporters. */
export function buildExportMatrix(
  columns: { key: string; label: string }[],
  data: Record<string, unknown>[],
  formatCell?: (key: string, value: unknown) => string,
): string[][] {
  const head = columns.map((c) => c.label);
  const body = data.map((row) =>
    columns.map((col) => {
      const v = row[col.key];
      const formatted = formatCell?.(col.key, v) ?? (v === null || v === undefined ? '' : String(v));
      return formatted;
    })
  );
  return [head, ...body];
}

export function downloadMatrixCsv(filename: string, matrix: string[][]): void {
  const csv = matrix.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadCsv(filename, csv);
}

/** Real Excel workbook from the same matrix (first row = headers). */
export function downloadMatrixXlsx(filename: string, matrix: string[][]): void {
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws['!cols'] = matrix[0].map((_, i) => ({
    wch: Math.min(40, Math.max(12, ...matrix.map((r) => String(r[i] ?? '').length + 2))),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}
