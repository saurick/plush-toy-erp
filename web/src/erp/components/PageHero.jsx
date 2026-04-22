import React from 'react'

export default function PageHero({
  eyebrow,
  title,
  description,
  actions = null,
}) {
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-700">
        {eyebrow}
      </div>
      <div className="space-y-3">
        <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-4xl text-sm leading-7 text-slate-600 sm:text-base">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  )
}
