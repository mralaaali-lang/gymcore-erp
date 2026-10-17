import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { importCsv, type ImportResult } from '../../services/api';
import { downloadMatrixXlsx } from '../../utils/csv';
import Modal from '../../components/shared/Modal';

const TEMPLATE_HEADERS = ['full_name', 'phone_number', 'email', 'birth_date', 'medical_notes'];
const TEMPLATE_SAMPLE = ['أحمد محمد', '01000000001', 'ahmed@example.com', '1995-04-12', ''];

/**
 * مودال استيراد المشتركين من Excel — نفس endpoint الاستيراد الحقيقي
 * (POST /api/import/members): الملف يُقرأ في المتصفح وتُرسل الصفوف normalized،
 * وكل صف يُكتب فعلًا ويُبلَّغ بنتيجته (ناجح/فاشل/لماذا)، بلا نجاح معمّم.
 *
 * موجة 3 (دفعة 2): الصدفة اليدوية اتحوّلت على `shared/Modal` — نفس العرض
 * (`max-w-lg` = 32rem) ونفس الأزرار بنفس الترتيب، وEscape/الضغط على الـscrim
 * بقوا شغالين ومحبوسين طالما الاستيراد جارٍ (`disableDismiss={busy}`).
 * الألوان الحرفية جوه الحقول والنتايج لسه سايبة لموجة 5 (D1/D2 مفتوح).
 */
export default function ImportMembersModal({ onClose, onImported }: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { language } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('empty');
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
      const nonEmpty = aoa.filter((r) => r.some((v) => String(v ?? '').trim() !== ''));
      if (nonEmpty.length < 2) {
        setRows([]);
        setError(rtl ? 'الملف لا يحتوي صفوف بيانات بعد رأس الأعمدة' : 'File has no data rows after the header');
        return;
      }
      const headers = nonEmpty[0].map((h) => String(h ?? '').trim());
      const parsed = nonEmpty.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = String(r[idx] ?? '').trim(); });
        return obj;
      });
      if (parsed.length > 2000) {
        setRows([]);
        setError(rtl ? `الملف فيه ${parsed.length} صفًا — الحد الأقصى 2000، قسّمه` : `File has ${parsed.length} rows — split it (max 2000)`);
        return;
      }
      setFileName(file.name);
      setRows(parsed);
      setError(null);
      setResult(null);
    } catch {
      setRows([]);
      setError(rtl ? 'تعذر قراءة ملف Excel — تأكد أنه .xlsx سليم' : 'Cannot read the Excel file — make sure it is a valid .xlsx');
    }
  };

  const run = async () => {
    if (!rows.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importCsv('members', rows);
      setResult(res);
      if (res.imported > 0) {
        showToast(
          rtl ? `تم استيراد ${res.imported} عضو${res.failed ? ` وفشل ${res.failed}` : ''}` : `Imported ${res.imported}${res.failed ? `, ${res.failed} failed` : ''}`,
          res.failed ? 'warning' : 'success',
        );
        onImported();
      } else {
        showToast(rtl ? 'لم يُستورد أي صف — راجع الأخطاء' : 'No rows imported — see errors', 'error');
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (rtl ? 'فشل الاتصال بالسيرفر' : 'Server request failed');
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dir={rtl ? 'rtl' : 'ltr'}
      // الاستيراد رحلة واحدة طويلة (حتى 2000 صف) — نفس باب موجة 3: القفل يتعطل
      // لحد ما الرد ييجي، والنتيجة فضلت معروضة بعد الفشل يتعاود.
      disableDismiss={busy}
      title={rtl ? 'استيراد مشتركين' : 'Import members'}
      description={
        rtl
          ? 'ملف Excel: الاسم، الهاتف، البريد، تاريخ الميلاد، الملاحظات الطبية. كل صف يُسجَّل فعلًا.'
          : 'Excel file: name, phone, email, birth date, medical notes. Every row is really inserted.'
      }
      footer={
        <div className="flex w-full gap-2">
          <button
            type="button"
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            {rtl ? 'إغلاق' : 'Close'}
          </button>
          {rows.length > 0 && !result && (
            <button
              type="button"
              disabled={busy}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              onClick={run}
            >
              {busy ? (rtl ? 'جاري الاستيراد…' : 'Importing…') : (rtl ? `استيراد ${rows.length} صفًا` : `Import ${rows.length} rows`)}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-lg">upload_file</span>
            {rtl ? 'اختيار ملف Excel' : 'Choose Excel'}
          </button>
          <button
            type="button"
            onClick={() => downloadMatrixXlsx('members-template.xlsx', [TEMPLATE_HEADERS, TEMPLATE_SAMPLE])}
            className="text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
          >
            {rtl ? 'تنزيل القالب' : 'Download template'}
          </button>
        </div>

        {fileName !== '' && (
          <p className="text-xs text-gray-600">
            {fileName} — {rtl ? `${rows.length} صفًا جاهزًا` : `${rows.length} rows ready`}
          </p>
        )}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
        )}
        {result && (
          <div className="text-xs space-y-1.5">
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-emerald-800 font-semibold">
              <span>{rtl ? 'نجح' : 'Imported'}</span>
              <span>{result.imported}</span>
            </div>
            <div className={`flex items-center justify-between rounded-xl px-3 py-2 font-semibold border ${result.failed > 0 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
              <span>{rtl ? 'فشل' : 'Failed'}</span>
              <span>{result.failed}</span>
            </div>
            {result.errors.length > 0 && (
              <ul className="max-h-32 overflow-y-auto bg-gray-50 border border-gray-100 rounded-xl p-2 space-y-1">
                {result.errors.slice(0, 10).map((err, i) => (
                  <li key={i} className="text-red-600">{rtl ? `صف ${err.row}: ` : `row ${err.row}: `}{err.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
