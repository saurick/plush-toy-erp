import React from 'react'
import './workflowResponsibilities.css'

export default function WorkflowResponsibilities({ items }) {
  const uniqueItems = [...new Map(items.map((parts) => [JSON.stringify(parts), parts])).values()]
  return (
    <span className="erp-workflow-responsibilities">
      {uniqueItems.map(([role, ...details], index) => (
        <React.Fragment key={JSON.stringify([role, ...details])}>
          {index > 0 ? '；' : null}
          <strong className="erp-workflow-responsibilities__role">{role}</strong>
          {details.length > 0 ? ` · ${details.join(' · ')}` : null}
        </React.Fragment>
      ))}
    </span>
  )
}
