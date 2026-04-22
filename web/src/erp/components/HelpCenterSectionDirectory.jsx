import React from 'react'
import SurfacePanel from '@/common/components/layout/SurfacePanel'

export default function HelpCenterSectionDirectory({ headings = [] }) {
  if (!headings.length) {
    return null
  }

  return (
    <SurfacePanel className="erp-help-doc-toc p-4">
      <div className="erp-help-doc-toc__header">
        <div className="text-sm font-semibold text-slate-50">本页目录</div>
        <div className="text-xs leading-5 text-slate-400">
          先看后台与移动端原则，再看模板打印和正式文档。
        </div>
      </div>
      <ol className="erp-help-doc-toc__list">
        {headings.map((heading) => (
          <li key={heading.id} className="erp-help-doc-toc__item">
            <a className="erp-help-doc-toc__link" href={`#${heading.id}`}>
              {heading.title}
            </a>
          </li>
        ))}
      </ol>
    </SurfacePanel>
  )
}
