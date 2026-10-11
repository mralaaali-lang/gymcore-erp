import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { listMembers, type MemberResponse } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import FilterBar from '../../components/shared/FilterBar';
import PageLoader from '../../components/shared/PageLoader';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

const statusLabels: Record<string, string> = {
  active: 'نشط',
  expired: 'منتهي',
  suspended: 'موقوف',
};

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'error';
  return 'neutral';
}

export default function MemberList() {
  const { language, role } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const perPage = 5;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMembers({
        search: debouncedSearch || undefined,
        status: filter !== 'all' ? filter : undefined,
        page,
        limit: perPage,
      });
      setMembers(data.members || []);
      setTotal(data.total || 0);
    } catch {
      showToast(language === 'ar' ? 'فشل تحميل قائمة المشتركين' : 'Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, page, language, showToast]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const pages = Math.ceil(total / perPage);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      <PageHeader
        title={rtl ? 'إدارة المشتركين' : 'Member Directory'}
        subtitle={rtl ? 'قائمة المشتركين في الصالة' : 'Gym member directory'}
        icon="groups"
      />

      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder={rtl ? 'بحث بالاسم أو الجوال...' : 'Search name or phone...'}
        filters={[
          {
            key: 'status',
            value: filter === 'all' ? '' : filter,
            placeholder: rtl ? 'الكل' : 'All',
            options: [
              { value: 'active', labelAr: 'نشط', labelEn: 'Active' },
              { value: 'expired', labelAr: 'منتهي', labelEn: 'Expired' },
              { value: 'suspended', labelAr: 'موقوف', labelEn: 'Suspended' },
            ],
          },
        ]}
        onFilterChange={(_key, val) => { setFilter(val || 'all'); setPage(1); }}
        onRefresh={fetchMembers}
      />

      {loading ? (
        <PageLoader variant="skeleton" rows={5} />
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الاسم' : 'Name'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الجوال' : 'Phone'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الباقة' : 'Plan'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'تاريخ الاشتراك' : 'Join Date'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{(page - 1) * perPage + i + 1}</td>
                    <td className="p-4 font-medium text-gray-900">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">
                          {(m.full_name || '?').charAt(0)}
                        </span>
                        {m.full_name}
                      </div>
                    </td>
                    <td className="p-4 text-gray-500" dir="ltr">{m.phone_number}</td>
                    <td className="p-4 text-gray-500">{m.plan_name}</td>
                    <td className="p-4">
                      <StatusBadge status={statusLabels[m.status || 'suspended']} variant={statusVariant(m.status || 'suspended')} />
                    </td>
                    <td className="p-4 text-gray-500">{m.join_date}</td>
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        className="text-emerald-600 hover:text-emerald-700 text-sm px-3 py-1.5"
                        onClick={() => {
                          if (role === 'trainer') {
                            navigate(`/trainer/clients/${m.id}`);
                          } else {
                            showToast(rtl ? 'صفحة العضو قادمة قريباً' : 'Member profile coming soon', 'success');
                          }
                        }}
                      >
                        {rtl ? 'عرض' : 'View'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center">
                      <span className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                        <span className="material-symbols-outlined text-3xl text-gray-400">search_off</span>
                      </span>
                      <p className="text-gray-500 text-sm">{rtl ? 'لا توجد نتائج' : 'No results found'}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">
                {rtl ? `صفحة ${page} من ${pages}` : `Page ${page} of ${pages}`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="px-3 py-1.5 text-sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  {rtl ? 'السابق' : 'Previous'}
                </Button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                  const start = pages <= 5 ? 1 : Math.max(1, Math.min(page - 2, pages - 4));
                  const p = start + i;
                  if (p > pages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-xl text-sm font-medium transition ${page === p ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <Button
                  variant="outline"
                  className="px-3 py-1.5 text-sm"
                  onClick={() => setPage(Math.min(pages, page + 1))}
                  disabled={page === pages}
                >
                  {rtl ? 'التالي' : 'Next'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
