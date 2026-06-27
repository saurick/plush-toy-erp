import React from 'react'

const DEFAULT_ROW_COUNT = 4

function SkeletonBlock({ className = '' }) {
  return <span className={`mobile-role-skeleton__block ${className}`} />
}

export default function MobileTaskListSkeleton({
  rowCount = DEFAULT_ROW_COUNT,
}) {
  const rows = Array.from({ length: rowCount }, (_, index) => index)

  return (
    <section
      className="mobile-role-skeleton mx-5 mt-5 pb-5"
      data-testid="mobile-role-task-skeleton"
      data-skeleton-row-count={rows.length}
      aria-hidden="true"
    >
      <div className="mobile-role-skeleton__metrics grid grid-cols-4 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white py-5 text-center shadow-sm">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="mobile-role-skeleton__metric min-w-0 px-2">
            <SkeletonBlock className="mobile-role-skeleton__metric-value" />
            <SkeletonBlock className="mobile-role-skeleton__metric-label" />
          </div>
        ))}
      </div>

      <div className="mobile-role-skeleton__filters mt-4 grid grid-cols-4 rounded-2xl bg-slate-100 p-1 shadow-inner">
        {[0, 1, 2, 3].map((item) => (
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
