import React from 'react'
import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'

export default function WorkflowExceptionPhotos({ sources }) {
  const [expanded, setExpanded] = React.useState(false)
  if (!sources.length) return null
  return (
    <details className="workflow-exceptions__photos" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>质检照片</summary>
      {expanded ? sources.map((source) => (
        <BusinessAttachmentPanel
          key={source.id}
          ownerType="quality_inspection"
          ownerId={source.id}
          title={source.number}
          description="本次异常所关联检验记录中的照片"
          canUpload={false}
          canWithdraw={false}
          imagesOnly
          variant="inline"
          compact
        />
      )) : null}
    </details>
  )
}
