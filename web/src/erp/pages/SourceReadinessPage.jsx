import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import { sourceReadiness } from '../config/seedData.mjs'

export default function SourceReadinessPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="资料准备"
        title="先把已收到与待补资料列清楚"
        description="你已经给了首批合同、材料明细、辅材包材和移动端验收参考。本页先把这些资料挂到正确模块上，避免后续再靠记忆去猜某个 Excel 或 PDF 应该接到哪里。"
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              已收到的原始资料
            </div>
            <div className="grid gap-3">
              {sourceReadiness.received.map((item) => (
                <div
                  key={item.name}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-base font-semibold text-slate-50">
                      {item.name}
                    </div>
                    <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-100">
                      {item.type}
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">
                    {item.intendedFor}
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
                仍在等待的资料
              </div>
              <div className="space-y-2">
                {sourceReadiness.pending.map((item) => (
                  <div
                    key={item}
                    className="bg-amber-300/8 rounded-3xl border border-amber-300/20 px-4 py-3 text-sm leading-6 text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel className="p-5">
            <div className="space-y-4">
              <div className="text-lg font-semibold text-slate-50">
                接入原则
              </div>
              <div className="grid gap-3">
                {[
                  '先确认真源字段和保存链路，再决定导入写进哪里。',
                  '合同和 Excel 没到齐之前，只做挂点和文档，不抢跑字段映射。',
                  '任何拍照扫码、图片识别相关需求继续留在后续阶段，不混入本轮框架。',
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
      </div>
    </div>
  )
}
