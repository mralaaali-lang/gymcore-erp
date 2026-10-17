import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { listMembers, type MemberResponse } from '../../services/api';
import FilterBar from '../../components/shared/FilterBar';
import PageLoader from '../../components/shared/PageLoader';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
import { formatDate } from '../../utils/date';

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

// The two columns `/api/members` will actually order by. Its SORTS map is a
// strict whitelist (member_name/created_at/end_date/remaining/visits/
// last_visit), and the plan and status cells are not in it — a header on those
// would fetch a page that is not sorted and display it as if it were.
// The ids below ARE the `sort=` values, so nothing needs translating.
const DEFAULT_SORT = 'created_at';

export default function MemberList() {
  const { language, role } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
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
        sort,
        order,
      });
      setMembers(data.members || []);
      setTotal(data.total || 0);
    } catch {
      showToast(language === 'ar' ? 'فشل تحميل قائمة المشتركين' : 'Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, page, sort, order, language, showToast]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const pages = Math.ceil(total / perPage);

  const columns: TableColumn<MemberResponse>[] = [
    {
      id: '__n',
      label: rtl ? 'م' : '#',
      width: '3.5rem',
      numeric: true,
      cell: (_m, i) => (page - 1) * perPage + i + 1,
    },
    {
      id: 'member_name',
      key: 'full_name',
      label: rtl ? 'الاسم' : 'Name',
      sortable: true,
      sortDescFirst: false,
      cell: (m) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-shell bg-brass-soft text-pine text-sm font-bold">
            {(m.full_name || '?').charAt(0)}
          </span>
          <span className="font-medium text-foreground">{m.full_name}</span>
        </div>
      ),
    },
    {
      id: 'phone_number',
      key: 'phone_number',
      label: rtl ? 'الجوال' : 'Phone',
      // Coaches get rows with phone_number stripped server-side (data-exposure
      // rule in /api/members), so this cell has to say "hidden" rather than
      // render an empty box.
      cell: (m) => <span dir="ltr">{m.phone_number || '—'}</span>,
    },
    { id: 'plan_name', key: 'plan_name', label: rtl ? 'الباقة' : 'Plan' },
    {
      id: 'status',
      label: rtl ? 'الحالة' : 'Status',
      // `status` was read off the row, but the endpoint does not return that
      // key — the badge comes from the latest subscription, same as the admin
      // members screen. Reading the missing field made every row render as
      // `suspended` through the `|| 'suspended'` fallback.
      cell: (m) => {
        const key = m.subscription_status || 'none';
        return (
          <StatusBadge
            status={statusLabels[key] || (rtl ? 'بدون اشتراك' : 'No plan')}
            variant={statusVariant(key)}
          />
        );
      },
    },
    {
      id: 'created_at',
      label: rtl ? 'تاريخ الاشتراك' : 'Join Date',
      sortable: true,
      // `join_date` does not exist in the `/api/members` response — the column
      // rendered blank for every member. `created_at` is the field that carries
      // it (the same fallback MembersPage and MemberProfileView already use).
      value: (m) => m.join_date || m.created_at,
      cell: (m) => {
        const raw = m.join_date || m.created_at;
        return raw ? formatDate(String(raw)) : '—';
      },
    },
    {
      id: '__actions',
      label: rtl ? 'الإجراءات' : 'Actions',
      align: 'end',
      cell: (m) => (
        <Button
          variant="ghost"
          className="px-3 py-1.5 text-sm text-pine hover:text-foreground"
          onClick={() => {
            // §34ج — real navigation for staff too: /admin/members/:id
            // (MemberProfileView) has worked all along; only the
            // trainer path was wired and managers got a fake toast.
            if (role === 'trainer') {
              navigate(`/trainer/clients/${m.id}`);
            } else {
              navigate(`/admin/members/${m.id}`);
            }
          }}
        >
          {rtl ? 'عرض' : 'View'}
        </Button>
      ),
    },
  ];

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* §35ث — heading moved to the top bar */}

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
        <DataTable
          columns={columns}
          data={members}
          manualSorting
          sorting={[{ id: sort, desc: order === 'desc' }]}
          onSortingChange={(next) => {
            const picked = next[0];
            if (!picked) return;
            setSort(picked.id);
            setOrder(picked.desc ? 'desc' : 'asc');
            setPage(1);
          }}
          empty={
            <span className="inline-flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-3xl text-ink-faint">search_off</span>
              {rtl ? 'لا توجد نتائج' : 'No results found'}
            </span>
          }
          footer={
            pages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-table-head">
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
                        className={`h-8 w-8 rounded-shell text-sm font-medium transition ${
                          page === p
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-hairline text-muted-foreground hover:bg-muted'
                        }`}
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
            ) : undefined
          }
        />
      )}
    </div>
  );
}
