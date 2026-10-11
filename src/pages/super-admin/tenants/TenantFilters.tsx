import type { FilterTab } from './utils';

interface StatusCounts {
  all: number;
  active: number;
  suspended: number;
  expiring: number;
  expired: number;
}

interface TenantFiltersProps {
  filterTab: FilterTab;
  setFilterTab: (tab: FilterTab) => void;
  setPage: (page: number) => void;
  statusCounts: StatusCounts;
  isRtl: boolean;
}

export default function TenantFilters({
  filterTab,
  setFilterTab,
  setPage,
  statusCounts,
  isRtl,
}: TenantFiltersProps): JSX.Element {
  return (
    <>
      {/* ── Status Indicator Bar + Filter Tabs ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <button type="button" onClick={() => { setFilterTab('all'); setPage(1); }}
          className={`flex items-center gap-3 rounded-3xl px-4 py-3 shadow-sm transition-all ${filterTab === 'all' ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 ring-offset-2' : 'bg-white border border-gray-100 text-gray-700 hover:border-emerald-300 hover:shadow-md'}`}>
          <span className={`w-3 h-3 rounded-full ${filterTab === 'all' ? 'bg-white' : 'bg-gray-400'}`} />
          <div className="text-right"><p className="text-lg font-bold">{statusCounts.all}</p><p className="text-xs opacity-80">{isRtl ? 'الجميع' : 'All'}</p></div>
        </button>
        <button type="button" onClick={() => { setFilterTab('active'); setPage(1); }}
          className={`flex items-center gap-3 rounded-3xl px-4 py-3 shadow-sm transition-all ${filterTab === 'active' ? 'bg-green-600 text-white ring-2 ring-green-300 ring-offset-2' : 'bg-white border border-gray-100 text-gray-700 hover:border-green-300 hover:shadow-md'}`}>
          <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
          <div className="text-right"><p className="text-lg font-bold">{statusCounts.active}</p><p className="text-xs opacity-80">{isRtl ? 'نشط' : 'Active'}</p></div>
        </button>
        <button type="button" onClick={() => { setFilterTab('expiring'); setPage(1); }}
          className={`flex items-center gap-3 rounded-3xl px-4 py-3 shadow-sm transition-all ${filterTab === 'expiring' ? 'bg-orange-600 text-white ring-2 ring-orange-300 ring-offset-2' : 'bg-white border border-gray-100 text-gray-700 hover:border-orange-300 hover:shadow-md'}`}>
          <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
          <div className="text-right"><p className="text-lg font-bold">{statusCounts.expiring}</p><p className="text-xs opacity-80">{isRtl ? 'ينتهي قريباً' : 'Expiring'}</p></div>
        </button>
        <button type="button" onClick={() => { setFilterTab('expired'); setPage(1); }}
          className={`flex items-center gap-3 rounded-3xl px-4 py-3 shadow-sm transition-all ${filterTab === 'expired' ? 'bg-red-600 text-white ring-2 ring-red-300 ring-offset-2' : 'bg-white border border-gray-100 text-gray-700 hover:border-red-300 hover:shadow-md'}`}>
          <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
          <div className="text-right"><p className="text-lg font-bold">{statusCounts.expired}</p><p className="text-xs opacity-80">{isRtl ? 'منتهي' : 'Expired'}</p></div>
        </button>
        <button type="button" onClick={() => { setFilterTab('suspended'); setPage(1); }}
          className={`flex items-center gap-3 rounded-3xl px-4 py-3 shadow-sm transition-all ${filterTab === 'suspended' ? 'bg-red-600 text-white ring-2 ring-red-300 ring-offset-2' : 'bg-white border border-gray-100 text-gray-700 hover:border-red-300 hover:shadow-md'}`}>
          <span className="w-3 h-3 rounded-full bg-gray-400 shrink-0" />
          <div className="text-right"><p className="text-lg font-bold">{statusCounts.suspended}</p><p className="text-xs opacity-80">{isRtl ? 'موقوف' : 'Suspended'}</p></div>
        </button>
      </div>
    </>
  );
}
