import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import HelpCenterDocLinks from '../components/HelpCenterDocLinks'
import HelpCenterSectionDirectory from '../components/HelpCenterSectionDirectory'
import PageHero from '../components/PageHero'
import { printTemplateCatalog } from '../config/printTemplates.mjs'
import {
  documentationCards,
  getHelpCenterSections,
  portMatrix,
} from '../config/seedData.mjs'

export default function HelpCenterPage() {
  const helpCenterSections = getHelpCenterSections()
  const mobileAppCount = portMatrix.filter(
    (app) => app.kind === 'mobile'
  ).length
  const desktopUsageNotes = [
    '桌面后台固定使用一个入口，不再提供角色切换、角色首页或角色入口菜单。',
    `${mobileAppCount} 个移动端角色按端口直接访问，端口分工写在正式文档和说明页里。`,
    '需要核对字段、打印模板、状态字典或导入口径时，优先从帮助中心和正式文档进入。',
  ]
  const headings = [
    ...helpCenterSections.map((section) => ({
      id: `help-${section.title}`,
      title: section.title,
    })),
    { id: 'help-mobile-ports', title: '移动端端口速查' },
    { id: 'help-print-center', title: '模板打印入口' },
    { id: 'help-doc-center', title: '正式文档入口' },
  ]

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="帮助中心"
        title="帮助中心与操作入口"
        description="帮助中心默认按桌面单后台来组织：先告诉你后台应该看什么、移动端该怎么按端口访问，以及哪些扫描 / 识别能力仍然 deferred。"
        actions={
          <>
            <Link className="erp-primary-button" to="/erp/print-center">
              进入模板打印中心
            </Link>
            <Link className="erp-primary-button" to="/erp/docs/system-init">
              先读系统初始化说明
            </Link>
            <Link className="erp-secondary-button" to="/erp/docs/field-truth">
              查看字段真源
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <HelpCenterSectionDirectory headings={headings} />
          <SurfacePanel className="p-5">
            <div className="space-y-3">
              <div className="text-lg font-semibold text-slate-50">
                后台使用原则
              </div>
              <div className="space-y-2">
                {desktopUsageNotes.map((item) => (
                  <div
                    key={item}
                    className="bg-cyan-300/8 rounded-3xl border border-cyan-300/20 px-4 py-3 text-sm leading-6 text-cyan-50"
                  >
                    {item}
                  </div>
                ))}
              </div>
              <HelpCenterDocLinks currentPath="/erp/help-center" />
            </div>
          </SurfacePanel>
        </div>

        <div className="grid gap-4">
          {helpCenterSections.map((section) => (
            <SurfacePanel
              key={section.title}
              className="p-5"
              id={`help-${section.title}`}
            >
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

          <SurfacePanel className="p-5" id="help-mobile-ports">
            <div className="space-y-4">
              <div className="text-lg font-semibold text-slate-50">
                移动端端口速查
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {portMatrix
                  .filter((app) => app.kind === 'mobile')
                  .map((app) => (
                    <div
                      key={app.id}
                      className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-semibold text-slate-50">
                          {app.shortTitle}
                        </div>
                        <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-100">
                          {app.port}
                        </div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        {app.description}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel className="p-5" id="help-print-center">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-50">
                    模板打印入口
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    当前只保留采购合同、加工合同两套正式模板，并统一收口成可编辑打印窗口、PDF
                    预览、下载和打印链路。
                  </div>
                </div>
                <Link className="erp-primary-button" to="/erp/print-center">
                  打开打印中心
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {printTemplateCatalog.map((template) => (
                  <Link
                    key={template.key}
                    to="/erp/print-center"
                    className="hover:bg-cyan-300/8 rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/40"
                  >
                    <div className="text-base font-semibold text-slate-50">
                      {template.shortTitle}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      {template.summary}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel className="p-5" id="help-doc-center">
            <div className="space-y-4">
              <div className="text-lg font-semibold text-slate-50">
                正式文档入口
              </div>
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
                  先看“系统初始化说明”确认桌面单后台和移动端端口结构，再看“字段真源”避免把编号体系混掉，再看“任务
                  /
                  业务状态字典”统一状态口径，接着打开“模板打印中心”核对加工合同快照字段和条款区，最后用“导入映射”决定
                  Excel / PDF 应该落哪张表。
                </div>
              </div>
            </div>
          </SurfacePanel>
        </div>
      </div>
    </div>
  )
}
