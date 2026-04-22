import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import { mobileTheme } from '../theme'

export default function MobileRoleHomePage() {
  const { activeRole, appConfig } = useERPWorkspace()

  return (
    <div className="space-y-4">
      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className={mobileTheme.sectionEyebrow}>今日重点</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeRole.mobileHighlights.map((item) => (
              <div key={item.label} className={mobileTheme.highlightCard}>
                <div className={mobileTheme.highlightLabel}>{item.label}</div>
                <div className={mobileTheme.highlightValue}>{item.value}</div>
                <div className={mobileTheme.highlightNote}>{item.note}</div>
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>

      {activeRole.mobileSections.map((section) => (
        <SurfacePanel key={section.title} className="p-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className={mobileTheme.sectionTitle}>{section.title}</div>
              <div className={mobileTheme.sectionEyebrow}>{appConfig.port}</div>
            </div>
            <div className="space-y-2">
              {section.items.map((item) => (
                <div key={item} className={mobileTheme.emphasisItem}>
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
