import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { importCsv, getSettings, resetGym, type ImportResult, type ImportType } from '../../../services/api';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { parseCsv, downloadCsv } from '../../../utils/csv';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';

/**
 * MigrationTab — §34ج: the old version faked imports (setTimeout + a success
 * toast, no endpoint behind any of it) and listed providers (Mindbody, Wodify…)
 * we have no integration with. This is the real one: pick a CSV file → the
 * browser parses it → POST /api/import/:type inserts every row for real and
 * reports per-row failures honestly.
 */

interface EntityDef {
  id: ImportType;
  icon: string;
  labelEn: string;
  labelAr: string;
  descEn: string;
  descAr: string;
  template: string; // canonical CSV headers (match server ALIASES map)
  sample: string;
}

const ENTITIES: EntityDef[] = [
  {
    id: 'members', icon: 'group', labelEn: 'Import Members', labelAr: 'استيراد الأعضاء',
    descEn: 'CSV: name, phone, email, birth date, medical notes',
    descAr: 'ملف CSV: الاسم، الهاتف، البريد، تاريخ الميلاد، الملاحظات الطبية',
    template: 'full_name,phone_number,email,birth_date,medical_notes',
    sample: 'أحمد محمد,+201000000001,ahmed@example.com,1995-04-12,—',
  },
  {
    id: 'memberships', icon: 'card_membership', labelEn: 'Import Subscriptions', labelAr: 'استيراد الاشتراكات',
    descEn: 'CSV: member phone, plan title, start/end dates, price paid',
    descAr: 'ملف CSV: هاتف العضو، اسم الباقة، بدايات/نهايات، المبلغ المدفوع',
    template: 'member_phone,plan_title,start_date,end_date,price_paid',
    sample: '+201000000001,ذهبي 3 أشهر,2026-10-01,2026-12-31,500',
  },
  {
    id: 'attendance', icon: 'fact_check', labelEn: 'Import Attendance', labelAr: 'استيراد الحضور',
    descEn: 'CSV: member phone, date (YYYY-MM-DD), time (HH:MM)',
    descAr: 'ملف CSV: هاتف العضو، التاريخ YYYY-MM-DD، الوقت HH:MM',
    template: 'member_phone,date,time',
    sample: '+201000000001,2026-10-01,18:30',
  },
  {
    id: 'leads', icon: 'leaderboard', labelEn: 'Import Leads', labelAr: 'استيراد العملاء المحتملين',
    descEn: 'CSV: name, phone, email, source, status, notes',
    descAr: 'ملف CSV: الاسم، الهاتف، البريد، المصدر، الحالة، ملاحظات',
    template: 'name,phone,email,source,status,notes',
    sample: 'سارة علي,+201000000002,sara@example.com,instagram,new,—',
  },
  {
    id: 'payments', icon: 'payments', labelEn: 'Import Payments', labelAr: 'استيراد المدفوعات',
    descEn: 'CSV: member phone, amount, description, payment method',
    descAr: 'ملف CSV: هاتف العضو، المبلغ، البيان، طريقة الدفع',
    template: 'member_phone,amount,description,payment_method',
    sample: '+201000000001,250,دفعة اشتراك,cash',
  },
  {
    id: 'products', icon: 'inventory_2', labelEn: 'Import Products', labelAr: 'استيراد المنتجات',
    descEn: 'CSV: name, selling price, purchase price, stock, barcode',
    descAr: 'ملف CSV: الاسم، سعر البيع، سعر الشراء، المخزون، الباركود',
    template: 'name,selling_price,purchase_price,stock_quantity,barcode',
    sample: 'ماء 600مل,10,6,100,6221234567890',
  },
];

interface CardState {
  fileName: string;
  rowCount: number;
  rows: Record<string, string>[];
  busy: boolean;
  result: ImportResult | null;
  error: string | null;
}

const EMPTY: CardState = { fileName: '', rowCount: 0, rows: [], busy: false, result: null, error: null };

