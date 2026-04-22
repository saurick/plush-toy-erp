import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import { mobileTheme } from '../theme'

export default function MobileRoleGuidePage() {
  const { activeRole, appConfig } = useERPWorkspace()

  return (
    <div className="space-y-4">
      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className={mobileTheme.sectionTitle}>入口与边界</div>
          <div className="grid gap-3">
            {[
              `当前入口：${appConfig.command}，默认端口 ${appConfig.port}。`,
              '后端统一复用 8200，不拆第二套服务。',
              '移动端与桌面端共用同一套字段口径、文档体系和接口层。',
            ].map((item) => (
              <div key={item} className={mobileTheme.listItem}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className={mobileTheme.sectionTitle}>当前角色真源引用</div>
          <div className="space-y-2">
            {activeRole.sourceRefs.map((item) => (
              <div key={item} className={mobileTheme.emphasisItem}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>
    </div>
  )
}
