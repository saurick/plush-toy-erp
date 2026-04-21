import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import { roleWorkbenches } from '../config/seedData.mjs'

function PhonePreview({ role }) {
  return (
    <div className="erp-phone-frame">
      <div className="erp-phone-screen">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-400">
          <span>{role.label}</span>
          <span>Mobile</span>
        </div>
        <div className="mt-4">
          <div className="text-lg font-semibold text-slate-50">
            {role.title}
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            {role.summary}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
            先给手机端的动作
          </div>
          {role.mobileFocus.map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MobileWorkbenchesPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="移动端工作台"
        title="角色移动端初始化"
        description="移动端不拆第二个仓库，直接放在本项目里做响应式工作台。第一批先解决“谁在手机上要看什么、确认什么、提醒什么”，不强行做扫码、拍照识别或离线同步。"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {roleWorkbenches.map((role) => (
          <SurfacePanel key={role.key} className="p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-cyan-100">
                    {role.label}
                  </div>
                  <div className="text-2xl font-semibold text-slate-50">
                    {role.title}
                  </div>
                  <div className="text-sm leading-7 text-slate-300">
                    {role.summary}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-sm font-semibold text-slate-50">
                      手机端首批重点
                    </div>
                    <div className="mt-3 space-y-2">
                      {role.mobileFocus.map((item) => (
                        <div
                          key={item}
                          className="text-sm leading-6 text-slate-300"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-sm font-semibold text-slate-50">
                      暂时不做
                    </div>
                    <div className="mt-3 space-y-2">
                      {role.pending.map((item) => (
                        <div
                          key={item}
                          className="text-sm leading-6 text-slate-300"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <Link
                  className="erp-secondary-button"
                  to={`/erp/roles/${role.key}`}
                >
                  查看该角色完整工作台
                </Link>
              </div>

              <PhonePreview role={role} />
            </div>
          </SurfacePanel>
        ))}
      </div>

      <SurfacePanel className="p-5">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            '同一套路由在桌面和移动端复用，不拆第二个项目。',
            '移动端先做确认、提醒、进度回填，不做复杂批量编辑。',
            '扫码、拍照、PDA 与离线同步在资料和场景明确后再接入。',
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-slate-200"
            >
              {item}
            </div>
          ))}
        </div>
      </SurfacePanel>
    </div>
  )
}
