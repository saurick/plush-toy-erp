import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import { phaseFlow } from '../config/seedData.mjs'

export default function OperationFlowPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="流程总览"
        title="先把主流程收口，再接合同和 Excel"
        description="trade-erp 的业务主线是报价、外销、出运和结汇；毛绒 ERP 这轮改成款式、材料、加工、排单、仓库和对账这条链。只有先把这条主路径定清楚，后续合同模板、Excel 导入和打印映射才不会落错层。"
      />

      <div className="grid gap-4">
        {phaseFlow.map((phase, index) => (
          <SurfacePanel key={phase.key} className="p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                <div className="inline-flex rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-fuchsia-100">
                  阶段 {index + 1}
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-50">
                    {phase.title}
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    责任角色：{phase.owner}
                  </div>
                </div>
                <div className="text-sm leading-7 text-slate-300">
                  {phase.summary}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-semibold text-slate-50">
                    阶段产出
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {phase.outputs.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-slate-200"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-semibold text-slate-50">
                    移动端首批动作
                  </div>
                  <div className="mt-3 space-y-2">
                    {phase.mobileActions.map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SurfacePanel>
        ))}
      </div>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-lg font-semibold text-slate-50">
            本轮流程边界
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              '流程页和帮助中心已经可以作为正式入口使用。',
              '合同打印、Excel 导入和字段映射先挂在对应阶段，不抢跑实现。',
              '拍照扫码、条码枪、PDA 明确延后，不在当前流程里假装可用。',
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-slate-200"
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
