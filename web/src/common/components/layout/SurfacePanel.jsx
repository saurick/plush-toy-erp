import React from 'react'

export default function SurfacePanel({ children, className = '', ...props }) {
  return (
    <div
      {...props}
      className={`relative overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
      <div className="relative h-full w-full rounded-[24px]">{children}</div>
    </div>
  )
}
