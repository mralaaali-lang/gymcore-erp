/**
 * Dashboard Design Kit — Canonical visual language adopted from GymAdminDashboard.
 *
 * Rules (do NOT deviate):
 * - Page container: `space-y-6` (AppLayout supplies bg/padding — do NOT set bg here)
 * - Cards: `bg-white rounded-3xl shadow-sm border border-gray-100 p-5 md:p-6`
 * - Titles: `text-2xl md:text-3xl font-bold text-gray-900 tracking-tight`
 * - Subtitles: `text-sm text-gray-500`
 * - Section titles: `text-lg font-bold text-gray-900`
 * - Primary action: `bg-gray-900 text-white rounded-xl shadow` / Secondary: `bg-white border border-gray-200`
 * - Accent CTA: `bg-cyan-500 hover:bg-cyan-600 shadow-cyan-500/25 text-white`
 */

export type AccentName = 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose' | 'sky' | 'gray';

export const ACCENTS: Record<AccentName, { solid: string; soft: string }> = {
  cyan: { solid: '#06b6d4', soft: '#cffafe' },
  emerald: { solid: '#10b981', soft: '#d1fae5' },
  violet: { solid: '#8b5cf6', soft: '#ede9fe' },
  amber: { solid: '#f59e0b', soft: '#fef3c7' },
  rose: { solid: '#f43f5e', soft: '#ffe4e6' },
  sky: { solid: '#0ea5e9', soft: '#e0f2fe' },
  gray: { solid: '#6b7280', soft: '#f3f4f6' },
};

export const CARD_CLASS =
  'bg-white rounded-3xl shadow-sm border border-gray-100 p-5 md:p-6';

export const CARD_HOVER_CLASS =
  'bg-white rounded-3xl shadow-sm border border-gray-100 p-5 md:p-6 hover:shadow-md transition-shadow duration-300';
