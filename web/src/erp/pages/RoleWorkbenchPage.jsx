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
            <Link className="erp-primary-button" to="/erp/help-center">
              查看角色帮助
            </Link>
            <Link className="erp-primary-button" to="/erp/mobile-workbenches">
              查看多移动端入口
            </Link>
            <Link className="erp-secondary-button" to="/erp/docs/field-truth">
              查看字段真源
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-semibold text-slate-50">
                桌面后台默认入口
              </div>
              <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-100">
                {role.defaultPath}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {role.desktopHighlights.map((item) => (
                <div
                  key={item.label}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    {item.label}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-50">
                    {item.value}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    {item.note}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold text-slate-50">
                当前角色桌面菜单可见性
              </div>
              <div className="mt-3 space-y-2">
                {role.desktopMenuPreview.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              移动端关注点
            </div>
            <div className="grid gap-3">
              {role.mobileHighlights.map((item) => (
                <div
                  key={item.label}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    {item.label}
                  </div>
                  <div className="mt-2 text-base font-semibold text-slate-50">
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
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {role.desktopQueues.map((queue) => (
          <SurfacePanel key={queue.title} className="p-5">
            <div className="space-y-4">
              <div className="text-lg font-semibold text-slate-50">
                {queue.title}
              </div>
              <div className="space-y-2">
                {queue.items.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </SurfacePanel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              这轮已放进项目
            </div>
            <div className="space-y-2">
              {role.firstWave.map((item) => (
                <div key={item} className="text-sm leading-6 text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              帮助中心重点
            </div>
            <div className="space-y-2">
              {role.helpFocus.map((item) => (
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

        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">后续待补</div>
            <div className="space-y-2">
              {role.pending.map((item) => (
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
    </div>
  )
}
