import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, Form, Input, Modal, Select, Space, Tag } from 'antd'
import dayjs from 'dayjs'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  createWorkflowTask,
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
  DateInput,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import { getBusinessModule } from '../config/businessModules.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'
import { ROLE_DISPLAY_NAMES } from '../utils/roleKeys.mjs'
import {
  getTaskOwnerRoleKey,
  getWorkflowTaskReadonlyReason,
  getWorkflowTaskDueLabel,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
  canRunWorkflowTaskAction,
} from '../utils/workflowTaskBoard.mjs'

function businessActionModalTitle(title, description) {
  return (
    <div className="erp-business-action-modal__title">
      <span>{title}</span>
      <small>{description}</small>
    </div>
  )
}

const WORKFLOW_ROLE_LABELS = new Map(Object.entries(ROLE_DISPLAY_NAMES))
const TASK_STATUS_OPTIONS = Object.freeze([
  { label: '全部状态', value: '' },
  { label: '待处理', value: 'pending' },
  { label: '可执行', value: 'ready' },
  { label: '处理中', value: 'processing' },
  { label: '阻塞', value: 'blocked' },
  { label: '退回', value: 'rejected' },
  { label: '已完成', value: 'done' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'cancelled' },
])

const MODULE_WORKFLOW_CONFIG = Object.freeze({
  'production-scheduling': {
    taskGroup: 'production_scheduling',
    defaultOwnerRoleKey: 'pmc',
    createLabel: '新建排程协同',
    createTitle: '新建排程协同任务',
    sourcePrefix: 'PS',
    successMessage: '排程协同任务已创建',
    createBusinessStatusKey: 'production_ready',
    completeBusinessStatusKey: 'production_processing',
    completionMessage:
      '排程协同任务已完成，领料、完工和入库仍需进入对应事实模块。',
    emptyText: '暂无生产排程协同任务。',
    ownerRoleOptions: [
      { label: 'PMC', value: 'pmc' },
      { label: '生产', value: 'production' },
      { label: '仓库', value: 'warehouse' },
    ],
    payloadScope: 'production_scheduling_workflow_only',
  },
  'production-exceptions': {
    taskGroup: 'production_exception',
    defaultOwnerRoleKey: 'production',
    createLabel: '登记异常协同',
    createTitle: '登记生产异常协同任务',
    sourcePrefix: 'PE',
    successMessage: '生产异常协同任务已创建',
    createBusinessStatusKey: 'blocked',
    completeBusinessStatusKey: 'production_processing',
    completionMessage:
      '异常协同任务已完成，返工、报废或库存调整仍需进入对应事实模块。',
    emptyText: '暂无生产异常协同任务。',
    ownerRoleOptions: [
      { label: '生产', value: 'production' },
      { label: 'PMC', value: 'pmc' },
      { label: '品质', value: 'quality' },
      { label: '仓库', value: 'warehouse' },
    ],
    payloadScope: 'production_exception_workflow_only',
  },
  'shipping-release': {
    taskGroup: 'shipment_release',
    defaultOwnerRoleKey: 'warehouse',
    createLabel: '新建放行协同',
    createTitle: '新建出货放行协同任务',
    sourcePrefix: 'SR',
    successMessage: '出货放行协同任务已创建',
    createBusinessStatusKey: 'shipment_pending',
    completeBusinessStatusKey: 'shipping_released',
    completionMessage:
      '出货放行协同任务已完成，真实出货仍需出货单进入 SHIPPED。',
    emptyText: '暂无出货放行协同任务。',
    ownerRoleOptions: [
      { label: '仓库', value: 'warehouse' },
      { label: '业务', value: 'sales' },
      { label: '品质', value: 'quality' },
      { label: '财务', value: 'finance' },
    ],
    payloadScope: 'shipment_release_workflow_only',
  },
})

function workflowPayloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function toUnixSeconds(value) {
  if (!value) return undefined
  const parsed = dayjs(String(value).trim())
  return parsed.isValid() ? parsed.endOf('day').unix() : undefined
}

function getTaskID(task = {}) {
  return Number(task.id || 0)
}

