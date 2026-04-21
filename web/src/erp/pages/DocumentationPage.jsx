import React from 'react'
import { Link, useParams } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { Markdown } from '@/common/components/markdown'
import PageHero from '../components/PageHero'
import { docRegistry } from '../config/docs.mjs'

export default function DocumentationPage() {
  const { docKey } = useParams()
  const doc = docRegistry[docKey]

  if (!doc) {
    return (
      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-2xl font-semibold text-slate-50">文档不存在</div>
          <div className="text-sm leading-6 text-slate-300">
            当前文档键未注册，请从帮助中心重新进入。
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="erp-primary-button" to="/erp/help-center">
              返回帮助中心
            </Link>
            <Link className="erp-secondary-button" to="/erp/dashboard">
              返回初始化看板
            </Link>
          </div>
        </div>
      </SurfacePanel>
    )
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="正式文档"
        title={doc.title}
        description={doc.summary}
        actions={
          <>
            <Link className="erp-secondary-button" to="/erp/help-center">
              返回帮助中心
            </Link>
            <Link className="erp-secondary-button" to="/erp/changes/current">
              查看本轮变更记录
            </Link>
          </>
        }
      />

      <SurfacePanel className="p-5 sm:p-6">
        <div className="erp-docs-article prose prose-invert max-w-none prose-headings:tracking-tight prose-p:text-slate-300 prose-a:text-cyan-200 prose-strong:text-slate-50 prose-li:text-slate-300">
          <Markdown source={doc.source} />
        </div>
      </SurfacePanel>
    </div>
  )
}
