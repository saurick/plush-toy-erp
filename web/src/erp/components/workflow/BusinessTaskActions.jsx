import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Input, Select, Space, Spin, Tag, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import Table from '@/common/components/table/AppTable.jsx'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import WorkflowTaskActionDrawer, { getWorkflowTaskActionMeta } from './WorkflowTaskActionDrawer.jsx'
import WorkflowFollowupDetails from './WorkflowFollowupDetails.jsx'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess.js'
import { useSourceOrderWorkflowActions } from './useSourceOrderWorkflowActions.mjs'
import { getWorkflowTaskCreateOptions, createWorkflowFollowupTask, listWorkflowTasks } from '../../api/workflowApi.mjs'
import { canCreateFollowupFromRecord, followupSource, requireFollowupTaskPage } from '../../utils/workflowFollowup.mjs'
import { hasActionPermission, formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import { getWorkflowTaskOwnerRoleLabel, getWorkflowTaskStatusMeta, writeWorkflowTaskBoardFiltersToSearch } from '../../utils/workflowTaskBoard.mjs'
import { isWorkflowTaskMutationResultUnknown, workflowTaskMutationUUID } from '../../utils/workflowTaskMutation.mjs'

export default function BusinessTaskActions({ sourceType, record, adminProfile, disabled = false, onCreated }) {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('create')
  const [context, setContext] = useState(null)
  const [options, setOptions] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(1)
  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [receipt, setReceipt] = useState(null)
  const [task, setTask] = useState(null)
  const [actionMode, setActionMode] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionReceipt, setActionReceipt] = useState(null)
  const [actionSaving, setActionSaving] = useState(false)
  const busyRef = useRef(false)
  const attemptRef = useRef(null)
  const taskRequestRef = useRef(null)
  const roleKey = Form.useWatch('owner_role_key', form)
  const selectedRole = options?.roles.find((role) => role.role_key === roleKey)
  const canRead = hasActionPermission(adminProfile, 'workflow.task.read')
  const canCreate = hasActionPermission(adminProfile, 'workflow.task.create')
  const source = followupSource(sourceType, record)
  const sourceID = context?.source_id
  const contextType = context?.source_type

  useEffect(() => {
    if (!open || view !== 'create' || !sourceID) return undefined
    const controller = new AbortController()
    setLoading(true)
    setOptions(null)
    setError('')
    getWorkflowTaskCreateOptions({ source_type: contextType, source_id: sourceID }, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setOptions(value) })
      .catch((err) => { if (!controller.signal.aborted && !isRpcAbortError(err)) setError(getActionErrorMessage(err, '读取任务发起资料')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, view, sourceID, contextType, revision])

  const loadTasks = useCallback(async () => {
    if (!sourceID) return
    taskRequestRef.current?.abort()
    const controller = new AbortController()
    taskRequestRef.current = controller
    setLoading(true)
    setError('')
    try {
      const data = requireFollowupTaskPage(await listWorkflowTasks({ source_type: contextType, source_id: sourceID, limit: 10, offset: (page - 1) * 10 }, { signal: controller.signal }), { source_type: contextType, source_id: sourceID })
      if (controller.signal.aborted) return
      setTasks(data.tasks)
      setTotal(data.total)
    } catch (err) {
      if (!controller.signal.aborted && !isRpcAbortError(err)) {
        setTasks([])
        setTotal(0)
        setError(getActionErrorMessage(err, '读取相关任务'))
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [sourceID, contextType, page])
  useEffect(() => {
    if (open && view === 'related') loadTasks()
    return () => taskRequestRef.current?.abort()
  }, [open, view, loadTasks])
  const handlers = useSourceOrderWorkflowActions({ loadWorkflowTasks: loadTasks, surfaceKey: 'business_record_tasks' })
  const access = useWorkflowTaskActionAccess({ adminProfile, task, enabled: Boolean(task) })
  const allowedModes = task?.task_group === 'business_followup'
    ? access.allowedModes.filter((mode) => ['complete', 'block', 'reject', 'resume', 'urge'].includes(mode))
    : []
  const openTaskBoard = (item = null) => {
    const filters = { keyword: item?.task_code || context?.source_no, sourceType: contextType }
    navigate(`/erp/task-board?${writeWorkflowTaskBoardFiltersToSearch('', filters)}`)
  }
  const openTask = (item) => {
    if (item.task_group !== 'business_followup') {
      openTaskBoard(item)
      return
    }
    setOpen(false)
    setTask(item)
    setActionMode('')
    setActionReason('')
    setActionReceipt(null)
  }

  const openView = (nextView) => {
    if (nextView === 'create' && attemptRef.current) {
      setContext(attemptRef.current.context)
      setPending(true)
    } else {
      setContext({ ...source, source_no: record?.order_no || record?.purchase_order_no || record?.outsourcing_order_no || record?.shipment_no || '' })
      if (nextView === 'create') {
        form.resetFields()
        setPending(false)
      }
    }
    setError('')
    setOptions(null)
    setTasks([])
    setTotal(0)
    setPage(1)
    setReceipt(null)
    setView(nextView)
    setOpen(true)
  }
  const submit = async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      if (!attemptRef.current) {
        const values = await form.validateFields()
        const dueAt = Math.floor(new Date(values.deadline).getTime() / 1000)
        if (!Number.isFinite(dueAt) || dueAt <= Date.now() / 1000) {
          form.setFields([{ name: 'deadline', errors: ['截止时间须晚于当前时间'] }])
          return
        }
        attemptRef.current = {
          context,
          params: {
            source_type: contextType,
            source_id: sourceID,
            task_name: values.task_name.trim(),
            description: values.description.trim(),
            owner_role_key: values.owner_role_key,
            assignee_id: values.assignee_id === 'pool' ? null : values.assignee_id,
            due_at: dueAt,
            priority: values.priority || 0,
            idempotency_key: `followup:${workflowTaskMutationUUID()}`,
          },
        }
      }
      setSaving(true)
      setError('')
      const created = await createWorkflowFollowupTask(attemptRef.current.params)
      attemptRef.current = null
      setPending(false)
      setReceipt(created)
      setView('receipt')
      if (onCreated) Promise.resolve().then(() => onCreated(created)).catch(() => message.warning('任务已发起，来源页面刷新失败，请重新读取'))
    } catch (err) {
      if (err?.errorFields) return
      const unknown = isWorkflowTaskMutationResultUnknown(err)
      setPending(unknown)
      if (!unknown) attemptRef.current = null
      setError(unknown ? '发起结果暂未确认，内容已保留。请使用原内容重试，系统会核对已有结果。' : getActionErrorMessage(err, '发起任务'))
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }
  const closeModal = () => {
    if (saving) return
    if (view === 'create' && !pending && form.isFieldsTouched()) {
      modal.confirm({
        centered: true,
        title: '放弃未发起的任务？',
        content: '当前填写的任务内容尚未发送。',
        okText: '放弃填写',
        cancelText: '继续编辑',
        onOk: () => setOpen(false),
      })
    } else setOpen(false)
  }
  const closeTask = () => { if (!actionSaving) { setTask(null); setActionReceipt(null); setActionMode(''); setActionReason(''); setOpen(true) } }
  const submitTask = async () => {
    if (!task || actionSaving || !allowedModes.includes(actionMode)) return
    const meta = getWorkflowTaskActionMeta(task, actionMode)
    if (meta?.requireReason && !actionReason.trim()) return
    const actionHandlers = { complete: handlers.completeWorkflowTask, block: handlers.blockWorkflowTask, reject: handlers.rejectWorkflowTask, resume: handlers.resumeWorkflowTask, urge: handlers.urgeSourceWorkflowTask }
    setActionSaving(true)
    try {
      const updated = await actionHandlers[actionMode](task, { reason: actionReason })
      if (updated === false) return
      setTask(updated)
      setActionReceipt({ actionMode, actionTitle: meta.title, reason: actionReason, successMessage: meta.successMessage })
    } catch (err) {
      message.error(isWorkflowTaskMutationResultUnknown(err) ? '处理结果暂未确认，请保持原内容重试' : getActionErrorMessage(err, '处理任务'))
    } finally { setActionSaving(false) }
  }

  if (!canRead) return null
  const taskColumns = [
    { title: '任务事项', key: 'name', render: (_, item) => <Button type="link" onClick={() => openTask(item)}>{item.task_name}{item.task_group !== 'business_followup' ? '（任务看板）' : ''}</Button> },
    { title: '责任岗位', key: 'role', render: (_, item) => getWorkflowTaskOwnerRoleLabel(item) },
    { title: '状态', key: 'state', render: (_, item) => <Tag>{getWorkflowTaskStatusMeta(item).label}</Tag> },
    { title: '截止时间', dataIndex: 'due_at', render: (value) => value ? formatUnixDate(value) : '未设置' },
  ]
  return (
    <>
      <Space size={4}>
        {canCreate ? <Button size="small" icon={<CalendarOutlined />} data-business-action-key="create-followup" disabled={disabled || (!pending && !canCreateFollowupFromRecord(sourceType, record))} title={!source ? '请先选择一张单据' : !canCreateFollowupFromRecord(sourceType, record) ? '当前单据已结束，可查看已有任务' : undefined} onClick={() => openView('create')}>{pending ? '确认发起结果' : '发起任务'}</Button> : null}
        <Button size="small" icon={<UnorderedListOutlined />} data-business-action-key="related-tasks" disabled={disabled || !source} onClick={() => openView('related')}>相关任务</Button>
      </Space>
      <BusinessFormModal
        open={open}
        forceRender
        title={view === 'related' ? '相关任务' : view === 'receipt' ? '任务已发起' : '发起任务'}
        width={760}
        onCancel={closeModal}
        closable={!saving}
        keyboard={!saving}
        footer={
          <Space>
            <Button disabled={saving} onClick={closeModal}>关闭</Button>
            {view === 'create' ? <Button type="primary" loading={saving} disabled={!pending && (loading || !options?.can_create)} onClick={submit}>{pending ? '重试并确认结果' : '发起任务'}</Button> : null}
            {view === 'receipt' ? <Button type="primary" onClick={() => setView('related')}>查看相关任务</Button> : null}
            {view === 'related' ? <Button onClick={() => openTaskBoard()}>打开任务看板</Button> : null}
          </Space>
      }
      >
        <Typography.Paragraph>来源单据：<strong>{options?.source_no || context?.source_no}</strong></Typography.Paragraph>
        {error ? <Alert type="error" showIcon message={error} action={!saving && !pending ? <Button size="small" onClick={() => view === 'related' ? loadTasks() : setRevision((value) => value + 1)}>重新读取</Button> : null} /> : null}
        <div hidden={view !== 'create'}>
          <Spin spinning={loading && view === 'create'}>
            {options && !options.can_create && !pending ? <Alert type="info" message={options.reason} /> : null}
            <Form form={form} layout="vertical" initialValues={{ assignee_id: 'pool', priority: 0 }} disabled={saving || pending || loading || !options?.can_create} className="erp-business-task-form">
              <Form.Item name="task_name" label="任务事项" className="erp-business-task-form__wide" rules={[{ required: true, whitespace: true, message: '请填写任务事项' }]}><Input maxLength={128} placeholder="例如：补充包装稿、确认交期变化" /></Form.Item>
              <Form.Item name="owner_role_key" label="责任岗位" rules={[{ required: true, message: '请选择责任岗位' }]}><Select placeholder="请选择责任岗位" options={(options?.roles || []).map((role) => ({ value: role.role_key, label: role.label }))} onChange={() => form.setFieldsValue({ assignee_id: 'pool' })} /></Form.Item>
              <Form.Item name="assignee_id" label="办理人"><Select options={[{ value: 'pool', label: '由岗位共同办理' }, ...(selectedRole?.assignees || []).map((person) => ({ value: person.admin_id, label: person.display_name }))]} /></Form.Item>
              <Form.Item name="deadline" label="截止时间" rules={[{ required: true, message: '请选择截止时间' }]}><Input type="datetime-local" /></Form.Item>
              <Form.Item name="priority" label="优先级"><Select options={[{ value: 0, label: '普通' }, { value: 10, label: '紧急' }]} /></Form.Item>
              <Form.Item name="description" label="需要对方完成什么" className="erp-business-task-form__wide" rules={[{ required: true, whitespace: true, message: '请写清任务要求和期望结果' }]}><Input.TextArea maxLength={2000} showCount autoSize={{ minRows: 3, maxRows: 7 }} /></Form.Item>
            </Form>
          </Spin>
        </div>
        {view === 'receipt' && receipt ? <><Typography.Paragraph>已发给{getWorkflowTaskOwnerRoleLabel(receipt)}，可在相关任务中查看进度和催办。</Typography.Paragraph><Typography.Title level={5}>{receipt.task_name}</Typography.Title><WorkflowFollowupDetails task={receipt} /></> : null}
        {view === 'related' ? <Table size="small" rowKey="id" loading={loading} dataSource={tasks} columns={taskColumns} scroll={{ x: 580 }} pagination={{ current: page, pageSize: 10, total, showSizeChanger: false, onChange: setPage }} locale={{ emptyText: '当前单据暂无可见任务' }} /> : null}
      </BusinessFormModal>
      <WorkflowTaskActionDrawer task={task} profile={adminProfile} actionMode={actionMode} actionReason={actionReason} actionSaving={actionSaving} actionReceipt={actionReceipt} allowedActionModes={allowedModes} actionAvailabilityLoading={access.loading} readonlyReason={access.readonlyReason} onActionModeChange={setActionMode} onActionReasonChange={setActionReason} onClose={closeTask} onSubmit={submitTask} canViewAttachments={canRead} canManageAttachments={access.canHandle && hasActionPermission(adminProfile, 'workflow.task.update')} />
    </>
  )
}

BusinessTaskActions.selectionActionPriority = 85
