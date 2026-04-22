import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../context/ERPWorkspaceProvider'
import { getMobileNavItemClass, mobileTheme } from './theme'

const MOBILE_NAV_ITEMS = [
  {
    key: 'home',
    path: '/',
    label: '首页',
  },
  {
    key: 'tasks',
    path: '/tasks',
    label: '任务',
  },
  {
    key: 'guide',
    path: '/guide',
    label: '说明',
  },
]

export default function MobileAppLayout() {
  const { activeRole, appConfig } = useERPWorkspace()

  return (
    <AppShell className="px-3 py-4 sm:px-4">
      <div className="mx-auto max-w-[540px] space-y-4">
        <SurfacePanel className="p-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={mobileTheme.badge}>{appConfig.shortTitle}</div>
              <div className={mobileTheme.metaBadge}>后端 8200</div>
            </div>
            <div>
              <div className={mobileTheme.heroTitle}>{activeRole.title}</div>
              <div className={mobileTheme.heroDescription}>
                {appConfig.description}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MOBILE_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => getMobileNavItemClass(isActive)}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </SurfacePanel>

        <Outlet />
      </div>
    </AppShell>
  )
}