export default function MigrationTab() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [states, setStates] = useState<Record<string, CardState>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const st = (id: string): CardState => states[id] || EMPTY;
  const setSt = (id: string, patch: Partial<CardState>) =>
    setStates((prev) => ({ ...prev, [id]: { ...(prev[id] || EMPTY), ...patch } }));

  const handleFile = (entity: EntityDef, file: File | undefined) => {
    if (!file) return;
    file.text().then((text) => {
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setSt(entity.id, { fileName: file.name, rows: [], rowCount: 0, error: rtl ? 'الملف لا يحتوي صفوف بيانات بعد رأس الأعمدة' : 'File has no data rows after the header' });
        return;
      }
      if (rows.length > 2000) {
        setSt(entity.id, { fileName: file.name, rows: [], rowCount: rows.length, error: rtl ? `الملف فيه ${rows.length} صفًا — الحد الأقصى 2000، قسّمه` : `File has ${rows.length} rows — split it (max 2000 per import)` });
        return;
      }
      setSt(entity.id, { fileName: file.name, rows, rowCount: rows.length, error: null, result: null });
    });
  };

  const runImport = async (entity: EntityDef) => {
    const s = st(entity.id);
    if (s.rows.length === 0 || s.busy) return;
    setSt(entity.id, { busy: true, error: null, result: null });
    try {
      const result = await importCsv(entity.id, s.rows);
      setSt(entity.id, { busy: false, result });
      if (result.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['members'] });
        queryClient.invalidateQueries({ queryKey: ['member'] });
        queryClient.invalidateQueries({ queryKey: ['customer360'] });
        queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['cashbook'] });
        queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['products-all'] });
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['attendance'] });
        showToast(
          rtl
            ? `تم استيراد ${result.imported} صفًا${result.failed ? ` وفشل ${result.failed}` : ''}`
            : `Imported ${result.imported} rows${result.failed ? `, ${result.failed} failed` : ''}`,
          result.failed ? 'warning' : 'success',
        );
      } else {
        showToast(rtl ? 'لم يُستورد أي صف — راجع رسائل الأخطاء' : 'No rows imported — see the error list', 'error');
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || (rtl ? 'فشل الاتصال بالسيرفر' : 'Server request failed');
      setSt(entity.id, { busy: false, error: msg });
      showToast(msg, 'error');
    }
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-4">
      <p className="text-sm text-gray-500">
        {rtl
          ? 'استيراد البيانات من ملف CSV. كل صف يُسجَّل فعليًا في قاعدة البيانات، وتظهر لك نتائج دقيقة: كم نجح وكم فشل ولماذا.'
          : 'Import from a CSV file. Every row is really written to the database, and you get an honest per-row report: what landed, what failed, and why.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ENTITIES.map((entity) => {
          const s = st(entity.id);
          return (
            <div key={entity.id} className="border border-gray-100 rounded-3xl p-4 shadow-sm hover:shadow-md transition-shadow bg-white">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-2xl">{entity.icon}</span>
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">{rtl ? entity.labelAr : entity.labelEn}</h3>
              <p className="text-xs text-gray-500 mb-3">{rtl ? entity.descAr : entity.descEn}</p>

              <div className="flex flex-wrap items-center gap-2 mb-2">
                <input
                  ref={(el) => { fileRefs.current[entity.id] = el; }}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => handleFile(entity, e.target.files?.[0])}
                />
                <Button variant="outline" className="text-xs px-3 py-1.5" onClick={() => fileRefs.current[entity.id]?.click()}>
                  <span className="material-symbols-outlined text-lg">upload_file</span>
                  {rtl ? 'اختيار ملف CSV' : 'Choose CSV'}
                </Button>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${entity.id}-template.csv`, `${entity.template}\n${entity.sample}`)}
                  className="text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                >
                  {rtl ? 'تنزيل القالب' : 'Download template'}
                </button>
              </div>

              {s.fileName && (
                <p className="text-xs text-gray-600 mb-2">
                  {s.fileName} — {rtl ? `${s.rowCount} صفًا جاهزًا` : `${s.rowCount} rows ready`}
                </p>
              )}

              {s.rows.length > 0 && !s.result && (
                <Button variant="primary" className="text-xs px-4 py-2 mt-1" onClick={() => runImport(entity)} disabled={s.busy}>
                  {s.busy ? (
                    <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-lg">download</span>
                  )}
                  {s.busy ? (rtl ? 'جاري الاستيراد...' : 'Importing...') : (rtl ? `استيراد ${s.rowCount} صفًا` : `Import ${s.rowCount} rows`)}
                </Button>
              )}

              {s.error && (
                <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{s.error}</p>
              )}

              {s.result && (
                <div className="mt-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-emerald-800 font-semibold">
                    <span>{rtl ? 'نجح الاستيراد' : 'Imported'}</span>
                    <span>{s.result.imported}</span>
                  </div>
                  <div className={`flex items-center justify-between rounded-xl px-3 py-2 font-semibold border ${s.result.failed > 0 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                    <span>{rtl ? 'فشل' : 'Failed'}</span>
                    <span>{s.result.failed}</span>
                  </div>
                  {s.result.errors.length > 0 && (
                    <ul className="max-h-32 overflow-y-auto bg-gray-50 border border-gray-100 rounded-xl p-2 space-y-1">
                      {s.result.errors.slice(0, 10).map((err, i) => (
                        <li key={i} className="text-red-600">
                          {rtl ? `صف ${err.row}: ` : `row ${err.row}: `}{err.message}
                        </li>
                      ))}
                      {s.result.errors.length > 10 && (
                        <li className="text-gray-500">…{rtl ? `و${s.result.errors.length - 10} خطأ آخر` : `and ${s.result.errors.length - 10} more`}</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Card className="bg-amber-50/60 border-amber-100">
        <p className="text-xs text-amber-800 leading-relaxed">
          {rtl
            ? 'ملاحظة: استيراد الاشتراكات والمدفوعات والحضور يتطلب وجود العضو بهاتف مطابق قبل الاستيراد — استورد الأعضاء أولًا. الصفوف المكررة تُرفض برسالة واضحة ولا تُكتب مرتين.'
            : 'Note: importing subscriptions, payments and attendance requires the member to exist with a matching phone — import members first. Duplicate rows are rejected with a clear message and never double-inserted.'}
        </p>
      </Card>

      <DangerZone rtl={rtl} />
    </div>
  );
}

// منطقة الخطر: تصفير الصالة — نسخة احتياطية أولًا server-side، ثم مسح
// بيانات التشغيل وإعادة بذر الكتالوجات. يبقى: الصالة والموظفون والفروع
// ومفاتيح API وعقود المنصة وسجل الأنشطة (محمي من الحذف). التأكيد بكتابة
// اسم الصالة حرفيًا.
function DangerZone({ rtl }: { rtl: boolean }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: settingsRes } = useApiQuery(['settings'], getSettings, { staleTime: 5 * 60_000 });
  const gymName = String(settingsRes?.data?.gym_name || '');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const match = confirm.trim().toLowerCase() === gymName.trim().toLowerCase() && gymName.trim() !== '';

  const doReset = async () => {
    if (!match || busy) return;
    if (!window.confirm(rtl ? 'تأكيد أخير: سيُمسح كل شيء!' : 'Final confirm: everything goes!')) return;
    setBusy(true);
    try {
      const res = await resetGym(confirm.trim());
      queryClient.invalidateQueries();
      showToast(
        rtl ? `تم التصفير — نسخة الأمان: ${res.data.backup}` : `Reset done — safety backup: ${res.data.backup}`,
        'success',
      );
      setConfirm('');
      window.location.href = '/admin/dashboard';
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل التصفير — لم يُمسح شيء' : 'Reset failed — nothing deleted'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-red-200 bg-red-50/50 rounded-3xl p-4 md:p-5">
      <h3 className="font-bold text-red-700 flex items-center gap-2">
        <span className="material-symbols-outlined">warning</span>
        {rtl ? 'منطقة الخطر: تصفير الصالة' : 'Danger zone: factory reset'}
      </h3>
      <p className="mt-1.5 text-xs text-red-600/80 leading-relaxed">
        {rtl
          ? 'يمسح الأعضاء والاشتراكات والديون والمالية والمخزون والحضور والموارد وكل الإعدادات، ويعيد الصالة نظيفة (كتالوج الرياضات والباقات الافتراضية يُعاد بذرهما). يبقى: الصالة والموظفون والفروع ومفاتيح API وعقود المنصة وسجل الأنشطة. نسخة احتياطية تُؤخذ أولًا تلقائيًا.'
          : 'Wipes members, subs, debts, finance, stock, attendance, HR and all settings, then reseeds catalogs. Keeps: gym, staff, branches, API keys, platform contracts and the audit log. A safety backup runs first.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={rtl ? `اكتب اسم الصالة للتأكيد: ${gymName || '…'}` : 'Type the gym name to confirm'}
          className="flex-1 min-w-[220px] px-4 py-2.5 bg-white border border-red-200 rounded-2xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/40 placeholder:text-gray-400"
        />
        <button
          type="button"
          onClick={doReset}
          disabled={!match || busy}
          className="min-h-[44px] px-6 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {busy ? (rtl ? 'جارٍ التصفير…' : 'Resetting…') : (rtl ? 'تصفير الصالة' : 'Reset gym')}
        </button>
      </div>
    </div>
  );
}
