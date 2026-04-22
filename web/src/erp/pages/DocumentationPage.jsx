import React, { useEffect, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { extractMarkdownHeadings, Markdown } from '@/common/components/markdown'
import HelpCenterBackToTopButton from '../components/HelpCenterBackToTopButton'
import PageHero from '../components/PageHero'
import { docRegistry } from '../config/docs.mjs'

export default function DocumentationPage() {
  const { docKey } = useParams()
  const doc = docRegistry[docKey]
  const articleRef = useRef(null)
  const sectionHeadings = useMemo(
    () => extractMarkdownHeadings(doc?.source || '', [2]),
    [doc?.source]
  )

  useEffect(() => {
    if (!articleRef.current || !sectionHeadings.length) {
      return
    }

    const headingNodes = articleRef.current.querySelectorAll('h2')
    headingNodes.forEach((node, index) => {
      const heading = sectionHeadings[index]
      if (!heading) {
        return
      }
      node.id = heading.id
    })
  }, [docKey, sectionHeadings])

  if (!doc) {
    return (
      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-2xl font-semibold text-slate-50">文档不存在</div>
          <div className="text-sm leading-6 text-slate-300">
            当前文档键未注册，请从帮助中心重新进入。
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="erp-primary-button" to="/erp/docs/operation-guide">
              返回 ERP 操作教程
            </Link>
            <Link className="erp-secondary-button" to="/erp/dashboard">
              返回任务看板
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
            <Link className="erp-secondary-button" to="/erp/print-center">
              模板打印中心
            </Link>
            <Link className="erp-secondary-button" to="/erp/changes/current">
              查看本轮变更记录
            </Link>
          </>
        }
      />

      {sectionHeadings.length ? (
        <div className="erp-help-doc-links erp-help-doc-links--sections">
          {sectionHeadings.map((heading) => (
            <a
              key={heading.id}
              className="erp-secondary-button erp-help-doc-links__section-button"
              href={`#${heading.id}`}
            >
              {heading.title}
            </a>
          ))}
        </div>
      ) : null}

      <SurfacePanel className="p-5 sm:p-6">
        <div
          ref={articleRef}
          className="erp-docs-article prose max-w-none prose-headings:tracking-tight"
        >
          <Markdown source={doc.source} />
        </div>
      </SurfacePanel>

      <HelpCenterBackToTopButton />
    </div>
  )
}
