import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import { portMatrix, roleWorkbenches } from '../config/seedData.mjs'

function PhonePreview({ role }) {
  const mobileEntry = portMatrix.find((item) => item.roleKey === role.key)

  return (
    <div className="erp-phone-frame">
      <div className="erp-phone-screen">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-400">
          <span>{role.label}</span>
          <span>{mobileEntry?.port || 'Mobile'}</span>
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
  const mobileRoleCount = roleWorkbenches.length

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="移动端端口说明"
        title={`${mobileRoleCount} 个角色移动端端口与职责`}
        description="移动端继续按角色拆端口，但访问方式直接收口到端口，不再依赖桌面后台里的角色入口。所有移动端仍然共享同一个项目、同一套 common / ui / api / 文档体系。"
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
                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
                    端口{' '}
                    {portMatrix.find((item) => item.roleKey === role.key)?.port}
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
                      共享真源 / 边界
                    </div>
                    <div className="mt-3 space-y-2">
                      {role.sourceRefs.map((item) => (
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

                <div className="flex flex-wrap gap-3">
                  <Link
                    className="erp-secondary-button"
                    to="/erp/docs/mobile-roles"
                  >
                    查看端口与职责说明
                  </Link>
                </div>
              </div>

              <PhonePreview role={role} />
            </div>
          </SurfacePanel>
        ))}
      </div>

      <SurfacePanel className="p-5">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            '桌面后台继续只保留一个入口；移动端按角色拆端口并直接访问。',
            `${mobileRoleCount} 个移动入口都共享 8300 后端、同一套字段真源、接口层和文档体系。`,
            '扩展硬件链路、PDA 与离线同步统一标记 deferred，不冒充已支持。',
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
