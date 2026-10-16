/**
 * Shared Components — Index
 *
 * Centralized, reusable components for use across all portals (super-admin, gym-admin, trainer, reception, player).
 *
 * ## Components
 *
 * | Component | Purpose | Key Props |
 * |-----------|---------|-----------|
 * | `PageHeader` | Page title + subtitle + breadcrumbs + actions | `title`, `subtitle`, `actions`, `icon`, `breadcrumbs` |
 * | `UnifiedTabs` | Standardized tab navigation (3 variants) | `tabs`, `activeKey`, `onChange`, `variant` |
 * | `PageLoader` | Loading state (spinner/skeleton) | `variant`, `rows`, `message`, `fullPage` |
 * | `StatsGrid` | Responsive stat/metric cards grid | `stats`, `columns` |
 * | `FilterBar` | Search input + filter dropdowns + actions | `search`, `onSearchChange`, `filters`, `onRefresh` |
 * | `ExportButton` | CSV export with column selection | `columns`, `data`, `filename` |
 *
 * ## Design Principles
 *
 * 1. **RTL Support**: All components automatically adapt to Arabic (`language === 'ar'`)
 * 2. **Material Symbols**: Use `material-symbols-outlined` icon class
 * 3. **Tailwind Design Tokens**: Use project tokens (petrol, on-surface, surface-container, etc.)
 * 4. **TypeScript**: Full type safety with exported interfaces
 * 5. **i18n-Ready**: Accept both Arabic/English labels via `t()` or direct props
 * 6. **Composable**: Components work together (e.g., PageHeader actions can include FilterBar + ExportButton)
 *
 * ## Usage Example
 *
 * ```tsx
 * import PageHeader from '../../components/shared/PageHeader';
 * import UnifiedTabs from '../../components/shared/UnifiedTabs';
 * import StatsGrid from '../../components/shared/StatsGrid';
 * import FilterBar from '../../components/shared/FilterBar';
 * import ExportButton from '../../components/shared/ExportButton';
 * import PageLoader from '../../components/shared/PageLoader';
 *
 * export default function MyPage() {
 *   const [search, setSearch] = useState('');
 *   const [activeTab, setActiveTab] = useState('overview');
 *   const { data, isLoading } = useQuery(...);
 *
 *   if (isLoading) return <PageLoader variant='skeleton' rows={5} />;
 *
 *   return (
 *     <div>
 *       <PageHeader
 *         title={t('العنوان', 'Title')}
 *         subtitle={t('الوصف', 'Description')}
 *         icon='dashboard'
 *         actions={<ExportButton columns={cols} data={data} />}
 *       />
 *       <FilterBar search={search} onSearchChange={setSearch} />
 *       <UnifiedTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
 *       <StatsGrid stats={stats} columns={4} />
 *     </div>
 *   );
 * }
 * ```
 */

export { default as PageHeader } from './PageHeader';
export { default as UnifiedTabs } from './UnifiedTabs';
export { default as PageLoader } from './PageLoader';
export { default as StatsGrid } from './StatsGrid';
export { default as FilterBar } from './FilterBar';
export { default as ExportButton } from './ExportButton';
export {
  default as Skeleton,
  SkeletonText,
  SkeletonStats,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonRows,
} from './Skeleton';
export { default as CountUp } from './CountUp';

export type { Tab } from './UnifiedTabs';
export type { StatItem } from './StatsGrid';
export type { FilterOption, FilterGroup } from './FilterBar';
export type { ExportColumn } from './ExportButton';
export type { SkeletonProps } from './Skeleton';