function buildTaskCode({ moduleKey, config, taskName }) {
  const normalizedName = String(taskName || '')
    .trim()
    .replace(/\s+/gu, '-')
    .slice(0, 24)
  return [
    config.sourcePrefix,
    dayjs().format('YYYYMMDDHHmmss'),
    normalizedName || moduleKey,
  ]
    .filter(Boolean)
    .join('-')
}

function formatTaskSource(task = {}) {
  if (task.source_no) return task.source_no
  if (task.source_id) return `协同记录第 ${task.source_id} 条`
  return '未登记来源号'
}

export default function WorkflowBusinessModulePage({ moduleKey }) {
  const moduleItem = getBusinessModule(moduleKey)
  const config = MODULE_WORKFLOW_CONFIG[moduleKey]
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [taskReasonModal, setTaskReasonModal] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [ownerRoleKey, setOwnerRoleKey] = useState('')
  const [selectedTaskKeys, setSelectedTaskKeys] = useState([])
  const [taskActionLoadingID, setTaskActionLoadingID] = useState(0)
  const [urgingTaskID, setUrgingTaskID] = useState(0)
  const [form] = Form.useForm()
  const canReadWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.read'
  )
  const canCreateWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.create'
  )
  const canUpdateWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.update'
  )
  const canCompleteWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.complete'
  )

  const loadWorkflowTasks = useCallback(async () => {
    if (!config || !canReadWorkflowTasks) {
      setTasks([])
      return false
    }
    setLoading(true)
    try {
      const data = await listWorkflowTasks({
        source_type: moduleKey,
        task_group: config.taskGroup,
        limit: 200,
      })
      const nextTasks = (data?.tasks || []).filter(
        (task) =>
          task.source_type === moduleKey && task.task_group === config.taskGroup
      )
      setTasks(nextTasks)
      setSelectedTaskKeys((current) =>
        current.filter((key) => nextTasks.some((task) => task.id === key))
      )
      return true
    } catch (error) {
      setTasks([])
      message.error(
        getActionErrorMessage(
          error,
          `加载${moduleItem?.title || '协同'}协同任务失败`
        )
      )
      return false
    } finally {
      setLoading(false)
    }
  }, [canReadWorkflowTasks, config, moduleItem?.title, moduleKey])

  useEffect(() => {
    loadWorkflowTasks()
  }, [loadWorkflowTasks])

  useEffect(() => {
    if (!moduleItem) return undefined
    return outletContext?.registerPageRefresh?.(async () => {
      const refreshed = await loadWorkflowTasks()
      if (refreshed) {
        message.success(`${moduleItem.title}协同任务已刷新`)
      }
      return false
    })
  }, [loadWorkflowTasks, moduleItem, outletContext])

  const filteredTasks = useMemo(() => {
    const normalizedKeyword = normalizeText(keyword)
    return tasks.filter((task) => {
      if (status && task.task_status_key !== status) return false
      if (ownerRoleKey && getTaskOwnerRoleKey(task) !== ownerRoleKey) {
        return false
      }
      if (!normalizedKeyword) return true
      return [
        task.task_code,
        task.task_name,
        task.source_no,
        task.business_status_key,
        getWorkflowTaskReason(task),
      ].some((item) => normalizeText(item).includes(normalizedKeyword))
    })
  }, [keyword, ownerRoleKey, status, tasks])

  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskKeys.includes(task.id)),
    [selectedTaskKeys, tasks]
  )
  const selectedTask = selectedTasks[0] || null

  const stats = useMemo(() => {
    const activeCount = tasks.filter(
      (task) => !['done', 'closed', 'cancelled'].includes(task.task_status_key)
    ).length
    const blockedCount = tasks.filter((task) =>
      ['blocked', 'rejected'].includes(task.task_status_key)
    ).length
    return [
      { key: 'total', label: '协同任务', value: tasks.length },
      { key: 'active', label: '待处理', value: activeCount },
      { key: 'blocked', label: '阻塞 / 退回', value: blockedCount },
      { key: 'shown', label: '当前结果', value: filteredTasks.length },
    ]
  }, [filteredTasks.length, tasks])

  const selectedTaskLabel = selectedTask
    ? `${selectedTask.task_code || `TASK-${selectedTask.id}`} / ${
        selectedTask.task_name || '未填写任务名称'
      }`
    : `请先选择一条${moduleItem?.shortLabel || ''}协同任务`
  const selectedTaskItems = selectedTask
    ? [
        {
          key: selectedTask.id,
          label: selectedTask.task_name || selectedTask.task_code,
          title: selectedTask.task_code || '',
        },
      ]
    : []
  const selectedTaskStatusMeta = selectedTask
    ? getWorkflowTaskStatusMeta(selectedTask)
    : null
  const selectedTaskReadonlyReason =
    selectedTask && adminProfile
      ? getWorkflowTaskReadonlyReason(adminProfile, selectedTask)
      : ''
  const canCompleteSelected =
    Boolean(selectedTask) &&
    canCompleteWorkflowTasks &&
    canRunWorkflowTaskAction(adminProfile, selectedTask, 'complete')
  const canBlockSelected =
    Boolean(selectedTask) &&
    canUpdateWorkflowTasks &&
    canRunWorkflowTaskAction(adminProfile, selectedTask, 'block')
  const canUrgeSelected =
    Boolean(selectedTask) &&
    canUpdateWorkflowTasks &&
    canRunWorkflowTaskAction(adminProfile, selectedTask, 'urge')

  const openCreateModal = () => {
    form.setFieldsValue({
      task_name: '',
      source_id: '',
      source_no: '',
      owner_role_key: config?.defaultOwnerRoleKey || '',
      due_at: '',
      note: '',
    })
    setCreateModalOpen(true)
  }

  const handleCreateTask = async () => {
    if (!config || !moduleItem) return
    const values = await form.validateFields()
    setCreating(true)
    try {
      const taskName = String(values.task_name || '').trim()
      const sourceID = Number(values.source_id)
      await createWorkflowTask({
        task_code: buildTaskCode({ moduleKey, config, taskName }),
        task_group: config.taskGroup,
        task_name: taskName,
        source_type: moduleKey,
        source_id: sourceID,
        source_no: String(values.source_no || '').trim() || undefined,
        business_status_key: config.createBusinessStatusKey || 'pending',
        task_status_key: 'pending',
        owner_role_key: values.owner_role_key,
        due_at: toUnixSeconds(values.due_at),
        priority: 2,
        payload: {
          entry_path: moduleItem.path,
          record_title: taskName,
          note: String(values.note || '').trim(),
          workflow_page_scope: config.payloadScope,
        },
      })
      message.success(config.successMessage)
      setCreateModalOpen(false)
      await loadWorkflowTasks()
    } catch (error) {
      message.error(getActionErrorMessage(error, `${config.createTitle}失败`))
    } finally {
      setCreating(false)
    }
  }

  const completeWorkflowTask = useCallback(
    async (task) => {
      setTaskActionLoadingID(getTaskID(task))
      try {
        await updateWorkflowTaskStatus({
          id: task.id,
          task_status_key: 'done',
          business_status_key: config.completeBusinessStatusKey,
          reason: '',
          payload: {
            ...workflowPayloadOf(task),
            workflow_page_action: 'complete',
            workflow_page_scope: config.payloadScope,
          },
        })
        message.success(config.completionMessage)
        await loadWorkflowTasks()
      } catch (error) {
        message.error(getActionErrorMessage(error, '完成协同任务失败'))
      } finally {
        setTaskActionLoadingID(0)
      }
    },
    [config, loadWorkflowTasks]
  )

  const blockWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      setTaskActionLoadingID(getTaskID(task))
      try {
        await updateWorkflowTaskStatus({
          id: task.id,
          task_status_key: 'blocked',
          business_status_key: 'blocked',
          reason,
          payload: {
            ...workflowPayloadOf(task),
            blocked_reason: reason,
            workflow_page_action: 'block',
            workflow_page_scope: config.payloadScope,
          },
        })
        message.success('阻塞原因已记录')
        await loadWorkflowTasks()
      } catch (error) {
        message.error(getActionErrorMessage(error, '标记阻塞失败'))
      } finally {
        setTaskActionLoadingID(0)
      }
    },
    [config, loadWorkflowTasks]
  )

  const urgeWorkflowTaskFromPage = useCallback(
    async (task, { reason = '' } = {}) => {
      setUrgingTaskID(getTaskID(task))
      try {
        await urgeWorkflowTask({
          task_id: task.id,
          action: 'urge_task',
          reason,
          actor_role_key: 'admin',
          payload: {
            source_type: task.source_type,
            source_id: task.source_id,
            source_no: task.source_no,
            entry_path: moduleItem?.path,
            workflow_page_scope: config.payloadScope,
          },
        })
        message.success('催办已记录')
        await loadWorkflowTasks()
      } catch (error) {
        message.error(getActionErrorMessage(error, '催办协同任务失败'))
      } finally {
        setUrgingTaskID(0)
      }
    },
    [config, loadWorkflowTasks, moduleItem?.path]
  )

  const openTaskReasonModal = useCallback((mode) => {
    setTaskReasonModal({ mode, reason: '' })
  }, [])

  const closeTaskReasonModal = useCallback(() => {
    setTaskReasonModal(null)
  }, [])

  const submitTaskReasonAction = useCallback(async () => {
    if (!selectedTask || !taskReasonModal?.mode) return
    const reason = String(taskReasonModal.reason || '').trim()
    if (!reason) {
      message.warning('请先填写原因')
      return
    }
    if (taskReasonModal.mode === 'block') {
      await blockWorkflowTask(selectedTask, { reason })
    } else if (taskReasonModal.mode === 'urge') {
      await urgeWorkflowTaskFromPage(selectedTask, { reason })
    }
    closeTaskReasonModal()
  }, [
    blockWorkflowTask,
    closeTaskReasonModal,
    selectedTask,
    taskReasonModal,
    urgeWorkflowTaskFromPage,
  ])

  const columns = useMemo(
    () =>
      applyBusinessColumnSorters([
        {
          title: '任务编号',
          exportTitle: '任务编号',
          dataIndex: 'task_code',
          key: 'task_code',
          width: 190,
          fixed: 'left',
          render: (value, record) => (
            <Space direction="vertical" size={2}>
              <strong>{value || `TASK-${record.id}`}</strong>
              <span>{record.task_name}</span>
            </Space>
          ),
          exportValue: (record) => record?.task_code || `TASK-${record?.id}`,
        },
        {
          title: '来源',
          exportTitle: '来源',
          dataIndex: 'source_no',
          key: 'source_no',
          width: 170,
          render: (_, record) => formatTaskSource(record),
          exportValue: formatTaskSource,
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'task_status_key',
          key: 'task_status_key',
          width: 120,
          render: (_, record) => {
            const statusMeta = getWorkflowTaskStatusMeta(record)
            return <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
          },
          exportValue: (record) => getWorkflowTaskStatusMeta(record).label,
        },
        {
          title: '责任角色',
          exportTitle: '责任角色',
          dataIndex: 'owner_role_key',
          key: 'owner_role_key',
          width: 120,
          render: (_, record) => {
            const roleKey = getTaskOwnerRoleKey(record)
            return WORKFLOW_ROLE_LABELS.get(roleKey) || roleKey || '-'
          },
          exportValue: (record) => {
            const roleKey = getTaskOwnerRoleKey(record)
            return WORKFLOW_ROLE_LABELS.get(roleKey) || roleKey || ''
          },
        },
        {
          title: '到期',
          exportTitle: '到期',
          dataIndex: 'due_at',
          key: 'due_at',
          width: 140,
          render: (_, record) => getWorkflowTaskDueLabel(record),
          exportValue: getWorkflowTaskDueLabel,
        },
        {
          title: '原因 / 备注',
          exportTitle: '原因 / 备注',
          dataIndex: 'blocked_reason',
          key: 'reason',
          width: 260,
          ellipsis: true,
          render: (_, record) =>
            getWorkflowTaskReason(record) || '按 Workflow 任务上下文处理',
          exportValue: (record) => getWorkflowTaskReason(record),
        },
      ]),
    []
  )
  const { tableColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey,
      moduleTitle: moduleItem?.title || '模块未登记',
      columns,
    })

  if (!moduleItem || !config) {
    return (
      <BusinessPageLayout>
        <PageHeaderCard
          title="模块未登记"
          description="当前路由没有匹配的 Workflow V1 页面定义。"
          tags={<Tag color="red">未登记</Tag>}
        />
      </BusinessPageLayout>
    )
  }

  return (
    <BusinessPageLayout className="erp-workflow-business-page">
      <PageHeaderCard
        title={moduleItem.title}
        description={moduleItem.description}
        tags={
          <Space size={6} wrap>
            <Tag color="blue">Workflow V1</Tag>
            <Tag color="gold">不写事实层</Tag>
          </Space>
        }
        stats={stats}
        summary={
          <Space size={6} wrap>
            <Tag color="default">主路径 workflow_tasks</Tag>
            <Tag color="green">只处理协同任务</Tag>
            <span>{moduleItem.boundary}</span>
          </Space>
        }
        compact
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              aria-label="搜索协同任务"
              placeholder="搜索任务、来源号、原因"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <SelectFilter
              aria-label="任务状态"
              value={status}
              options={TASK_STATUS_OPTIONS}
              onChange={setStatus}
            />
            <SelectFilter
              aria-label="责任角色"
              value={ownerRoleKey}
              options={[
                { label: '全部角色', value: '' },
                ...config.ownerRoleOptions,
              ]}
              onChange={setOwnerRoleKey}
            />
          </>
        }
        actions={
          <>
            <BusinessListToolbarActions
              moduleTitle={moduleItem.title}
              exportDisabled
              exportDisabledReason="当前 Workflow V1 只处理协同任务，不导出业务数据。"
              onOpenColumnOrder={openColumnOrder}
            />
            <ToolbarButton
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={loadWorkflowTasks}
            >
              刷新协同
            </ToolbarButton>
          </>
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreateWorkflowTasks}
            onClick={openCreateModal}
          >
            {config.createLabel}
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedTask ? 1 : 0}
          selectedLabel={selectedTaskLabel}
          selectedItems={selectedTaskItems}
          collaborationItems={
            selectedTaskStatusMeta
              ? [
                  {
                    key: 'status',
                    label: '状态',
                    value: selectedTaskStatusMeta.label,
                    color: selectedTaskStatusMeta.color,
                  },
                  {
                    key: 'owner',
                    label: '责任',
                    value:
                      WORKFLOW_ROLE_LABELS.get(
                        getTaskOwnerRoleKey(selectedTask)
                      ) ||
                      getTaskOwnerRoleKey(selectedTask) ||
                      '-',
                  },
                ]
              : []
          }
          boundaryText={
            selectedTaskReadonlyReason ||
            '当前操作只调用 Workflow 后端 usecase；不写生产、库存、出货、财务、开票或收付款事实。'
          }
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedTask}
            onClick={() => setSelectedTaskKeys([])}
          >
            清空已选
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={taskActionLoadingID === selectedTask?.id}
            disabled={!canCompleteSelected || taskActionLoadingID > 0}
            onClick={() => completeWorkflowTask(selectedTask)}
          >
            完成协同
          </Button>
          <Button
            size="small"
            danger
            icon={<ExclamationCircleOutlined />}
            disabled={!canBlockSelected || taskActionLoadingID > 0}
            onClick={() => openTaskReasonModal('block')}
          >
            标记阻塞
          </Button>
          <Button
            size="small"
            icon={<SendOutlined />}
            loading={urgingTaskID === selectedTask?.id}
            disabled={!canUrgeSelected || urgingTaskID > 0}
            onClick={() => openTaskReasonModal('urge')}
          >
            催办
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={tableColumns}
        dataSource={filteredTasks}
        scroll={{ x: 1000 }}
        emptyDescription={
          canReadWorkflowTasks
            ? config.emptyText
            : '当前账号没有 Workflow 任务读取权限。'
        }
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedTaskKeys,
          onChange: (nextKeys) => setSelectedTaskKeys(nextKeys.slice(-1)),
        }}
        rowClassName={(record) =>
          selectedTaskKeys.includes(record.id) ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedTaskKeys([record.id]),
        })}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
      {columnOrderModal}

      <CollaborationTaskPanel
        tasks={tasks}
        selectedTasks={selectedTasks}
        selectedRecordLabel={
          selectedTasks[0]?.task_name ||
          `请先选择一条${moduleItem.shortLabel}协同`
        }
        adminProfile={adminProfile}
        roleLabelMap={WORKFLOW_ROLE_LABELS}
        onCompleteTask={
          canCompleteWorkflowTasks ? completeWorkflowTask : undefined
        }
        onBlockTask={canUpdateWorkflowTasks ? blockWorkflowTask : undefined}
        onUrgeTask={
          canUpdateWorkflowTasks ? urgeWorkflowTaskFromPage : undefined
        }
        taskActionLoadingID={taskActionLoadingID}
        urgingTaskID={urgingTaskID}
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        width={620}
        title={businessActionModalTitle(
          config.createTitle,
          '登记结果只进入 Workflow 协同任务；不会生成生产、库存、出货或财务事实。'
        )}
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        maskClosable={false}
        destroyOnHidden
        footer={
          <Space wrap>
            <Button onClick={() => setCreateModalOpen(false)}>取消</Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={creating}
              disabled={!canCreateWorkflowTasks}
              onClick={handleCreateTask}
            >
              创建协同任务
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          className="erp-business-action-form"
        >
          <Form.Item
            className="erp-business-action-form__field erp-business-action-form__field--full"
            label="任务名称"
            name="task_name"
            rules={[{ required: true, message: '请填写任务名称' }]}
          >
            <Input placeholder="例如：核对某订单排程 / 处理延期异常 / 放行前复核" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="关联来源"
            name="source_id"
            rules={[
              { required: true, message: '请填写关联来源' },
              {
                validator: (_, value) =>
                  Number(value) > 0
                    ? Promise.resolve()
                    : Promise.reject(new Error('关联来源必须为正整数')),
              },
            ]}
          >
            <Input
              inputMode="numeric"
              placeholder="填写关联来源记录；有业务单号时优先补来源号"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="来源号"
            name="source_no"
          >
            <Input placeholder="可选，例如销售订单号或出货单号" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="责任角色"
            name="owner_role_key"
            rules={[{ required: true, message: '请选择责任角色' }]}
          >
            <Select options={config.ownerRoleOptions} />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="到期日期"
            name="due_at"
          >
            <DateInput placeholder="选择到期日期" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field erp-business-action-form__field--full"
            label="处理说明"
            name="note"
          >
            <Input.TextArea
              rows={3}
              placeholder="只记录协同上下文；不会生成生产、库存、出货、财务事实。"
            />
          </Form.Item>
        </Form>
        <Tag icon={<CheckCircleOutlined />} color="blue">
          创建结果只进入 Workflow 协同任务，不写库存、出货、财务或生产事实。
        </Tag>
      </Modal>

      <Modal
        className="erp-business-action-modal"
        width={520}
        title={businessActionModalTitle(
          taskReasonModal?.mode === 'block' ? '标记阻塞' : '催办协同',
          selectedTaskLabel
        )}
        open={Boolean(taskReasonModal)}
        onCancel={closeTaskReasonModal}
        onOk={submitTaskReasonAction}
        okText={taskReasonModal?.mode === 'block' ? '确认阻塞' : '确认催办'}
        confirmLoading={taskActionLoadingID > 0 || urgingTaskID > 0}
        destroyOnHidden
      >
        <Input.TextArea
          rows={4}
          maxLength={240}
          showCount
          autoFocus
          placeholder={
            taskReasonModal?.mode === 'block'
              ? '填写阻塞原因；只更新 Workflow 任务状态。'
              : '填写催办原因；只记录协同事件。'
          }
          value={taskReasonModal?.reason || ''}
          onChange={(event) =>
            setTaskReasonModal((current) =>
              current ? { ...current, reason: event.target.value } : current
            )
          }
        />
      </Modal>
    </BusinessPageLayout>
  )
}
