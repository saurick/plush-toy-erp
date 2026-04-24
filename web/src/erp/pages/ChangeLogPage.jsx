import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import { bootstrapChange } from '../config/seedData.mjs'

const DONE_ITEMS = [
  '逐个读取并分析加工合同 PDF、两份材料 BOM Excel、加工汇总 Excel、辅包材采购 Excel、正式汇报 PDF 和生产订单截图。',
  '重写毛绒工厂主流程、字段真源对照、首批正式数据模型建议和 Excel / PDF 导入映射。',
  '桌面后台继续保持一个入口，并把导航收口成固定后台菜单，不再保留角色切换和角色工作台入口。',
  '同仓库内拆出 8 个角色移动端端口矩阵，保持共享 common / ui / api / 文档层。',
]

const NOT_DONE_ITEMS = [
  '扩展硬件链路、PDA、条码枪与图片识别。',
  '正式 Excel 导入落库、合同打印模板、PDF 定位填充。',
  '正式结算单 / 对账单样本不足前的完整账务实体。',
  '未确认编号体系直接落 Ent schema。',
]

const NEXT_ITEMS = [
  '继续补客户订单、出货单、结算单样本，确认订单编号层级关系。',
  '等字段稳定后再决定是否开始 Ent schema 与 migration。',
  '把桌面后台页面和移动端端口逐步接到真实接口与保存链路。',
]

export default function ChangeLogPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="changes slug"
        title="本轮真源收口变更记录"
        description="复杂任务继续写进 changes slug。后续如果继续接合同、Excel、移动端或 schema，只需要按这份记录续做，不需要再从聊天记录倒推当前范围。"
      />

      <SurfacePanel className="p-5">
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
              变更文件
            </div>
            <div className="mt-3 text-lg font-semibold text-slate-50">
              {bootstrapChange.repoPath}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              slug：{bootstrapChange.slug}
            </div>
          </div>

          <div className="bg-emerald-300/8 rounded-3xl border border-emerald-300/20 p-4">
            <div className="text-sm font-semibold text-emerald-100">
              本轮已做
            </div>
            <div className="mt-3 space-y-2">
              {DONE_ITEMS.map((item) => (
                <div key={item} className="text-sm leading-6 text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-300/8 rounded-3xl border border-amber-300/20 p-4">
            <div className="text-sm font-semibold text-amber-100">本轮不做</div>
            <div className="mt-3 space-y-2">
              {NOT_DONE_ITEMS.map((item) => (
                <div key={item} className="text-sm leading-6 text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-lg font-semibold text-slate-50">下一步建议</div>
          <div className="grid gap-3 md:grid-cols-3">
            {NEXT_ITEMS.map((item) => (
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
