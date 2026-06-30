import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, Input, Modal, Space, Tag } from 'antd'
import dayjs from 'dayjs'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  listWorkflowTasks,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessAttachmentModalButton from '../components/business-list/BusinessAttachmentModalButton.jsx'
import { getBusinessModule } from '../config/businessModules.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'
import { ROLE_DISPLAY_NAMES } from '../utils/roleKeys.mjs'
import useWorkflowTaskActionAccess from '../hooks/useWorkflowTaskActionAccess.js'
import {
  getTaskOwnerRoleKey,
  getWorkflowTaskDueLabel,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
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
const DUE_DATE_FILTER_OPTIONS = Object.freeze([
  { label: '到期日期', value: 'due_at' },
])

const MODULE_WORKFLOW_CONFIG = Object.freeze({
  'production-scheduling': {
    taskGroup: 'production_scheduling',
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

function toUnixStartSeconds(value) {
  if (!value) return undefined
  const parsed = dayjs(String(value).trim())
  return parsed.isValid() ? parsed.startOf('day').unix() : undefined
}

function getTaskID(task = {}) {
  return Number(task.id || 0)
}

function formatTaskSource(task = {}) {
  if (task.source_no) return task.source_no
  if (task.source_id) return '已关联业务记录'
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
  const [taskReasonModal, setTaskReasonModal] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [ownerRoleKey, setOwnerRoleKey] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [selectedTaskKeys, setSelectedTaskKeys] = useState([])
  const [taskActionLoadingID, setTaskActionLoadingID] = useState(0)
  const [urgingTaskID, setUrgingTaskID] = useState(0)
  const canReadWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.read'
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
    const dueFromUnix = toUnixStartSeconds(dueFrom)
    const dueToUnix = toUnixSeconds(dueTo)
    return tasks.filter((task) => {
      if (status && task.task_status_key !== status) return false
      if (ownerRoleKey && getTaskOwnerRoleKey(task) !== ownerRoleKey) {
        return false
      }
      const dueAt = Number(task.due_at || 0)
      if (dueFromUnix && (!dueAt || dueAt < dueFromUnix)) return false
      if (dueToUnix && (!dueAt || dueAt > dueToUnix)) return false
      if (!normalizedKeyword) return true
      return [
        task.task_code,
        task.task_name,
        task.source_no,
        task.business_status_key,
        getWorkflowTaskReason(task),
      ].some((item) => normalizeText(item).includes(normalizedKeyword))
    })
  }, [dueFrom, dueTo, keyword, ownerRoleKey, status, tasks])

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
  const selectedTaskActionAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask && canReadWorkflowTasks),
  })
  const selectedTaskReadonlyReason = selectedTaskActionAccess.loading
    ? '正在向后端核对当前任务动作权限。'
    : selectedTaskActionAccess.readonlyReason
  const canCompleteSelected =
    Boolean(selectedTask) && selectedTaskActionAccess.canRun('complete')
  const canBlockSelected =
    Boolean(selectedTask) && selectedTaskActionAccess.canRun('block')
  const canUrgeSelected =
    Boolean(selectedTask) && selectedTaskActionAccess.canRun('urge')

  const completeWorkflowTask = useCallback(
    async (task) => {
      setTaskActionLoadingID(getTaskID(task))
      try {
        await completeWorkflowTaskAction({
          id: task.id,
          action_key: 'complete',
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
        await blockWorkflowTaskAction({
          id: task.id,
          action_key: 'block',
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
          width: 340,
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
  const hasActiveFilters = Boolean(
    keyword.trim() || status || ownerRoleKey || dueFrom || dueTo
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatus('')
    setOwnerRoleKey('')
    setDueFrom('')
    setDueTo('')
  }, [])

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
        compact
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              aria-label="搜索协同任务"
              placeholder="搜索任务"
              searchHint="可搜索：任务、来源号、原因"
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
            <DateRangeFilter
              options={DUE_DATE_FILTER_OPTIONS}
              value="due_at"
              startValue={dueFrom}
              endValue={dueTo}
              onStartChange={setDueFrom}
              onEndChange={setDueTo}
            />
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle={moduleItem.title}
            exportDisabled
            exportDisabledReason="当前 Workflow V1 只处理协同任务，不导出业务数据。"
            onOpenColumnOrder={openColumnOrder}
          />
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
            disabled={
              selectedTaskActionAccess.loading ||
              !canCompleteSelected ||
              taskActionLoadingID > 0
            }
            onClick={() => completeWorkflowTask(selectedTask)}
          >
            完成协同
          </Button>
          <Button
            size="small"
            danger
            icon={<ExclamationCircleOutlined />}
            disabled={
              selectedTaskActionAccess.loading ||
              !canBlockSelected ||
              taskActionLoadingID > 0
            }
            onClick={() => openTaskReasonModal('block')}
          >
            标记阻塞
          </Button>
          <Button
            size="small"
            icon={<SendOutlined />}
            loading={urgingTaskID === selectedTask?.id}
            disabled={
              selectedTaskActionAccess.loading ||
              !canUrgeSelected ||
              urgingTaskID > 0
            }
            onClick={() => openTaskReasonModal('urge')}
          >
            催办
          </Button>
          <BusinessAttachmentModalButton
            ownerType="workflow_task"
            ownerId={selectedTask?.id}
            modalTitle="协同任务附件"
            panelTitle="协同任务附件"
            description="上传现场照片、异常截图或任务处理证据；附件不代表任务已完成，也不写业务事实。"
            canUpload={canUpdateWorkflowTasks || canCompleteWorkflowTasks}
            canDelete={canUpdateWorkflowTasks}
            disabled={!selectedTask}
            disabledReason="请先选择一条协同任务"
          />
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
