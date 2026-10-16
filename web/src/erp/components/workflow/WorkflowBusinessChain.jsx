import React from 'react'
import { Button, Select, Tag } from 'antd'
import { getWorkflowTask, getWorkflowTaskHandlingChain } from '../../api/workflowApi.mjs'
import { buildWorkflowBusinessChain, supportsWorkflowBusinessChain } from '../../utils/workflowBusinessChain.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { fulfillmentRoleOptions, fulfillmentStepMatchesRole } from '../../utils/workflowFulfillment.mjs'
import './workflowBusinessChain.css'

export default function WorkflowBusinessChain({ task, profile, view = 'task', onOpenTask }) {
  const [result, setResult] = React.useState(null)
  const [offset, setOffset] = React.useState(0)
  const [opening, setOpening] = React.useState(false)
  const [openError, setOpenError] = React.useState('')
  const [roleSelection, setRoleSelection] = React.useState({ key: '', role: 'all' })
  const roleSelectID = React.useId()
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
  const availableRoles = new Set(current?.model?.tasks.map((item) => item.owner_role_key))
  const roleOptions = fulfillmentRoleOptions.filter((option) => option.value === 'all' || availableRoles.has(option.value))
  const role = roleSelection.key === key && roleOptions.some((option) => option.value === roleSelection.role) ? roleSelection.role : 'all'
  const taskHistory = current?.model?.tasks.filter((item) => !item.current && !['ready', 'blocked'].includes(item.task_status_key)) || []
  const pendingTasks = current?.model?.tasks.filter((item) => item.current || ['ready', 'blocked'].includes(item.task_status_key)) || []
  const openTask = async (id) => {
    if (opening) return
    setOpening(true); setOpenError('')
    try { const next = await getWorkflowTask(id); if (requestIdentity.current === key) onOpenTask?.(next) }
    catch { if (requestIdentity.current === key) setOpenError('关联任务暂时无法打开，请重试。') }
    finally { if (requestIdentity.current === key) setOpening(false) }
  }
  const renderTask = (item) => (
    <li key={item.id} aria-current={item.current ? 'step' : undefined}>
      <span>{onOpenTask && !item.current ? <Button type="link" disabled={opening} onClick={() => openTask(item.id)}>{item.name}</Button> : <strong>{item.name}</strong>}{item.current ? <Tag color="blue">本任务</Tag> : null}</span>
      <span>{item.roleLabel} · {item.personLabel} · {item.statusLabel}</span>
      <small>{[item.batch_no, item.source_no].filter(Boolean).join(' · ')}</small>
    </li>
  )
  const renderGroup = (group) => {
    const visible = group.tasks.filter((item) => role === 'all' || item.owner_role_key === role || item.current)
    const primary = visible.filter((item, index) => item.current || item.task_status_key === 'blocked' || index < 2)
    const related = visible.filter((item) => !primary.includes(item))
    const matchesRole = fulfillmentStepMatchesRole(group, role) || group.tasks.some((item) => item.owner_role_key === role)
    return (
      <section key={group.key} className="workflow-business-chain__group" data-current={group.current || undefined} data-role-match={role !== 'all' ? matchesRole : undefined}>
        <div className="workflow-business-chain__node">
          <strong>{group.label}</strong>
          <Tag color={group.blocked ? 'error' : group.open ? 'processing' : 'default'}>{!group.tasks.length ? '无可见任务' : group.open ? `本环节 ${group.open} 项待办` : '关联任务已结束'}</Tag>
          <small>{group.current ? '本任务所在环节' : group.role}</small>
          {role !== 'all' && group.tasks.length ? <small>所选岗位 {group.tasks.filter((item) => item.owner_role_key === role).length} 项</small> : null}
        </div>
        {primary.length ? <ul>{primary.map(renderTask)}</ul> : null}
        {related.length ? (
          <details className="workflow-business-chain__related">
            <summary>其他关联任务 {related.length} 项</summary>
            <ul>{related.map(renderTask)}</ul>
          </details>
        ) : null}
      </section>
    )
  }
  const renderPagination = (label) => current?.model?.truncated ? current.pageError ? (
    <div role="alert">后续关联任务读取失败，已加载内容保留。<Button size="small" onClick={() => setRetry((value) => value + 1)}>重试加载</Button></div>
  ) : <Button loading={current.offset !== offset} onClick={() => setOffset((value) => value + 100)}>{label}</Button> : null

  return (
    <div className="workflow-business-chain" aria-label={view === 'order' ? '订单任务链' : '本任务处理进度'}>
      {openError ? <p role="alert">{openError}</p> : null}
      {!current ? <p role="status">正在读取关联任务</p> : current.error ? (
        <div role="alert">
          关联任务暂时读取失败。
          <Button size="small" onClick={() => setRetry((value) => value + 1)}>重新读取</Button>
        </div>
      ) : view === 'task' ? (
        <>
          <ul className="workflow-business-chain__tasks">{pendingTasks.map(renderTask)}</ul>
          {taskHistory.length ? (
            <details className="workflow-business-chain__history">
              <summary>已处理记录 {taskHistory.length} 项</summary>
              <ul className="workflow-business-chain__tasks">{taskHistory.map(renderTask)}</ul>
            </details>
          ) : null}
          {renderPagination('继续加载关联任务')}
        </>
      ) : (
        <>
          <div className="workflow-business-chain__heading">
            <label htmlFor={roleSelectID}>关注岗位</label>
            <Select id={roleSelectID} aria-label="关注岗位" value={role} options={roleOptions} onChange={(value) => setRoleSelection({ key, role: value })} />
          </div>
          {renderPagination('继续加载订单关联任务')}
          <div className="workflow-business-chain__main">{current.model.main.map(renderGroup)}</div>
          {current.model.exceptions.length ? (
            <section className="workflow-business-chain__exceptions" aria-label="异常分支">
              <h4>关联异常分支</h4>
              {current.model.exceptions.map(renderGroup)}
            </section>
          ) : null}
          <p className="workflow-business-chain__hint">同一环节可包含多张单据的并列任务，业务结果请查看对应单据。没有可见任务的环节不表示完成，具体路线和业务结果以单据为准。</p>
        </>
      )}
    </div>
  )
}
