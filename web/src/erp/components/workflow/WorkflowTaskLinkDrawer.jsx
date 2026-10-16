import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Drawer, Spin } from 'antd'
import { explainWorkflowActionAccess, getWorkflowTask, getWorkflowTaskLink } from '../../api/workflowApi.mjs'
import { buildWorkflowBusinessChain } from '../../utils/workflowBusinessChain.mjs'
import { buildWorkflowActionAccessState } from '../../utils/workflowTaskActionAccess.mjs'
import { singleTaskLinkAction, taskLinkID, workflowTaskLinkPath } from '../../utils/workflowTaskLink.mjs'
import { TaskCopyButton } from './WorkflowTaskCopy.jsx'
import './workflowTracking.css'
import './workflowBusinessChain.css'

export default function WorkflowTaskLinkDrawer({ profile, taskOpen = false, autoOpenRef, onOpenTask }) {
  const [search, setSearch] = useSearchParams()
  const rawID = search.get('link_task')
  const id = taskLinkID(rawID)
  const open = rawID !== null && !taskOpen
  const [result, setResult] = useState(null)
  const [reload, setReload] = useState(0)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')
  const [appending, setAppending] = useState(false)
  const localAutoRef = useRef('')
  const attempted = autoOpenRef || localAutoRef
  const actionRequest = useRef(null)
  const loadRequest = useRef(null)
  const onOpen = useRef(onOpenTask)
  onOpen.current = onOpenTask
  const scope = JSON.stringify([profile?.id, profile?.effective_session, profile?.permissions, profile?.roles])
  const identity = `${scope}:${id}`
  const key = `${identity}:${reload}`
  useEffect(() => {
    setOpenError('')
    setOpening(false)
    setAppending(false)
    if (!open || !id) return undefined
    const request = new AbortController()
    loadRequest.current = request
    getWorkflowTaskLink(id, { signal: request.signal }).then(
      (data) => { if (!request.signal.aborted) setResult({ key, data, nextOffset: data.items.length }) },
      () => { if (!request.signal.aborted) setResult({ key, error: true }) }
    )
    return () => {
      request.abort()
      loadRequest.current?.abort()
      actionRequest.current?.abort()
      actionRequest.current = null
    }
  }, [open, id, key])
  const current = result?.key === key ? result : null
  const data = current?.data
  const openTask = async (item, automatic = false) => {
    if (actionRequest.current) return
    const request = new AbortController()
    actionRequest.current = request
    setOpening(true)
    setOpenError('')
    try {
      const task = await getWorkflowTask(item.id, { signal: request.signal })
      const explainData = await explainWorkflowActionAccess({ task_id: item.id }, { signal: request.signal })
      if (request.signal.aborted) return
      const access = buildWorkflowActionAccessState({ task, adminProfile: profile, explainData })
      const handle = ['ready', 'blocked'].includes(task.task_status_key) && access.source === 'backend' && access.canHandle
      if (automatic && !handle) {
        setReload((value) => value + 1)
        return
      }
      onOpen.current(task, handle)
    } catch {
      if (!request.signal.aborted) setOpenError('任务暂时无法打开，可能已流转或权限发生变化。请刷新进度后重试。')
    } finally {
      if (actionRequest.current === request) actionRequest.current = null
      if (!request.signal.aborted) setOpening(false)
    }
  }
  const opener = useRef(openTask)
  opener.current = openTask
  useEffect(() => {
    if (!open || !data || attempted.current === identity) return
    attempted.current = identity
    const task = singleTaskLinkAction(data)
    if (task) opener.current(task, true)
  }, [open, data, identity, attempted])
  const close = () => {
    setSearch((params) => { const next = new URLSearchParams(params); next.delete('link_task'); return next }, { replace: true })
    attempted.current = ''
  }
  const append = async () => {
    if (appending || !data?.truncated) return
    const request = new AbortController()
    loadRequest.current = request
    setAppending(true)
    setOpenError('')
    try {
      const next = await getWorkflowTaskLink(id, { offset: current.nextOffset, signal: request.signal })
      if (!request.signal.aborted) setResult({ key, nextOffset: current.nextOffset + next.items.length, data: { ...next, items: [...new Map([...data.items, ...next.items].map((item) => [item.id, item])).values()] } })
    } catch {
      if (!request.signal.aborted) setOpenError('后续任务读取失败，已加载内容保留，请重试。')
    } finally {
      if (!request.signal.aborted) setAppending(false)
    }
  }
  const tasks = data ? buildWorkflowBusinessChain(data, id).tasks : []
  const pending = tasks.filter((item) => ['ready', 'blocked'].includes(item.task_status_key))
  const ended = tasks.filter((item) => !['ready', 'blocked'].includes(item.task_status_key))
  const renderTask = (item) => (
    <li key={item.id}>
      <div className="workflow-business-chain__task-content">
        <div className="workflow-business-chain__task-heading">
          <Button type="link" disabled={opening || appending} onClick={() => openTask(item)}>{item.name}</Button>
          <span className="workflow-business-chain__responsibility">{item.responsibilityLabel}</span>
        </div>
        <div className="workflow-business-chain__references">
          {item.references.map(({ label, value }) => <span key={value}>{label}：{value}</span>)}
          {item.current ? <span>分享的任务</span> : null}
          {item.can_handle ? <span>待您办理</span> : null}
        </div>
      </div>
    </li>
  )
  return (
    <Drawer
      title="任务链"
      open={open}
      onClose={close}
      closeIcon={<LeftOutlined aria-hidden />}
      closable={{ placement: 'start', 'aria-label': '返回任务列表' }}
      width="min(760px, 100vw)"
      className="erp-workflow-drawer erp-workflow-tracking-drawer"
      footer={<div className="erp-workflow-tracking-footer-actions"><Button icon={<ReloadOutlined aria-hidden />} disabled={opening || appending || !id} onClick={() => setReload((value) => value + 1)}>刷新进度</Button>{id ? <TaskCopyButton text={new URL(workflowTaskLinkPath(id), window.location.origin).href} label="任务链接" showLabel /> : null}</div>}
    >
      {!id ? <Alert type="error" message="任务链接无效" /> : !current ? <Spin tip="正在读取任务链"><div className="erp-workflow-tracking-loading" /></Spin> : current.error ? (
        <Alert type="error" showIcon message="无法打开任务链" description="任务不存在、当前账号无权查看，或读取暂时失败。请核对账号后重试。" action={<Button onClick={() => setReload((value) => value + 1)}>重新读取</Button>} />
      ) : (
        <div className="workflow-business-chain erp-workflow-tracking-detail" aria-label="分享任务链" aria-busy={opening}>
          {opening ? <p role="status">正在打开任务…</p> : null}
          {openError ? <p role="alert">{openError}</p> : null}
          <h3>当前待办</h3>
          {pending.length ? <ul className="workflow-business-chain__tasks">{pending.map(renderTask)}</ul> : <p>当前可见任务已结束。</p>}
          {ended.length ? <><h3>已处理记录</h3><ul className="workflow-business-chain__tasks">{ended.map(renderTask)}</ul></> : null}
          {data.truncated ? <Button loading={appending} disabled={opening} onClick={append}>继续加载关联任务</Button> : null}
        </div>
      )}
    </Drawer>
  )
}
