import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'

export default function MobileRoleTasksPage() {
  const { activeRole } = useERPWorkspace()

  return (
    <div className="space-y-4">
      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-lg font-semibold text-slate-50">
            移动端任务流
          </div>
          <div className="space-y-2">
            {activeRole.mobileTaskFlow.map((item, index) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Step {index + 1}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-200">
                  {item}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-lg font-semibold text-slate-50">Deferred</div>
          <div className="space-y-2">
            {activeRole.mobileDeferred.map((item) => (
              <div
                key={item}
                className="bg-amber-300/8 rounded-2xl border border-amber-300/20 px-4 py-3 text-sm leading-6 text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>
    </div>
  )
}
