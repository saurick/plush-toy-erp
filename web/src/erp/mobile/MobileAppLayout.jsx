import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../context/ERPWorkspaceProvider'

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
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
                {appConfig.shortTitle}
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
                后端 8200
              </div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-slate-50">
                {activeRole.title}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {appConfig.description}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MOBILE_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `rounded-2xl border px-3 py-2 text-center text-sm font-medium transition ${
                      isActive
                        ? 'bg-cyan-300/12 border-cyan-300/40 text-cyan-50'
                        : 'border-white/10 bg-white/[0.03] text-slate-300'
                    }`
                  }
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
