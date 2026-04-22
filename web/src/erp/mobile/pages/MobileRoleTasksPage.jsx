import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import { mobileTheme } from '../theme'

export default function MobileRoleTasksPage() {
  const { activeRole } = useERPWorkspace()

  return (
    <div className="space-y-4">
      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className={mobileTheme.sectionTitle}>移动端任务流</div>
          <div className="space-y-2">
            {activeRole.mobileTaskFlow.map((item, index) => (
              <div key={item} className={mobileTheme.highlightCard}>
                <div className={mobileTheme.sectionEyebrow}>
                  Step {index + 1}
                </div>
                <div className={mobileTheme.highlightNote}>{item}</div>
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className={mobileTheme.sectionTitle}>Deferred</div>
          <div className="space-y-2">
            {activeRole.mobileDeferred.map((item) => (
              <div key={item} className={mobileTheme.warningItem}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>
    </div>
  )
}
