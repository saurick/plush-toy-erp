import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import StatusPill from '../components/StatusPill'
import {
  bootstrapChange,
  environmentCards,
  fieldTruthRows,
  phaseFlow,
  plannedModules,
  portMatrix,
  roleWorkbenches,
  sourceReadiness,
} from '../config/seedData.mjs'
import { useERPWorkspace } from '../context/ERPWorkspaceProvider'

export default function DashboardPage() {
  const { activeRole } = useERPWorkspace()

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="全局驾驶舱"
        title="基于真实资料的毛绒 ERP 后台"
        description={`当前桌面角色是 ${activeRole.title}。这轮不再停留在初始化壳层，而是按真实 PDF / Excel / 截图收口流程、字段真源、角色入口和移动端多端口结构。`}
        actions={
          <>
            <Link className="erp-primary-button" to="/erp/flows/overview">
              查看流程总览
            </Link>
            <Link className="erp-secondary-button" to="/erp/mobile-workbenches">
              查看移动端初始化
            </Link>
            <Link className="erp-secondary-button" to="/erp/source-readiness">
              查看资料准备
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              当前已按真源收口的模块
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {plannedModules.map((moduleItem) => (
                <div
                  key={moduleItem.key}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-base font-semibold text-slate-50">
                      {moduleItem.title}
                    </div>
                    <StatusPill status={moduleItem.status} />
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    负责人：{moduleItem.owner}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">
                    {moduleItem.summary}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SurfacePanel>

        <div className="grid gap-4">
          <SurfacePanel className="p-5">
            <div className="space-y-4">
              <div className="text-lg font-semibold text-slate-50">
                环境与边界
              </div>
              <div className="grid gap-3">
                {environmentCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-3xl border border-white/10 bg-black/20 px-4 py-4"
                  >
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                      {card.label}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-50">
                      {card.value}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      {card.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel className="p-5">
            <div className="space-y-3">
              <div className="text-lg font-semibold text-slate-50">
                当前角色默认关注
              </div>
              <div className="grid gap-3">
                {activeRole.desktopHighlights.map((item) => (
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
            </div>
          </SurfacePanel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              桌面后台角色工作台
            </div>
            <div className="grid gap-3">
              {roleWorkbenches.map((role) => (
                <Link
                  key={role.key}
                  to={`/erp/roles/${role.key}`}
                  className="hover:bg-cyan-300/8 rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-50">
                        {role.title}
                      </div>
                      <div className="mt-1 text-sm text-cyan-100">
                        {role.label}
                      </div>
                    </div>
                    <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-100">
                      手机 + 桌面
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">
                    {role.summary}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              当前主流程与字段真源提醒
            </div>
            <div className="grid gap-3">
              {phaseFlow.map((phase, index) => (
                <div
                  key={phase.key}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-base font-semibold text-slate-50">
                      {index + 1}. {phase.title}
                    </div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                      {phase.owner}
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">
                    {phase.summary}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-amber-300/8 rounded-3xl border border-amber-300/20 p-4">
              <div className="text-sm font-semibold text-amber-100">
                已收到 {sourceReadiness.received.length} 份原始资料
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-200">
                已确认字段里，最关键的是“款式编号 / 产品编号 / 产品订单编号 /
                订单编号”
                不是同一层级；当前继续在资料准备页保留待确认项，不把未收稳字段直接硬落
                schema。
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              多入口端口矩阵
            </div>
            <div className="grid gap-3">
              {portMatrix.map((app) => (
                <div
                  key={app.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-base font-semibold text-slate-50">
                      {app.title}
                    </div>
                    <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-100">
                      {app.port}
                    </div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    {app.description}
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                    {app.command}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              已确认字段
            </div>
            <div className="grid gap-3">
              {fieldTruthRows.slice(0, 6).map((row) => (
                <div
                  key={row.field}
                  className="rounded-3xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-base font-semibold text-slate-50">
                      {row.field}
                    </div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      {row.stability}
                    </div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    真源：{row.source}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">
                    拟落点：{row.target}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-200">
                    {row.note}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-slate-50">
                本轮变更记录
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                复杂任务继续收口到 {bootstrapChange.repoPath}，最后更新{' '}
                {bootstrapChange.updatedAt}。
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </div>
  )
}
