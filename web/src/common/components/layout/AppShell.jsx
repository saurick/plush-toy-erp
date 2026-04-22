import React from 'react'

export default function AppShell({ children, className = '' }) {
  return (
    <div
      className={`relative min-h-screen overflow-hidden bg-[#f5f7f4] text-slate-900 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(74,222,128,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(96,165,250,0.12),_transparent_24%),linear-gradient(180deg,#f8fbf8_0%,#f3f6f4_56%,#eef2ef_100%)]" />
      <div className="relative min-h-screen">{children}</div>
    </div>
  )
}
