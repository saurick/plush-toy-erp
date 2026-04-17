import React from 'react'

// 提供中性的应用级背景和承载层，避免模板默认带入行业主题。
export default function AppShell({ children, className = '' }) {
  return (
    <div
      className={`relative min-h-screen overflow-hidden bg-[#0b1220] text-slate-100 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.12),_transparent_24%),linear-gradient(160deg,#0b1220_0%,#111827_44%,#0f172a_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="relative min-h-screen">{children}</div>
    </div>
  )
}
