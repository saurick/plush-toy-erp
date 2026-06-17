import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Row,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import {
  formatWorkflowTaskSource,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import {
  buildWorkflowDashboardStats,
  getWorkflowTaskDueStatus,
  isTerminalWorkflowTask,
} from '../utils/workflowDashboardStats.mjs'
import {
  TASK_BOARD_ROLE_OPTIONS,
  TASK_BOARD_DUE_OPTIONS,
  TASK_BOARD_STATUS_OPTIONS,
  buildWorkflowTaskBoardLanes,
  filterWorkflowTaskBoardTasks,
  getTaskOwnerRoleKey,
  getTaskStatusKey,
  getWorkflowTaskDueLabel,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
  hasActiveWorkflowTaskBoardFilters,
  readWorkflowTaskBoardFiltersFromSearch,
  writeWorkflowTaskBoardFiltersToSearch,
} from '../utils/workflowTaskBoard.mjs'

const { Paragraph, Text, Title } = Typography
const { TextArea } = Input

const EXCEPTION_FLOW_STEPS = Object.freeze([
  {
    key: 'blocked',
    title: '阻塞记录',
    description: '必须填写原因和影响范围。',
  },
  {
    key: 'assign',
    title: '责任分派',
    description: '按 owner_role_key 或具体负责人接收。',
  },
  {
    key: 'follow',
    title: '处理跟进',
    description: '催办、补充说明或转派。',
  },
  {
    key: 'verify',
    title: '验证恢复',
    description: '确认协同任务可以继续推进。',
  },
  {
    key: 'close',
    title: '关闭归档',
    description: '只关闭协同异常，不写事实层。',
  },
])

const TASK_ACTION_META = Object.freeze({
  complete: {
    title: '处理完成',
    buttonLabel: '确认完成',
    successMessage: '任务已处理完成',
    requireReason: false,
  },
  block: {
    title: '标记阻塞',
    buttonLabel: '提交阻塞',
    successMessage: '阻塞原因已记录',
    requireReason: true,
  },
  urge: {
    title: '催办',
    buttonLabel: '提交催办',
    successMessage: '催办已记录',
    requireReason: true,
  },
})

const WORKBENCH_QUEUE_OPTIONS = Object.freeze([
  { key: 'actionable', label: '待我处理' },
  { key: 'risk', label: '阻塞/逾期' },
  { key: 'waiting', label: '等待交接' },
])

const TASK_DRAWER_STEPS = Object.freeze([
  {
    key: 'context',
    title: '核对上下文',
    description: '确认任务、来源、责任角色和到期状态。',
  },
  {
    key: 'action',
    title: '选择动作',
    description: '完成、阻塞或催办，只写 Workflow 任务事件。',
  },
  {
    key: 'submit',
    title: '提交回队列',
    description: '刷新任务列表，不自动写入事实层。',
  },
])

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

function formatTaskCode(task = {}) {
  return task.task_code || `TASK-${task.id || '-'}`
}

function buildSourceOptions(tasks = []) {
  const sourceTypes = [
    ...new Set(
      (tasks || [])
        .map((task) => String(task.source_type || '').trim())
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right))

  return [
    { value: 'all', label: '全部模块' },
    ...sourceTypes.map((sourceType) => ({
      value: sourceType,
      label: sourceType,
    })),
  ]
}

function getTaskActionTone(actionMode = '') {
  if (actionMode === 'complete') return 'success'
  if (actionMode === 'block') return 'danger'
  if (actionMode === 'urge') return 'warning'
  return 'neutral'
}

function getTaskActionDescription(actionMode = '') {
  if (actionMode === 'complete') {
    return '确认后只关闭当前 Workflow 协同任务；库存、出货、财务、开票或付款仍需进入对应业务模块处理。'
  }
  if (actionMode === 'block') {
    return '请写清卡点原因、影响范围和下一责任人，后续角色才能接续处理。'
  }
  if (actionMode === 'urge') {
    return '请写清催办对象和需要补齐的事项，避免只留下无上下文提醒。'
  }
  return '先选择一个处理动作。打开关联记录只负责跳转上下文，不保存业务事实。'
}

function TaskLane({ lane, onOpenTask, onOpenAction, onOpenEntry }) {
  return (
    <Card
      size="small"
      variant="borderless"
      className="erp-task-board-lane"
      title={
        <Space>
          <Tag color={lane.count > 0 ? lane.tagColor : 'default'}>
            {lane.count}
          </Tag>
          <span>{lane.title}</span>
        </Space>
      }
    >
      <Paragraph type="secondary" className="erp-task-board-lane-note">
        {lane.description}
      </Paragraph>
      <Space direction="vertical" size={8} className="erp-task-board-list">
        {lane.tasks.length > 0 ? (
          lane.tasks.map((task) => {
            const statusMeta = getWorkflowTaskStatusMeta(task)
            return (
              <div
                className="erp-task-board-card"
                key={`${lane.key}-${task.id}`}
              >
                <Space
                  className="erp-task-board-card-head"
                  align="start"
                  size={8}
                >
                  <Button
                    type="link"
                    className="erp-dashboard-link-button erp-task-board-card-title"
                    disabled={!resolveWorkflowTaskEntryPath(task)}
                    onClick={() => onOpenEntry(task)}
                  >
                    {task.task_name || '未命名任务'}
                  </Button>
                  <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                </Space>
                <Text type="secondary" className="erp-task-board-card-meta">
                  {formatWorkflowTaskSource(task)} /{' '}
                  {getWorkflowTaskDueLabel(task)}
                </Text>
                {getWorkflowTaskReason(task) ? (
                  <Text type="danger" className="erp-task-board-card-meta">
                    阻塞原因：{getWorkflowTaskReason(task)}
                  </Text>
                ) : null}
                <Space wrap>
                  <Button size="small" onClick={() => onOpenTask(task)}>
                    查看
                  </Button>
                  {!isTerminalWorkflowTask(task) ? (
                    <>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => onOpenAction(task, 'complete')}
                      >
                        完成
                      </Button>
                      <Button
                        size="small"
                        danger
                        onClick={() => onOpenAction(task, 'block')}
                      >
                        阻塞
                      </Button>
                    </>
                  ) : null}
                </Space>
              </div>
            )
          })
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />
        )}
      </Space>
    </Card>
  )
}

