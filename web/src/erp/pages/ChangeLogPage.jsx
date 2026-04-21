import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import { bootstrapChange } from '../config/seedData.mjs'

const DONE_ITEMS = [
  '新增毛绒 ERP 初始化看板、流程总览、帮助中心、文档页和资料准备页。',
  '把管理员登录后的默认入口切到 ERP 壳层，不再停留在通用控制台。',
  '在同一仓库里初始化各角色移动端工作台，不单独拆第二个移动端项目。',
  '同步准备 changes slug、README、project-status、web README 和运行文档。',
]

const NOT_DONE_ITEMS = [
  '拍照扫码、PDA、条码枪与图片识别。',
  '正式 Excel 导入、合同打印模板、PDF 定位填充。',
  '真实业务实体、权限矩阵、审批流和利润口径。',
]

const NEXT_ITEMS = [
  '等更多合同 / Excel 到位后，先补字段真源和导入链路。',
  '按角色继续把工作台接入真实后端接口与数据保存。',
  '在移动端工作台基础上收口更细的交互与验收样本。',
]

export default function ChangeLogPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="changes slug"
        title="本轮初始化变更记录"
        description="复杂任务已明确写入 changes slug，后续如果继续接合同、Excel 或移动端细节，可以直接按这份文档续做，不需要再从聊天记录里猜当前范围。"
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
