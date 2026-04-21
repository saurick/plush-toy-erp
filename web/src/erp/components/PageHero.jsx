import React from 'react'

export default function PageHero({
  eyebrow,
  title,
  description,
  actions = null,
}) {
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
        {eyebrow}
      </div>
      <div className="space-y-3">
        <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  )
}
