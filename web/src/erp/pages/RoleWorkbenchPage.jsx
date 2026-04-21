import React from 'react'
import { Link, useParams } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import { getRoleWorkbench } from '../config/seedData.mjs'

export default function RoleWorkbenchPage() {
  const { roleKey } = useParams()
  const role = getRoleWorkbench(roleKey)

  if (!role) {
    return (
      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-2xl font-semibold text-slate-50">
            未找到角色工作台
          </div>
          <div className="text-sm leading-6 text-slate-300">
            当前角色键不存在，请从初始化看板或移动端工作台重新进入。
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="erp-primary-button" to="/erp/dashboard">
              返回初始化看板
            </Link>
            <Link className="erp-secondary-button" to="/erp/mobile-workbenches">
              返回移动端工作台
            </Link>
          </div>
        </div>
      </SurfacePanel>
    )
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="角色工作台"
        title={role.title}
        description={role.summary}
        actions={
          <>
            <Link className="erp-primary-button" to="/erp/mobile-workbenches">
              查看移动端工作台
            </Link>
            <Link className="erp-secondary-button" to="/erp/help-center">
              返回帮助中心
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <SurfacePanel className="p-5 xl:col-span-1">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              桌面端入口
            </div>
            <div className="space-y-2">
              {role.desktopFocus.map((item) => (
                <div
                  key={item}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel className="p-5 xl:col-span-1">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              移动端入口
            </div>
            <div className="space-y-2">
              {role.mobileFocus.map((item) => (
                <div
                  key={item}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel className="p-5 xl:col-span-1">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              首批交付与待补
            </div>
            <div className="space-y-3">
              <div className="bg-emerald-300/8 rounded-3xl border border-emerald-300/20 p-4">
                <div className="text-sm font-semibold text-emerald-100">
                  这轮已放进项目
                </div>
                <div className="mt-3 space-y-2">
                  {role.firstWave.map((item) => (
                    <div
                      key={item}
                      className="text-sm leading-6 text-slate-200"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-amber-300/8 rounded-3xl border border-amber-300/20 p-4">
                <div className="text-sm font-semibold text-amber-100">
                  后续待补
                </div>
                <div className="mt-3 space-y-2">
                  {role.pending.map((item) => (
                    <div
                      key={item}
                      className="text-sm leading-6 text-slate-200"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </div>
  )
}
