import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import type { NavItem, UserRole } from '../../types';
import {
  LayoutDashboard, Users, Package, ClipboardCheck, ShoppingCart,
  Warehouse, Wallet, Clock, BarChart3, MessageSquare, Settings,
  Database, Brain, Palette, Bell, Tv, LogOut, Sparkles,
  Receipt, Megaphone, Globe, Dumbbell, Armchair, CircleUserRound, HelpCircle, Code,
  CreditCard, Banknote, Percent, Target, CalendarDays, UserCog,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  users: Users,
  package: Package,
  attendance: ClipboardCheck,
  products: ShoppingCart,
  inventory: Warehouse,
  finance: Wallet,
  shifts: Clock,
  reports: BarChart3,
  messages: MessageSquare,
  settings: Settings,
  database: Database,
  coach: Brain,
  branding: Palette,
  retention: Bell,
  notifications: Bell,
  leaderboard: Tv,
  invoices: Receipt,
  marketing: Megaphone,
  website: Globe,
  sales: ShoppingCart,
  gym: Dumbbell,
  reception: Armchair,
  account: CircleUserRound,
  help: HelpCircle,
  code: Code,
  subscriptions: CreditCard,
  expenses: Percent,
  cashbox: Banknote,
  crm: Target,
  team: UserCog,
  schedule: CalendarDays,
};

const ROLE_BASE: Record<UserRole, string> = {
  'super-admin': '/super-admin',
  'gym-admin': '/admin',
  'trainer': '/trainer',
  'reception': '/reception',
  'player': '/player',
};

interface SidebarProps {
  items: NavItem[];
}

interface NavGroup {
  title: string | null; // null → items rendered before any section header
  items: NavItem[];
}

/**
 * Group nav items by their `section` label, preserving both the order items
 * appear in and the order sections first appear. Items without a section land
 * in the leading ungrouped block (title = null).
 */
function groupNavItems(items: NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  const byTitle = new Map<string | null, NavGroup>();

  for (const item of items) {
    const title = item.section ?? null;
    let group = byTitle.get(title);
    if (!group) {
      group = { title, items: [] };
      byTitle.set(title, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export default function Sidebar({ items }: SidebarProps) {
  const { isSidebarOpen, role, logout } = useApp();
  const { t } = useTranslation();

  const filteredItems = items.filter((item) =>
    item.roles.some((r) => r === role)
  );

  const groups = useMemo(
    () => groupNavItems(filteredItems),
    [filteredItems]
  );

  const renderItem = (item: NavItem) => {
    const IconComp = iconMap[item.icon] as LucideIcon | undefined;

    return (
      <NavLink
        key={item.path}
        to={item.path}
        title={item.label}
        className={({ isActive }) =>
          `group flex items-center gap-3 py-2.5 px-3 mx-2 rounded-xl transition-all duration-200 relative ${
            isActive
              ? 'text-emerald-700 bg-emerald-50 font-bold'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-medium'
          }`
        }
      >
        {({ isActive }) => (
          <>
            {IconComp && (
              <IconComp
                size={18}
                strokeWidth={1.75}
                className={`shrink-0 transition-all duration-200 ${isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-gray-600'}`}
              />
            )}
            <span className="text-[13px] leading-tight truncate">{item.label}</span>

            {item.premium && !item.badge && (
              <Sparkles size={13} className="ms-auto shrink-0 text-amber-400" />
            )}
            {item.badge !== undefined && item.badge !== 0 && item.badge !== '0' && (
              typeof item.badge === 'number' ? (
                <span className="ms-auto shrink-0 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {item.badge}
                </span>
              ) : (
                <span className="ms-auto shrink-0 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[9px] font-bold">
                  {item.badge}
                </span>
              )
            )}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <aside
      dir="rtl"
      className={`bg-white border-e border-gray-100 hidden md:flex flex-col h-screen sticky start-0 top-0 overflow-y-auto w-64 z-40 shrink-0 transition-all duration-200 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="py-4 px-4 flex items-center gap-2.5 border-b border-gray-100 shrink-0">
        <NavLink to={`${ROLE_BASE[role]}/dashboard`} className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-emerald-500/30 shrink-0">
            ج
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">GymCore</p>
            <p className="text-[10px] text-gray-400 truncate">{t('sidebar.brandTagline')}</p>
          </div>
        </NavLink>
      </div>

      <nav className="flex-1 flex flex-col py-2">
        {groups.map((group) => (
          <div key={group.title ?? '__flat'} className="flex flex-col gap-0.5">
            {group.title && (
              <p className="px-4 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 select-none">
                {group.title}
              </p>
            )}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      <div className="p-2 border-t border-gray-100 mt-auto shrink-0">
        <button
          type="button"
          onClick={logout}
          title={t('sidebar.logout')}
          className="flex items-center gap-3 py-2.5 px-3 w-full rounded-xl text-[13px] font-medium text-gray-600 transition-all duration-200 hover:bg-red-50 hover:text-red-600 group"
        >
          <LogOut size={18} strokeWidth={1.75} className="text-gray-400 group-hover:text-red-500 transition-colors" />
          <span>{t('sidebar.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
