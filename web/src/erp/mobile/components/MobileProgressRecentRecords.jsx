import { useEffect, useState } from 'react'
import { Empty } from 'antd'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { listWorkflowTaskEvents } from '../../api/workflowApi.mjs'
import { buildWorkflowTaskEventTrailModel } from '../../utils/workflowTaskEventPresentation.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'

export default function MobileProgressRecentRecords({ task, canRead }) {
  const taskID = canRead ? task?.id : null
  const [result, setResult] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    setResult(null)
    if (!taskID) return undefined
    const controller = new AbortController()
    listWorkflowTaskEvents(taskID, { limit: 3, signal: controller.signal })
      .then(({ items }) => {
        if (!controller.signal.aborted) setResult({ task, items })
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResult({
            task,
            error: getActionErrorMessage(error, '读取关联任务记录'),
          })
        }
      })
    return () => controller.abort()
  }, [taskID, task, reload])
  const current = result?.task === task ? result : null
  const { items } = buildWorkflowTaskEventTrailModel({
    task: { id: taskID },
    events: current?.items || [],
  })

  return (
    <section
      className="mobile-detail-section mobile-progress-recent"
      aria-label="最近记录"
    >
      <h3>最近记录</h3>
      {taskID ? (
        <p className="mobile-progress-recent-source">
          {getWorkflowTaskDisplayName({ task_name: task.label })} · 关联任务记录
        </p>
      ) : null}
      {!canRead ? (
        <p className="mobile-detail-muted">暂无查看权限</p>
      ) : !taskID ? (
        <Empty description="暂无关联任务记录" />
      ) : !current ? (
        <p className="mobile-detail-muted" role="status">
          正在读取记录…
        </p>
      ) : current.error ? (
        <div role="alert" className="mobile-progress-recent-error">
          <p>{current.error}</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            重新读取记录
          </button>
        </div>
      ) : items.length ? (
        <ol className="mobile-detail-timeline">
          {items.map((item) => (
            <li key={item.key}>
              <strong>{item.label}</strong>
              <small>
                {item.timeLabel} · {item.actorLabel}
              </small>
              {item.reason ? <p>{item.reason}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <Empty description="暂无处理记录" />
      )}
    </section>
  )
}
