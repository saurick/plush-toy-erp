import React, { useRef } from 'react'
import { Button } from 'antd'
import ProgressRelatedTasks from '../business-visualizations/ProgressRelatedTasks.jsx'

export default function LinkedDocumentTasks({
  source,
  mobile,
  query,
  onQuery,
  onBack,
  onOpen,
  refreshKey,
}) {
  const scroll = useRef(null)
  return (
    <section className="erp-document-tasks" aria-label="本单关联任务">
      <div className="erp-document-tasks-toolbar">
        <Button onClick={onBack}>返回进度看板</Button>
        <strong>
          {source.orderNo || (source.view === 'production' ? '生产单' : '销售订单')} · 关联任务
        </strong>
      </div>
      <div className="erp-document-tasks-results" ref={scroll}>
        <ProgressRelatedTasks
          source={source}
          mobile={mobile}
          saved={query || { status: 'open' }}
          refreshKey={refreshKey}
          onRemember={onQuery}
          scrollRef={scroll}
          onOpen={(task, saved) => {
            onQuery(saved)
            onOpen(task.id)
          }}
        />
      </div>
    </section>
  )
}
