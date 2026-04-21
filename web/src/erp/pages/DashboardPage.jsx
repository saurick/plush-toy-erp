import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import StatusPill from '../components/StatusPill'
import {
  bootstrapChange,
  environmentCards,
  phaseFlow,
  plannedModules,
  roleWorkbenches,
  sourceReadiness,
} from '../config/seedData.mjs'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="初始化看板"
        title="毛绒玩具 ERP 初始化框架"
        description="这轮不复制 trade-erp 的外贸单据模型，而是先把毛绒工厂自己的流程、角色工作台、帮助中心、文档中心、移动端入口和资料准备清单放进项目。拍照扫码已经明确延后，合同与 Excel 接口先留挂点。"
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
              当前已经放进项目的能力
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
                本轮变更记录
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm text-slate-300">
                  已把复杂任务收口到 changes slug，便于后续继续接力。
                </div>
                <div className="mt-3 text-base font-semibold text-slate-50">
                  {bootstrapChange.repoPath}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  最后更新：{bootstrapChange.updatedAt}
                </div>
              </div>
            </div>
          </SurfacePanel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              角色工作台
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
              当前主流程与资料状态
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
                已先把资料入口放进项目，但不会在资料不全时强行补打印模板或 Excel
                导入逻辑。待补资料会继续挂在“资料准备”页，不做隐性假设。
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </div>
  )
}
