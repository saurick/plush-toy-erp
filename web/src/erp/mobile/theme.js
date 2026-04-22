export const mobileTheme = {
  badge:
    'inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-700',
  metaBadge:
    'rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-500',
  heroTitle: 'text-2xl font-semibold text-slate-900',
  heroDescription: 'mt-2 text-sm leading-6 text-slate-600',
  sectionEyebrow: 'text-xs uppercase tracking-[0.22em] text-slate-500',
  sectionTitle: 'text-lg font-semibold text-slate-900',
  highlightCard:
    'rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]',
  highlightLabel: 'text-xs uppercase tracking-[0.2em] text-slate-500',
  highlightValue: 'mt-3 text-lg font-semibold text-slate-900',
  highlightNote: 'mt-2 text-sm leading-6 text-slate-600',
  listItem:
    'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700',
  emphasisItem:
    'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.04)]',
  warningItem:
    'rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900',
}

export function getMobileNavItemClass(isActive) {
  return `rounded-2xl border px-3 py-2 text-center text-sm font-medium transition ${
    isActive
      ? 'border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_8px_18px_rgba(8,145,178,0.12)]'
      : 'border-slate-200 bg-slate-50 text-slate-600'
  }`
}
