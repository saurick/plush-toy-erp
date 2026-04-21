import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import { documentationCards, helpCenterSections } from '../config/seedData.mjs'

export default function HelpCenterPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="帮助中心"
        title="帮助中心与操作入口"
        description="这里先解决三件事：新同事先看什么、这轮哪些能力能用、后续资料应该接到哪里。帮助中心内容与仓库文档同步维护，不把临时聊天结论当真源。"
        actions={
          <>
            <Link className="erp-primary-button" to="/erp/docs/system-init">
              先读初始化说明
            </Link>
            <Link
              className="erp-secondary-button"
              to="/erp/docs/operation-playbook"
            >
              查看流程草案
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
                先看“初始化说明”确认范围，再看“流程草案”理解主链路，最后结合“移动端角色初始化”决定手机端第一批页面。这样后续接合同和
                Excel 时就不会把字段落到错误模块。
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </div>
  )
}
