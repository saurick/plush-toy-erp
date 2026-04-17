import React from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'

const DEFAULT_ITEMS = [
  '管理员登录入口与受保护路由',
  '账号搜索、查看、启用和禁用',
  '基础健康检查、部署骨架和质量门禁',
]

const CUSTOMIZE_ITEMS = [
  '权限模型、角色矩阵、组织树和审批流',
  '积分、订阅、邀请码、会员有效期等业务字段',
  '外部系统集成、消息通知、审计策略和告警规则',
]

const NEXT_ITEMS = [
  '替换项目名、品牌文案和首页内容',
  '补齐真实管理员体系和权限规则',
  '按业务增加数据看板、流程页和详情页',
]

function GuideList({ title, description, items, accentClass }) {
  return (
    <SurfacePanel className="p-5 sm:p-6">
      <div className="space-y-4">
        <div
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] ${accentClass}`}
        >
          {title}
        </div>
        <div className="text-sm leading-6 text-slate-300">{description}</div>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </SurfacePanel>
  )
}

export default function AdminGuidePage() {
  const navigate = useNavigate()

  return (
    <AppShell className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
              页面说明
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              后台默认只保留最小骨架
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              当前后台先保留账号管理和说明页，方便快速验证登录与后台流程。正式项目可在此基础上继续补充业务页面和权限能力。
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin-menu')}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08]"
          >
            返回控制台
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <GuideList
            title="默认保留"
            description="下面这些能力适合作为后台默认基线，后续项目通常可以直接继承。"
            items={DEFAULT_ITEMS}
            accentClass="border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
          />
          <GuideList
            title="按需扩展"
            description="下面这些能力带有明显业务语义，建议在具体项目里按真实需求补齐。"
            items={CUSTOMIZE_ITEMS}
            accentClass="border-amber-300/30 bg-amber-300/10 text-amber-100"
          />
        </div>

        <SurfacePanel className="p-5 sm:p-6">
          <div className="space-y-4">
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-100">
              下一步
            </div>
            <div className="text-sm leading-6 text-slate-300">
              如果当前页面将继续用于真实项目，通常会优先完成下面这些替换和补充。
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {NEXT_ITEMS.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-cyan-100"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </SurfacePanel>
      </div>
    </AppShell>
  )
}
