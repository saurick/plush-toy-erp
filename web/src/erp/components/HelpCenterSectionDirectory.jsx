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
          先按新手、角色和业务主线找入口，再进入高级文档。
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
