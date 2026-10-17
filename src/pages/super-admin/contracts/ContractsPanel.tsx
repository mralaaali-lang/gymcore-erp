import { useMemo, useState } from 'react';
import { MagnifyingGlass as Search, FileText, Plus, Eye, ArrowSquareOut as ExternalLink } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useApiQuery } from '../../../hooks/useApiQuery';
import {
  listContracts,
  listPlatformGyms,
  listBillingPlans,
  type PlatformContract,
} from '../../../services/api';
import { formatDate } from '../../../utils/date';
import Panel from '../../../components/dashboard/Panel';
import { fmtMoney, cycleLabel, CONTRACT_STATUS_CLASS, BTN_PRIMARY } from './contractsUtils';
import ContractFormModal from './ContractFormModal';
import ContractDetailModal from './ContractDetailModal';

// §40 — لوحة عقود المنصة: مصدر الحقيقة التعاقدية في مركز إجراءات السوبر-أدمان.

interface Props {
  isRtl: boolean;
  t: (en: string, ar: string) => string;
}

export default function ContractsPanel({ isRtl, t }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('active');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingContract, setEditingContract] = useState<PlatformContract | undefined>(undefined);

  const { data: contractsRes, isLoading } = useApiQuery(
    ['platform', 'contracts', 'list', statusFilter],
    () => listContracts(statusFilter === 'all' ? undefined : { status: statusFilter }),
    { staleTime: 20_000 },
  );
  const { data: gymsRes } = useApiQuery(['platform', 'gyms'], listPlatformGyms, { staleTime: 30_000 });
  const { data: plansRes } = useApiQuery(['platform', 'plans'], () => listBillingPlans(), { staleTime: 300_000 });

  const contracts = contractsRes?.data ?? [];
  const gyms = gymsRes?.data ?? [];
  const plans = plansRes?.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return contracts;
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => c.gym_name.toLowerCase().includes(q) || c.subdomain.toLowerCase().includes(q) || (c.plan_name || '').toLowerCase().includes(q));
  }, [contracts, search]);

  const openCreate = () => { setEditingContract(undefined); setFormMode('create'); };
  const openEdit = (c: PlatformContract) => { setEditingContract(c); setFormMode('edit'); };

  return (
    <>
      <Panel
        title={t('Platform Contracts', 'عقود المنصة')}
        subtitle={t('One active contract per gym — items, renewals, and invoices', 'عقد سارٍ واحد لكل صالة — البنود والتجديدات والفواتير')}
        icon={FileText}
        accent="emerald"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search contracts...', 'بحث في العقود...')}
                className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 pr-9 w-44 focus:ring-2 focus:ring-emerald-500/30 outline-none placeholder-gray-400"
              />
            </div>
            <select
              value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500/30 outline-none"
            >
              <option value="active">{t('Active', 'سارية')}</option>
              <option value="cancelled">{t('Cancelled', 'ملغاة')}</option>
              <option value="all">{t('All', 'الكل')}</option>
            </select>
            <button onClick={openCreate} className={BTN_PRIMARY}>
              <Plus size={15} />{t('Sign contract', 'إبرام عقد')}
            </button>
          </div>
        }
      >
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <FileText size={30} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">{search ? t('No contracts match the search', 'لا عقود تطابق البحث') : t('No contracts in this state', 'لا عقود بهذه الحالة')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-600">
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Gym', 'الصالة')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Plan', 'الباقة')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Cycle', 'الدورة')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Price', 'السعر')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Renewal', 'التجديد')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Items', 'البنود')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Status', 'الحالة')}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-emerald-50/30 transition-colors cursor-pointer" onClick={() => setDetailId(c.id)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{c.gym_name}</p>
                      <p className="text-[11px] text-gray-400" dir="ltr">{c.subdomain}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{isRtl ? (c.plan_name_ar || c.plan_name) : c.plan_name}</td>
                    <td className="px-4 py-3 text-gray-600">{cycleLabel(c.cycle, isRtl)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900" dir="ltr">{fmtMoney(c.price, c.currency)}</td>
                    <td className="px-4 py-3 text-gray-600" dir="ltr">
                      <span>{c.renewal_date ? formatDate(c.renewal_date) : '—'}</span>
                      {c.auto_renew && c.status === 'active' && (
                        <span className="ms-1.5 text-[10px] text-emerald-600 font-semibold">↻</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600" dir="ltr">{c.live_items} · {fmtMoney(c.items_total, c.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CONTRACT_STATUS_CLASS[c.status] || 'bg-gray-100 text-gray-500'}`}>
                        {c.status === 'active' ? t('Active', 'سارٍ') : t('Cancelled', 'ملغى')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={(e) => { e.stopPropagation(); setDetailId(c.id); }} className="p-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors" title={t('Open contract', 'فتح العقد')}>
                          <Eye size={14} />
                        </button>
                        <Link to={`/super-admin/tenants/${c.gym_id}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors inline-flex" title={t('Open gym file', 'ملف الصالة')}>
                          <ExternalLink size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3">
          {filtered.length} / {contracts.length} {t('contracts shown', 'عقد معروض')}
        </p>
      </Panel>

      {detailId && (
        <ContractDetailModal
          contractId={detailId}
          isRtl={isRtl}
          t={t}
          onClose={() => setDetailId(null)}
          onEdit={(c) => { setDetailId(null); openEdit(c); }}
        />
      )}
      {formMode && (
        <ContractFormModal
          mode={formMode}
          contract={editingContract}
          gyms={gyms}
          plans={plans}
          isRtl={isRtl}
          t={t}
          onClose={() => setFormMode(null)}
        />
      )}
    </>
  );
}
