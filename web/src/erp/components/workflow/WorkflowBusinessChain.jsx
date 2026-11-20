import React from 'react'
import { Button } from 'antd'
import { BranchesOutlined, DownOutlined, RightOutlined } from '@ant-design/icons'
import { getWorkflowTask, getWorkflowTaskHandlingChain } from '../../api/workflowApi.mjs'
import { buildWorkflowBusinessChain, supportsWorkflowBusinessChain } from '../../utils/workflowBusinessChain.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'
import WorkflowProgressMarker from './WorkflowProgressMarker.jsx'
import './workflowBusinessChain.css'

export default function WorkflowBusinessChain({ task, profile, view = 'task', onOpenTask, focused = false, showGuidance = true }) {
  const [result, setResult] = React.useState(null)
  const [offset, setOffset] = React.useState(0)
  const [opening, setOpening] = React.useState(false)
  const [openError, setOpenError] = React.useState('')
  const [selection, setSelection] = React.useState(null)
  const [historyDisclosure, setHistoryDisclosure] = React.useState(null)
  const historyIdentity = `${profile?.id}:${task?.id}:${task?.source_type}:${task?.source_id}`
  const historyOpen = historyDisclosure?.key === historyIdentity ? historyDisclosure.open : true
  const panelID = React.useId()
  const requestIdentity = React.useRef('')
  const [retry, setRetry] = React.useState(0)
  const supported = supportsWorkflowBusinessChain(task) && hasActionPermission(profile, PermissionCode.WORKFLOW_TASK_READ)
  const key = `${profile?.id}:${task?.id}:${task?.version}:${view}:${JSON.stringify(profile?.effective_session || profile?.permissions || [])}`
  React.useEffect(() => { requestIdentity.current = key; return () => { requestIdentity.current = '' } }, [key])
  React.useEffect(() => { setOffset(0); setOpening(false); setOpenError('') }, [key])
  React.useEffect(() => {
    if (!supported) return undefined
    const controller = new AbortController()
    setResult((previous) => previous?.key === key && previous.pageError ? { ...previous, pageError: false } : previous)
    getWorkflowTaskHandlingChain(task.id, { view, offset, signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setResult((previous) => {
        const items = offset && previous?.key === key ? [...previous.model.tasks, ...data.items] : data.items
        const unique = [...new Map(items.map((item) => [item.id, item])).values()]
        return { key, offset, model: buildWorkflowBusinessChain({ ...data, items: unique }, task.id) }
      }) }
    }).catch(() => {
      if (!controller.signal.aborted) setResult((previous) => previous?.key === key && previous.model ? { ...previous, pageError: true } : { key, error: true })
    })
    return () => controller.abort()
  }, [key, task?.id, supported, retry, view, offset])
  if (!supported) return null
  const current = result?.key === key ? result : null
  const groups = current?.model?.overview || []
  const selectedGroup = selection?.key === key
    ? selection.group
    : (groups.find((group) => group.current) || groups.find((group) => group.blocked) || groups.find((group) => group.open) || groups[0])?.key
  const taskHistory = current?.model?.tasks.filter((item) => !item.current && !['ready', 'blocked'].includes(item.task_status_key)).sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0) || b.id - a.id) || []
  const currentTasks = current?.model?.tasks.filter((item) => item.current) || []
  const pendingTasks = current?.model?.tasks.filter((item) => !item.current && ['ready', 'blocked'].includes(item.task_status_key)).sort((a, b) => Number(b.task_status_key === 'blocked') - Number(a.task_status_key === 'blocked')) || []
  const openTask = async (id) => {
    if (opening) return
    setOpening(true); setOpenError('')
    try { const next = await getWorkflowTask(id); if (requestIdentity.current === key) onOpenTask?.(next) }
    catch { if (requestIdentity.current === key) setOpenError('关联任务暂时无法打开，请重试。') }
    finally { if (requestIdentity.current === key) setOpening(false) }
  }
  const renderTask = (item) => (
    <li key={item.id} className="workflow-business-chain__task" aria-current={item.current ? 'step' : undefined} data-status={item.task_status_key}>
      <WorkflowProgressMarker status={item.task_status_key} />
      <div className="workflow-business-chain__task-content">
        <div className="workflow-business-chain__task-heading">
          {onOpenTask && !item.current ? <Button type="link" disabled={opening} onClick={() => openTask(item.id)}>{item.name}</Button> : <strong>{item.name}</strong>}
          <span className="workflow-business-chain__responsibility">{item.responsibilityLabel}</span>
        </div>
        {item.references.length || item.operationLabel || (view === 'order' && item.stageLabel) ? (
          <div className="workflow-business-chain__references">
            {view === 'order' && item.stageLabel ? <span>环节：{item.stageLabel}</span> : null}
            {item.operationLabel ? <span>工序：{item.operationLabel}</span> : null}
            {item.references.map(({ label, value }) => <span key={value}>{label}：<span>{value}</span></span>)}
          </div>
        ) : null}
        {focused && view === 'task' && !['ready', 'blocked'].includes(item.task_status_key) ? <span className="workflow-business-chain__completed-time">{item.completed_at ? `结束于 ${formatWorkflowTaskEventTime(item.completed_at)}` : '结束时间未记录'}</span> : null}
      </div>
    </li>
  )
  const renderGroup = (group, index) => {
    const expanded = selectedGroup === group.key
    const primary = group.tasks.slice(0, 2)
    const related = group.tasks.slice(2)
    const blocked = related.filter((item) => item.task_status_key === 'blocked').length
    const regionID = `${panelID}-${group.key}`
    return (
      <section key={group.key} className="workflow-business-chain__group" data-current={group.current || undefined} data-expanded={expanded || undefined} data-tone={group.tone}>
        <button type="button" className="workflow-business-chain__node" aria-current={group.current ? 'step' : undefined} aria-expanded={expanded} aria-controls={regionID} onClick={() => setSelection({ key, group: expanded ? null : group.key })}>
          <WorkflowProgressMarker tone={group.tone}>{group.exception ? <BranchesOutlined /> : group.key === 'unclassified' ? '?' : index + 1}</WorkflowProgressMarker>
          <strong>{group.label}{group.exception ? <small className="workflow-business-chain__branch-label">分支</small> : null}</strong>
          <span className="workflow-business-chain__stage-status">{group.statusLabel}</span>
          <RightOutlined className="workflow-business-chain__chevron" aria-hidden="true" />
        </button>
        {expanded ? (
          <div id={regionID} className="workflow-business-chain__stage-content">
            {primary.length ? <ul>{primary.map(renderTask)}</ul> : <p className="workflow-business-chain__hint">当前账号暂无本阶段可见任务。</p>}
            {related.length ? (
              <details key={group.key} className="workflow-business-chain__related">
                <summary>其他任务 {related.length} 项{blocked ? ` · ${blocked} 项受阻` : ''}</summary>
                <ul>{related.map(renderTask)}</ul>
              </details>
            ) : null}
            {!group.exception && group.key !== 'unclassified' ? <details className="workflow-business-chain__rules"><summary>本阶段环节与岗位</summary><ul>{group.groups.map((stage) => <li key={stage.key}><strong>{stage.label}</strong><span>{stage.role || '以任务责任岗位为准'}</span></li>)}</ul></details> : null}
          </div>
        ) : null}
      </section>
    )
  }
  const renderPagination = (label) => current?.model?.truncated ? current.pageError ? (
    <div role="alert">后续关联任务读取失败，已加载内容保留。<Button size="small" onClick={() => setRetry((value) => value + 1)}>重试加载</Button></div>
  ) : <Button loading={current.offset !== offset} onClick={() => setOffset((value) => value + 100)}>{label}</Button> : null
  const exceptionGroup = groups.find((group) => group.exception)
  const unclassifiedGroup = groups.find((group) => group.key === 'unclassified')
  const exceptionView = exceptionGroup ? <section className="workflow-business-chain__exceptions" data-pending={exceptionGroup.open > 0 || undefined} aria-label="异常分支">{renderGroup(exceptionGroup)}</section> : null

  return (
    <div className={`workflow-business-chain${focused ? ' workflow-business-chain--focused' : ''}`} data-view={view} aria-label={view === 'order' ? '订单任务链' : '本任务处理进度'}>
      {openError ? <p role="alert">{openError}</p> : null}
      {!current ? <p role="status">正在读取关联任务</p> : current.error ? (
        <div role="alert">
          关联任务暂时读取失败。
          <Button size="small" onClick={() => setRetry((value) => value + 1)}>重新读取</Button>
        </div>
      ) : view === 'task' ? (
        <>
          {!focused ? <ul className="workflow-business-chain__tasks">{currentTasks.map(renderTask)}</ul> : null}
          {focused && !pendingTasks.length && !taskHistory.length && !current.model.truncated ? <p className="workflow-business-chain__hint">当前暂无其他关联任务。</p> : null}
          {pendingTasks.length ? (
            <section className="workflow-business-chain__pending" aria-label="关联待办">
              <p className="workflow-business-chain__section-label">关联待办 <span>{pendingTasks.length}</span></p>
              <ul className="workflow-business-chain__tasks workflow-business-chain__tasks--related">{pendingTasks.slice(0, 2).map(renderTask)}</ul>
              {pendingTasks.length > 2 ? <details className="workflow-business-chain__related"><summary>其他待办 {pendingTasks.length - 2} 项{pendingTasks.slice(2).some((item) => item.task_status_key === 'blocked') ? ' · 含受阻任务' : ''}</summary><ul className="workflow-business-chain__tasks">{pendingTasks.slice(2).map(renderTask)}</ul></details> : null}
            </section>
          ) : null}
          {taskHistory.length ? (
            <details className="workflow-business-chain__history" open={focused ? historyOpen : undefined}>
              <summary onClick={focused ? (event) => { event.preventDefault(); setHistoryDisclosure({ key: historyIdentity, open: !historyOpen }) } : undefined}>
                <span>{focused ? '关联已处理任务' : '已处理记录'} {taskHistory.length} 项</span>
                {focused ? <DownOutlined className="workflow-business-chain__history-toggle" aria-hidden="true" /> : null}
              </summary>
              <ul className="workflow-business-chain__tasks workflow-business-chain__tasks--related">{taskHistory.map(renderTask)}</ul>
            </details>
          ) : null}
          {renderPagination('继续加载关联任务')}
        </>
      ) : (
        <>
          {exceptionGroup?.current ? exceptionView : null}
          <div className="workflow-business-chain__main" aria-label="订单阶段" data-direction="top-to-bottom">
            {groups.filter((group) => !group.exception && group.key !== 'unclassified').map(renderGroup)}
          </div>
          {!exceptionGroup?.current ? exceptionView : null}
          {unclassifiedGroup ? <section className="workflow-business-chain__unclassified" aria-label="待核对环节">{renderGroup(unclassifiedGroup)}</section> : null}
          {renderPagination('继续加载订单关联任务')}
          {showGuidance ? <p className="workflow-business-chain__hint">入库、检验和发货结果以对应单据为准。</p> : null}
        </>
      )}
    </div>
  )
}
