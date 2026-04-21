import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import {
  documentationCards,
  getHelpCenterSections,
} from '../config/seedData.mjs'
import { useERPWorkspace } from '../context/ERPWorkspaceProvider'

export default function HelpCenterPage() {
  const { activeRole } = useERPWorkspace()
  const helpCenterSections = getHelpCenterSections(activeRole.key)

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="帮助中心"
        title="帮助中心与操作入口"
        description={`当前桌面角色是 ${activeRole.title}。帮助中心会随角色切换同步变化：先告诉你该看什么、当前能做什么，以及哪些扫描 / 识别能力仍然 deferred。`}
        actions={
          <>
            <Link className="erp-primary-button" to="/erp/docs/system-init">
              先读系统初始化说明
            </Link>
            <Link className="erp-secondary-button" to="/erp/docs/field-truth">
              查看字段真源
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="grid gap-4">
          {helpCenterSections.map((section) => (
            <SurfacePanel key={section.title} className="p-5">
              <div className="space-y-4">
                <div className="text-lg font-semibold text-slate-50">
                  {section.title}
                </div>
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <div
                      key={item}
                      className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </SurfacePanel>
          ))}
        </div>

        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">文档入口</div>
            <div className="grid gap-3">
              {documentationCards.map((card) => (
                <Link
                  key={card.key}
                  to={card.path}
                  className="hover:bg-cyan-300/8 rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/40"
                >
                  <div className="text-base font-semibold text-slate-50">
                    {card.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    {card.summary}
                  </div>
                </Link>
              ))}
            </div>

            <div className="bg-amber-300/8 rounded-3xl border border-amber-300/20 p-4">
              <div className="text-sm font-semibold text-amber-100">
                使用建议
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-200">
                先看“系统初始化说明”确认桌面单入口和移动端多入口结构，再看“字段真源”避免把编号体系混掉，最后用“导入映射”决定
                Excel / PDF 应该落哪张表。
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </div>
  )
}