function TaskMetricAction({
  label,
  value,
  actionLabel,
  active = false,
  danger = false,
  disabled = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={[
        'erp-task-center-metric',
        danger ? 'erp-task-center-metric--danger' : '',
        active ? 'erp-task-center-metric--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="erp-task-center-metric__head">
        <span>{label}</span>
        <ArrowRightOutlined
          aria-hidden="true"
          className="erp-task-center-metric__icon"
        />
      </span>
      <strong>{value}</strong>
      <small>{actionLabel}</small>
    </button>
  )
}

export default function DashboardPage({ initialView = 'workbench' }) {
  const [loading, setLoading] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [actionMode, setActionMode] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [activeView, setActiveView] = useState(initialView)
  const [workbenchQueueKey, setWorkbenchQueueKey] = useState('actionable')
  const [selectedWorkbenchTaskId, setSelectedWorkbenchTaskId] = useState('')
  const [exceptionStepKey, setExceptionStepKey] = useState(
    EXCEPTION_FLOW_STEPS[0].key
  )
  const mountedRef = useRef(false)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const outletContext = useOutletContext()

  const loadDashboardStats = useCallback(async () => {
    setLoading(true)
    try {
      const workflowResult = await listWorkflowTasks({ limit: 200 })
      if (mountedRef.current) {
        setWorkflowTasks(workflowResult?.tasks || [])
      }
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载工作台'))
      return false
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    loadDashboardStats()
    return () => {
      mountedRef.current = false
    }
  }, [loadDashboardStats])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadDashboardStats)
  }, [loadDashboardStats, outletContext])

  useEffect(() => {
    setActiveView(initialView)
  }, [initialView])

  const workflowStats = useMemo(
    () => buildWorkflowDashboardStats(workflowTasks),
    [workflowTasks]
  )
  const filters = useMemo(
    () => readWorkflowTaskBoardFiltersFromSearch(searchParams),
    [searchParams]
  )
  const filteredTasks = useMemo(
    () => filterWorkflowTaskBoardTasks(workflowTasks, filters),
    [filters, workflowTasks]
  )
  const hasActiveFilters = useMemo(
    () => hasActiveWorkflowTaskBoardFilters(filters),
    [filters]
  )
  const taskLanes = useMemo(
    () => buildWorkflowTaskBoardLanes(filteredTasks),
    [filteredTasks]
  )
  const sourceOptions = useMemo(
    () => buildSourceOptions(workflowTasks),
    [workflowTasks]
  )
  const actionMeta = actionMode ? TASK_ACTION_META[actionMode] : null
  const selectedTaskStatusMeta = selectedTask
    ? getWorkflowTaskStatusMeta(selectedTask)
    : null
  const selectedTaskIsTerminal = selectedTask
    ? isTerminalWorkflowTask(selectedTask)
    : false
  const selectedTaskEntryPath = selectedTask
    ? resolveWorkflowTaskEntryPath(selectedTask)
    : ''
  const selectedTaskReason = selectedTask
    ? getWorkflowTaskReason(selectedTask)
    : ''
  const selectedTaskActionTone = getTaskActionTone(actionMode)
  const activeExceptionStep =
    EXCEPTION_FLOW_STEPS.find((step) => step.key === exceptionStepKey) ||
    EXCEPTION_FLOW_STEPS[0]
  const todayFocusTasks = useMemo(
    () =>
      workflowTasks
        .filter((task) => !isTerminalWorkflowTask(task))
        .slice()
        .sort((left, right) => {
          const leftDue = Number(left.due_at || Number.MAX_SAFE_INTEGER)
          const rightDue = Number(right.due_at || Number.MAX_SAFE_INTEGER)
          return leftDue - rightDue
        })
        .slice(0, 5),
    [workflowTasks]
  )
  const exceptionTasks = useMemo(
    () =>
      workflowTasks
        .filter((task) => {
          const statusKey = getTaskStatusKey(task)
          return (
            ['blocked', 'rejected'].includes(statusKey) ||
            Boolean(getWorkflowTaskReason(task))
          )
        })
        .slice(0, 8),
    [workflowTasks]
  )
  const dueTasks = useMemo(
    () =>
      workflowTasks
        .filter((task) =>
          ['overdue', 'due_soon'].includes(getWorkflowTaskDueStatus(task))
        )
        .slice(0, 8),
    [workflowTasks]
  )
  const taskCenterAssignedCount = useMemo(
    () =>
      workflowTasks.filter((task) =>
        ['pending', 'ready', 'processing'].includes(getTaskStatusKey(task))
      ).length,
    [workflowTasks]
  )
  const taskCenterBlockedCount = useMemo(
    () =>
      workflowTasks.filter((task) => {
        const statusKey = getTaskStatusKey(task)
        return (
          ['blocked', 'rejected'].includes(statusKey) ||
          Boolean(getWorkflowTaskReason(task))
        )
      }).length,
    [workflowTasks]
  )
  const taskCenterOverdueCount = useMemo(
    () =>
      workflowTasks.filter(
        (task) =>
          !isTerminalWorkflowTask(task) &&
          getWorkflowTaskDueStatus(task) === 'overdue'
      ).length,
    [workflowTasks]
  )
  const taskCenterCurrentTask = useMemo(
    () =>
      filteredTasks.find((task) => !isTerminalWorkflowTask(task)) ||
      filteredTasks[0] ||
      null,
    [filteredTasks]
  )
  const taskCenterCurrentStatusMeta = taskCenterCurrentTask
    ? getWorkflowTaskStatusMeta(taskCenterCurrentTask)
    : null
  const taskCenterCurrentEntryPath = taskCenterCurrentTask
    ? resolveWorkflowTaskEntryPath(taskCenterCurrentTask)
    : ''
  const currentFocusTask = todayFocusTasks[0] || exceptionTasks[0] || null
  const workbenchQueueGroups = useMemo(() => {
    const groups = {
      actionable: [],
      risk: [],
      waiting: [],
      closed: [],
    }
    workflowTasks.forEach((task) => {
      const statusKey = getTaskStatusKey(task)
      const dueStatus = getWorkflowTaskDueStatus(task)
      const hasReason = Boolean(getWorkflowTaskReason(task))
      if (isTerminalWorkflowTask(task)) {
        groups.closed.push(task)
        return
      }
      if (
        ['blocked', 'rejected'].includes(statusKey) ||
        dueStatus === 'overdue' ||
        hasReason
      ) {
        groups.risk.push(task)
        return
      }
      if (['pending', 'ready', 'processing'].includes(statusKey)) {
        groups.actionable.push(task)
        return
      }
      groups.waiting.push(task)
    })

    Object.values(groups).forEach((items) => {
      items.sort((left, right) => {
        const leftDue = Number(left.due_at || Number.MAX_SAFE_INTEGER)
        const rightDue = Number(right.due_at || Number.MAX_SAFE_INTEGER)
        if (leftDue !== rightDue) return leftDue - rightDue
        return String(left.task_name || '').localeCompare(
          String(right.task_name || '')
        )
      })
    })
    return groups
  }, [workflowTasks])
  const workbenchQueueTasks =
    workbenchQueueGroups[workbenchQueueKey] || workbenchQueueGroups.actionable
  const selectedWorkbenchTask = useMemo(() => {
    if (workbenchQueueTasks.length === 0) {
      return currentFocusTask
    }
    return (
      workbenchQueueTasks.find(
        (task) => String(task.id || task.task_code) === selectedWorkbenchTaskId
      ) || workbenchQueueTasks[0]
    )
  }, [currentFocusTask, selectedWorkbenchTaskId, workbenchQueueTasks])
  const selectedWorkbenchStatusMeta = selectedWorkbenchTask
    ? getWorkflowTaskStatusMeta(selectedWorkbenchTask)
    : null
  const selectedWorkbenchEntryPath = selectedWorkbenchTask
    ? resolveWorkflowTaskEntryPath(selectedWorkbenchTask)
    : ''

  const updateFilter = (key, value) => {
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        [key]: value,
      }),
      { replace: true }
    )
  }

  const clearFilters = () => {
    setSearchParams(writeWorkflowTaskBoardFiltersToSearch(searchParams), {
      replace: true,
    })
  }

  const openTaskEntry = (task) => {
    const entryPath = resolveWorkflowTaskEntryPath(task)
    if (entryPath) {
      navigate(entryPath)
    }
  }

  const openTaskDrawer = (task, mode = '') => {
    setSelectedTask(task)
    setActionMode(mode)
    setActionReason(mode === 'block' ? getWorkflowTaskReason(task) : '')
  }

  const closeTaskDrawer = () => {
    setSelectedTask(null)
    setActionMode('')
    setActionReason('')
  }

  const submitTaskAction = async () => {
    if (!selectedTask || !actionMode || !actionMeta) return

    if (isTerminalWorkflowTask(selectedTask)) {
      message.warning('已结束任务不能继续处理')
      return
    }

    const reason = actionReason.trim()
    if (actionMeta.requireReason && !reason) {
      message.warning(`${actionMeta.title}需要填写原因`)
      return
    }

    setActionSaving(true)
    try {
      if (actionMode === 'urge') {
        await urgeWorkflowTask({
          task_id: selectedTask.id,
          action: 'urge_task',
          reason,
          actor_role_key: 'admin',
          payload: {
            source_type: selectedTask.source_type,
            source_id: selectedTask.source_id,
            source_no: selectedTask.source_no,
            entry: 'desktop_task_board',
          },
        })
      } else {
        const nextStatusKey = actionMode === 'block' ? 'blocked' : 'done'
        await updateWorkflowTaskStatus({
          id: selectedTask.id,
          task_status_key: nextStatusKey,
          business_status_key:
            actionMode === 'block'
              ? 'blocked'
              : selectedTask.business_status_key || undefined,
          reason,
          payload: {
            ...payloadOf(selectedTask),
            desktop_task_board_action: actionMode,
            blocked_reason: actionMode === 'block' ? reason : undefined,
          },
        })
      }
      message.success(actionMeta.successMessage)
      closeTaskDrawer()
      await loadDashboardStats()
    } catch (error) {
      message.error(getActionErrorMessage(error, `${actionMeta.title}失败`))
    } finally {
      setActionSaving(false)
    }
  }

  const workbenchTaskColumns = [
    {
      title: '优先级',
      dataIndex: 'task_status_key',
      width: 88,
      render: (_, record) => {
        const dueStatus = getWorkflowTaskDueStatus(record)
        const statusMeta = getWorkflowTaskStatusMeta(record)
        const color =
          dueStatus === 'overdue'
            ? 'red'
            : dueStatus === 'due_soon'
              ? 'orange'
              : statusMeta.color
        return (
          <Tag color={color}>
            {dueStatus === 'overdue' ? '逾期' : statusMeta.label}
          </Tag>
        )
      },
    },
    {
      title: '任务 / 业务对象',
      dataIndex: 'task_name',
      render: (value, record) => (
        <div className="erp-workbench-task-cell">
          <Text strong>{value || '未命名任务'}</Text>
          <Text type="secondary">{formatWorkflowTaskSource(record)}</Text>
        </div>
      ),
    },
    {
      title: '负责',
      dataIndex: 'owner_role_key',
      width: 90,
      render: (_, record) => getTaskOwnerRoleKey(record) || '-',
    },
    {
      title: '到期 / SLA',
      dataIndex: 'due_at',
      width: 132,
      render: (_, record) => {
        const dueStatus = getWorkflowTaskDueStatus(record)
        return (
          <Tag
            color={
              dueStatus === 'overdue'
                ? 'red'
                : dueStatus === 'due_soon'
                  ? 'orange'
                  : 'green'
            }
          >
            {getWorkflowTaskDueLabel(record)}
          </Tag>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 112,
      render: (_, record) => (
        <Button
          size="small"
          type="primary"
          disabled={isTerminalWorkflowTask(record)}
          onClick={(event) => {
            event.stopPropagation()
            openTaskDrawer(record, 'complete')
          }}
        >
          处理
        </Button>
      ),
    },
  ]

  return (
    <Space
      direction="vertical"
      size={16}
      className="erp-dashboard-page erp-command-center-page"
    >
      {activeView === 'workbench' ? (
        <Card
          className="erp-dashboard-card erp-workbench-command-card"
          variant="borderless"
          loading={loading}
        >
          <div className="erp-workbench-command">
            <div className="erp-workbench-command-head">
              <div>
                <Title level={3} className="erp-command-center-hero-title">
                  工作台
                </Title>
                <Paragraph className="erp-dashboard-summary">
                  登录后先看今天该处理什么，再进入关联业务对象。
                </Paragraph>
              </div>
            </div>

            <div
              className="erp-workbench-kpi-strip"
              aria-label="工作台关键指标"
            >
              <div className="erp-workbench-kpi">
                <span>待处理</span>
                <strong>
                  {workflowStats.pending + workflowStats.processing}
                </strong>
                <small>当前可推进</small>
              </div>
              <div className="erp-workbench-kpi erp-workbench-kpi--danger">
                <span>阻塞/逾期</span>
                <strong>{workflowStats.blocked + workflowStats.overdue}</strong>
                <small>需交接说明</small>
              </div>
              <div className="erp-workbench-kpi">
                <span>等待交接</span>
                <strong>{workbenchQueueGroups.waiting.length}</strong>
                <small>非终态任务</small>
              </div>
            </div>

            <div className="erp-workbench-main-grid">
              <section
                className="erp-workbench-panel erp-workbench-queue-panel"
                aria-label="优先处理队列"
              >
                <div className="erp-workbench-panel-head">
                  <div>
                    <Title level={5}>优先处理队列</Title>
                    <Text type="secondary">
                      先处理待办和卡点；点击行查看右侧上下文。
                    </Text>
                  </div>
                  <Segmented
                    size="small"
                    value={workbenchQueueKey}
                    onChange={setWorkbenchQueueKey}
                    options={WORKBENCH_QUEUE_OPTIONS.map((option) => ({
                      value: option.key,
                      label: `${option.label} ${
                        workbenchQueueGroups[option.key]?.length || 0
                      }`,
                    }))}
                  />
                </div>
                <Table
                  size="small"
                  rowKey={(record) => record.id || record.task_code}
                  columns={workbenchTaskColumns}
                  dataSource={workbenchQueueTasks}
                  pagination={false}
                  scroll={{ x: 760 }}
                  rowClassName={(record) =>
                    String(record.id || record.task_code) ===
                    String(
                      selectedWorkbenchTask?.id ||
                        selectedWorkbenchTask?.task_code ||
                        ''
                    )
                      ? 'erp-workbench-task-row--active'
                      : ''
                  }
                  onRow={(record) => ({
                    onClick: () =>
                      setSelectedWorkbenchTaskId(
                        String(record.id || record.task_code || '')
                      ),
                  })}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="当前队列暂无任务"
                      />
                    ),
                  }}
                />
              </section>

              <aside className="erp-workbench-side-stack">
                <section
                  className="erp-workbench-panel erp-workbench-task-detail"
                  aria-label="任务详情"
                >
                  <div className="erp-workbench-panel-head">
                    <div>
                      <Title level={5}>任务详情</Title>
                      <Text type="secondary">当前处理上下文</Text>
                    </div>
                    {selectedWorkbenchStatusMeta ? (
                      <Tag color={selectedWorkbenchStatusMeta.color}>
                        {selectedWorkbenchStatusMeta.label}
                      </Tag>
                    ) : (
                      <Tag>暂无任务</Tag>
                    )}
                  </div>
                  {selectedWorkbenchTask ? (
                    <Space
                      direction="vertical"
                      size={10}
                      className="erp-dashboard-block erp-workbench-detail-body"
                    >
                      <Title level={4} className="erp-workbench-detail-title">
                        {selectedWorkbenchTask.task_name || '未命名任务'}
                      </Title>
                      <Descriptions size="small" column={1}>
                        <Descriptions.Item label="来源">
                          {formatWorkflowTaskSource(selectedWorkbenchTask)}
                        </Descriptions.Item>
                        <Descriptions.Item label="负责角色">
                          {getTaskOwnerRoleKey(selectedWorkbenchTask) || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="到期">
                          {getWorkflowTaskDueLabel(selectedWorkbenchTask)}
                        </Descriptions.Item>
                        <Descriptions.Item label="阻塞/备注">
                          {getWorkflowTaskReason(selectedWorkbenchTask) || '-'}
                        </Descriptions.Item>
                      </Descriptions>
                      <Space wrap className="erp-workbench-detail-actions">
                        <Button
                          type="primary"
                          disabled={isTerminalWorkflowTask(
                            selectedWorkbenchTask
                          )}
                          onClick={() =>
                            openTaskDrawer(selectedWorkbenchTask, 'complete')
                          }
                        >
                          处理任务
                        </Button>
                        <Button
                          danger
                          disabled={isTerminalWorkflowTask(
                            selectedWorkbenchTask
                          )}
                          onClick={() =>
                            openTaskDrawer(selectedWorkbenchTask, 'block')
                          }
                        >
                          标记阻塞
                        </Button>
                        <Button
                          disabled={!selectedWorkbenchEntryPath}
                          onClick={() => openTaskEntry(selectedWorkbenchTask)}
                        >
                          关联记录
                        </Button>
                      </Space>
                    </Space>
                  ) : (
                    <div className="erp-workbench-detail-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="暂无可处理任务"
                      />
                    </div>
                  )}
                </section>
              </aside>
            </div>
          </div>
        </Card>
      ) : null}

      {activeView === 'task-board' ? (
        <Card
          className="erp-dashboard-card erp-dashboard-task-board-card"
          variant="borderless"
          loading={loading}
        >
          <Space direction="vertical" className="erp-dashboard-block" size={14}>
            <div className="erp-task-center-overview">
              <section className="erp-task-center-summary">
                <div>
                  <Title level={3} className="erp-command-center-hero-title">
                    任务看板
                  </Title>
                  <Paragraph className="erp-dashboard-summary">
                    看清谁该处理、哪里卡住、哪些已经超时。
                  </Paragraph>
                </div>
                <div
                  className="erp-task-center-metrics"
                  aria-label="任务看板关键筛选"
                >
                  <TaskMetricAction
                    label="待我处理"
                    value={taskCenterAssignedCount}
                    actionLabel="查看可推进任务"
                    active={filters.status === 'pending'}
                    onClick={() => updateFilter('status', 'pending')}
                  />
                  <TaskMetricAction
                    label="阻塞交接"
                    value={taskCenterBlockedCount}
                    actionLabel="查看需说明任务"
                    active={filters.status === 'blocked'}
                    danger
                    onClick={() => updateFilter('status', 'blocked')}
                  />
                  <TaskMetricAction
                    label="逾期任务"
                    value={taskCenterOverdueCount}
                    actionLabel="查看超时任务"
                    active={filters.due === 'overdue'}
                    danger={taskCenterOverdueCount > 0}
                    disabled={taskCenterOverdueCount <= 0}
                    onClick={() => updateFilter('due', 'overdue')}
                  />
                </div>
              </section>

              <section
                className="erp-task-center-current"
                aria-label="当前任务"
              >
                <div className="erp-task-center-current-head">
                  <Text type="secondary">当前任务</Text>
                  {taskCenterCurrentStatusMeta ? (
                    <Tag color={taskCenterCurrentStatusMeta.color}>
                      {taskCenterCurrentStatusMeta.label}
                    </Tag>
                  ) : (
                    <Tag>暂无任务</Tag>
                  )}
                </div>
                {taskCenterCurrentTask ? (
                  <>
                    <Title level={5} className="erp-task-center-current-title">
                      {taskCenterCurrentTask.task_name || '未命名任务'}
                    </Title>
                    <Text
                      type="secondary"
                      className="erp-task-center-current-meta"
                    >
                      {formatWorkflowTaskSource(taskCenterCurrentTask)} /{' '}
                      {getWorkflowTaskDueLabel(taskCenterCurrentTask)}
                    </Text>
                    {getWorkflowTaskReason(taskCenterCurrentTask) ? (
                      <Text
                        type="danger"
                        className="erp-task-center-current-meta"
                      >
                        {getWorkflowTaskReason(taskCenterCurrentTask)}
                      </Text>
                    ) : null}
                    <Space wrap className="erp-task-center-current-actions">
                      <Button
                        size="small"
                        type="primary"
                        disabled={isTerminalWorkflowTask(taskCenterCurrentTask)}
                        onClick={() =>
                          openTaskDrawer(taskCenterCurrentTask, 'complete')
                        }
                      >
                        处理完成
                      </Button>
                      <Button
                        size="small"
                        danger
                        disabled={isTerminalWorkflowTask(taskCenterCurrentTask)}
                        onClick={() =>
                          openTaskDrawer(taskCenterCurrentTask, 'block')
                        }
                      >
                        标记阻塞
                      </Button>
                      <Button
                        size="small"
                        disabled={!taskCenterCurrentEntryPath}
                        onClick={() => openTaskEntry(taskCenterCurrentTask)}
                      >
                        关联对象
                      </Button>
                    </Space>
                  </>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无任务"
                  />
                )}
              </section>
            </div>

            <div className="erp-task-board-filters">
              <Input.Search
                allowClear
                placeholder="搜索任务、单号、来源、阻塞原因"
                value={filters.keyword}
                onChange={(event) =>
                  updateFilter('keyword', event.target.value)
                }
              />
              <Select
                value={filters.status}
                options={TASK_BOARD_STATUS_OPTIONS}
                onChange={(value) => updateFilter('status', value)}
              />
              <Select
                value={filters.role}
                options={TASK_BOARD_ROLE_OPTIONS}
                onChange={(value) => updateFilter('role', value)}
              />
              <Select
                value={filters.due}
                options={TASK_BOARD_DUE_OPTIONS}
                onChange={(value) => updateFilter('due', value)}
              />
              <Select
                value={filters.sourceType}
                options={sourceOptions}
                onChange={(value) => updateFilter('sourceType', value)}
              />
              <Button disabled={!hasActiveFilters} onClick={clearFilters}>
                清空筛选
              </Button>
            </div>
            <div className="erp-task-board-lanes" aria-label="任务看板泳道">
              {taskLanes.map((lane) => (
                <TaskLane
                  key={lane.key}
                  lane={lane}
                  onOpenTask={openTaskDrawer}
                  onOpenAction={openTaskDrawer}
                  onOpenEntry={openTaskEntry}
                />
              ))}
            </div>
          </Space>
        </Card>
      ) : null}

      {activeView === 'exception-flow' ? (
        <>
          <Card
            className="erp-dashboard-card erp-command-center-exception-card"
            variant="borderless"
          >
            <Title level={3} className="erp-command-center-hero-title">
              异常 / 阻塞闭环
            </Title>
            <Paragraph type="secondary" className="erp-dashboard-summary">
              定义阻塞、责任分派、处理跟进、验证恢复和关闭归档的用户路径；所有状态更新仍通过
              Workflow 任务动作完成。
            </Paragraph>
            <div className="erp-exception-flow-steps">
              {EXCEPTION_FLOW_STEPS.map((step, index) => (
                <button
                  type="button"
                  key={step.key}
                  className={`erp-exception-flow-step${
                    step.key === exceptionStepKey
                      ? ' erp-exception-flow-step--active'
                      : ''
                  }`}
                  onClick={() => setExceptionStepKey(step.key)}
                >
                  <Text strong>
                    {index + 1}. {step.title}
                  </Text>
                  <Text type="secondary">{step.description}</Text>
                </button>
              ))}
            </div>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card
                className="erp-dashboard-card"
                variant="borderless"
                title={activeExceptionStep.title}
              >
                <Space
                  direction="vertical"
                  size={12}
                  className="erp-dashboard-block"
                >
                  <Alert
                    type="warning"
                    showIcon
                    message={activeExceptionStep.description}
                    description="这里处理的是协同异常，不代表库存、出货、应收、开票、付款或凭证事实已经完成。"
                  />
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="阻塞任务">
                      {exceptionTasks.length}
                    </Descriptions.Item>
                    <Descriptions.Item label="今日/超时任务">
                      {dueTasks.length}
                    </Descriptions.Item>
                    <Descriptions.Item label="建议动作">
                      选择一条任务后登记原因、催办、完成或进入关联记录核对。
                    </Descriptions.Item>
                  </Descriptions>
                </Space>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                className="erp-dashboard-card"
                variant="borderless"
                title="闭环队列"
              >
                <Space
                  direction="vertical"
                  size={10}
                  className="erp-dashboard-block"
                >
                  {exceptionTasks.length > 0 ? (
                    exceptionTasks.map((task) => {
                      const statusMeta = getWorkflowTaskStatusMeta(task)
                      return (
                        <div
                          className="erp-command-center-focus-item"
                          key={task.id || task.task_code}
                        >
                          <div className="erp-command-center-focus-copy">
                            <Text strong>{task.task_name || '未命名任务'}</Text>
                            <Text type="secondary">
                              {getWorkflowTaskReason(task) ||
                                formatWorkflowTaskSource(task)}
                            </Text>
                          </div>
                          <Space wrap>
                            <Tag color={statusMeta.color}>
                              {statusMeta.label}
                            </Tag>
                            <Button
                              size="small"
                              onClick={() => openTaskDrawer(task, 'block')}
                            >
                              处理闭环
                            </Button>
                          </Space>
                        </div>
                      )
                    })
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="暂无阻塞任务"
                    />
                  )}
                </Space>
              </Card>
            </Col>
          </Row>
        </>
      ) : null}

      <Drawer
        title={
          <div className="erp-task-action-drawer__title">
            <span>任务处理</span>
            <strong>{actionMeta?.title || '查看任务上下文'}</strong>
          </div>
        }
        width="min(640px, calc(100vw - 24px))"
        open={Boolean(selectedTask)}
        onClose={closeTaskDrawer}
        destroyOnHidden
        className="erp-task-action-drawer"
        extra={
          selectedTask ? (
            <Space size={8} wrap>
              <Tag>{formatTaskCode(selectedTask)}</Tag>
              <Tag color={selectedTaskStatusMeta?.color}>
                {selectedTaskStatusMeta?.label}
              </Tag>
            </Space>
          ) : null
        }
        footer={
          selectedTask ? (
            <div className="erp-task-action-drawer__footer">
              <Space
                wrap
                size={[8, 8]}
                className="erp-task-action-drawer__footer-actions"
              >
                {actionMeta ? (
                  <>
                    <Button
                      disabled={actionSaving}
                      onClick={() => {
                        setActionMode('')
                        setActionReason('')
                      }}
                    >
                      返回动作选择
                    </Button>
                    <Button
                      type="primary"
                      danger={actionMode === 'block'}
                      icon={<SendOutlined />}
                      loading={actionSaving}
                      disabled={selectedTaskIsTerminal}
                      onClick={submitTaskAction}
                    >
                      {actionMeta.buttonLabel}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      disabled={selectedTaskIsTerminal}
                      onClick={() => {
                        setActionMode('complete')
                        setActionReason('')
                      }}
                    >
                      处理完成
                    </Button>
                    <Button
                      danger
                      icon={<ExclamationCircleOutlined />}
                      disabled={selectedTaskIsTerminal}
                      onClick={() => {
                        setActionMode('block')
                        setActionReason(selectedTaskReason)
                      }}
                    >
                      标记阻塞
                    </Button>
                    <Button
                      icon={<ClockCircleOutlined />}
                      disabled={selectedTaskIsTerminal}
                      onClick={() => {
                        setActionMode('urge')
                        setActionReason('')
                      }}
                    >
                      催办
                    </Button>
                  </>
                )}
                <Button
                  icon={<LinkOutlined />}
                  disabled={!selectedTaskEntryPath}
                  onClick={() => openTaskEntry(selectedTask)}
                >
                  查看关联记录
                </Button>
              </Space>
            </div>
          ) : null
        }
      >
        {selectedTask ? (
          <div className="erp-task-action-drawer__body">
            <section className="erp-task-action-drawer__summary">
              <div className="erp-task-action-drawer__eyebrow">当前任务</div>
              <Title level={4} className="erp-task-action-drawer__task-title">
                {selectedTask.task_name || '未命名任务'}
              </Title>
              <div className="erp-task-action-drawer__meta-grid">
                <div>
                  <span>来源</span>
                  <strong>{formatWorkflowTaskSource(selectedTask)}</strong>
                </div>
                <div>
                  <span>负责角色</span>
                  <strong>{getTaskOwnerRoleKey(selectedTask) || '-'}</strong>
                </div>
                <div>
                  <span>到期时间</span>
                  <strong>{getWorkflowTaskDueLabel(selectedTask)}</strong>
                </div>
                <div>
                  <span>当前状态</span>
                  <strong>{selectedTaskStatusMeta?.label || '-'}</strong>
                </div>
              </div>
              {selectedTaskReason ? (
                <div className="erp-task-action-drawer__reason">
                  <span>阻塞 / 退回原因</span>
                  <strong>{selectedTaskReason}</strong>
                </div>
              ) : null}
            </section>

            <section
              className="erp-task-action-drawer__steps"
              aria-label="任务处理步骤"
            >
              {TASK_DRAWER_STEPS.map((step, index) => {
                const active =
                  (index === 0 && !actionMeta) ||
                  (index === 1 && actionMeta && !actionSaving) ||
                  (index === 2 && actionSaving)
                return (
                  <div
                    key={step.key}
                    className={[
                      'erp-task-action-drawer__step',
                      active ? 'erp-task-action-drawer__step--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.description}</small>
                    </div>
                  </div>
                )
              })}
            </section>

            <section className="erp-task-action-drawer__boundary">
              <AlertOutlined aria-hidden="true" />
              <div>
                <strong>Workflow / Fact 边界</strong>
                <span>
                  完成、阻塞和催办只处理协同任务；库存、出货、应收、开票、付款或其他事实仍回到对应业务模块。
                </span>
              </div>
            </section>

            {actionMeta ? (
              <section
                className={[
                  'erp-task-action-drawer__action-panel',
                  `erp-task-action-drawer__action-panel--${selectedTaskActionTone}`,
                ].join(' ')}
              >
                <div className="erp-task-action-drawer__action-head">
                  <div>
                    <span>当前动作</span>
                    <strong>{actionMeta.title}</strong>
                  </div>
                  <Tag color={actionMeta.requireReason ? 'orange' : 'green'}>
                    {actionMeta.requireReason ? '必须填写原因' : '确认即可'}
                  </Tag>
                </div>
                <Paragraph className="erp-task-action-drawer__action-copy">
                  {getTaskActionDescription(actionMode)}
                </Paragraph>
                {actionMeta.requireReason ? (
                  <TextArea
                    value={actionReason}
                    autoSize={{ minRows: 4, maxRows: 6 }}
                    maxLength={180}
                    showCount
                    placeholder="填写原因、影响范围、需要谁处理"
                    onChange={(event) => setActionReason(event.target.value)}
                  />
                ) : (
                  <div className="erp-task-action-drawer__confirm-copy">
                    <CheckCircleOutlined aria-hidden="true" />
                    <span>
                      提交后任务会回到已完成队列；真实业务对象是否继续处理，仍以关联模块为准。
                    </span>
                  </div>
                )}
              </section>
            ) : (
              <section className="erp-task-action-drawer__action-prompt">
                <strong>选择一个处理动作</strong>
                <span>{getTaskActionDescription('')}</span>
              </section>
            )}
          </div>
        ) : null}
      </Drawer>
    </Space>
  )
}
