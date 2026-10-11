/**
 * Dashboard Design Kit — canonical visual language (adopted from GymAdminDashboard).
 * Use these primitives for ALL pages: headers, KPI cards, panels, banners, empty states.
 */
export { default as DashboardPage, PrimaryAction, SecondaryAction, AccentAction } from './DashboardPage';
export { default as StatCard } from './StatCard';
export { default as Panel } from './Panel';
export { default as Banner } from './Banner';
export { default as EmptyState } from './EmptyState';
export { default as Sparkline } from './Sparkline';
export { ACCENTS, CARD_CLASS, CARD_HOVER_CLASS } from './tokens';
export type { AccentName } from './tokens';
