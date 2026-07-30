import React from 'react'

const DEFAULT_ROW_COUNT = 4

function SkeletonBlock({ className = '' }) {
  return <span className={`mobile-role-skeleton__block ${className}`} />
}

export default function MobileTaskListSkeleton({
  filterCount = 3,
  rowCount = DEFAULT_ROW_COUNT,
}) {
  const normalizedFilterCount = filterCount === 4 ? 4 : 3
  const filters = Array.from(
    { length: normalizedFilterCount },
    (_, index) => index
  )
  const rows = Array.from({ length: rowCount }, (_, index) => index)

  return (
    <section
      className="mobile-role-skeleton mx-5 mt-5 pb-5"
      data-testid="mobile-role-task-skeleton"
      data-skeleton-filter-count={filters.length}
      data-skeleton-row-count={rows.length}
      aria-hidden="true"
    >
      <div className="mobile-role-skeleton__focus rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <SkeletonBlock className="mobile-role-skeleton__focus-kicker" />
        <SkeletonBlock className="mobile-role-skeleton__focus-title" />
        <SkeletonBlock className="mobile-role-skeleton__focus-copy" />
        <SkeletonBlock className="mobile-role-skeleton__focus-counts" />
      </div>

      <div
        className="mobile-role-skeleton__filters mt-4 grid rounded-2xl bg-slate-100 p-1 shadow-inner"
        style={{
          gridTemplateColumns: `repeat(${filters.length}, minmax(0, 1fr))`,
        }}
      >
        {filters.map((item) => (
          <div key={item} className="mobile-role-skeleton__filter">
            <SkeletonBlock />
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="grid grid-cols-[minmax(0,1fr)_112px] pb-2">
          <SkeletonBlock className="mobile-role-skeleton__table-heading" />
          <SkeletonBlock className="mobile-role-skeleton__table-heading mobile-role-skeleton__table-heading--right" />
        </div>
        <div className="mobile-role-skeleton__list overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.map((item) => (
            <div
              key={item}
              className="mobile-role-skeleton__row grid grid-cols-[64px_minmax(0,1fr)_94px] gap-3 px-5 py-4"
            >
              <SkeletonBlock className="mobile-role-skeleton__badge" />
              <div className="min-w-0">
                <SkeletonBlock className="mobile-role-skeleton__title" />
                <SkeletonBlock className="mobile-role-skeleton__source" />
                <SkeletonBlock className="mobile-role-skeleton__meta" />
              </div>
              <div className="min-w-0">
                <SkeletonBlock className="mobile-role-skeleton__chip" />
                <SkeletonBlock className="mobile-role-skeleton__time" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
