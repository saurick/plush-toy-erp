import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'

export default function MobileRoleHomePage() {
  const { activeRole, appConfig } = useERPWorkspace()

  return (
    <div className="space-y-4">
      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-sm uppercase tracking-[0.22em] text-slate-400">
            今日重点
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeRole.mobileHighlights.map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {item.label}
                </div>
                <div className="mt-3 text-lg font-semibold text-slate-50">
                  {item.value}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">
                  {item.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>

      {activeRole.mobileSections.map((section) => (
        <SurfacePanel key={section.title} className="p-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold text-slate-50">
                {section.title}
              </div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                {appConfig.port}
              </div>
            </div>
            <div className="space-y-2">
              {section.items.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </SurfacePanel>
      ))}
    </div>
  )
}
