import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Select,
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
import WorkflowTaskActionDrawer, {
  TASK_ACTION_META,
} from '../components/workflow/WorkflowTaskActionDrawer.jsx'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  listWorkflowTasks,
  rejectWorkflowTaskAction,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import useWorkflowTaskActionAccess from '../hooks/useWorkflowTaskActionAccess.js'
import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceTypeLabel,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import {
  getWorkflowTaskDueStatus,
  isTerminalWorkflowTask,
} from '../utils/workflowDashboardStats.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../utils/workflowTaskActionSubmitGuard.mjs'
import {
  TASK_BOARD_ROLE_OPTIONS,
  TASK_BOARD_DUE_OPTIONS,
  TASK_BOARD_STATUS_OPTIONS,
  buildWorkflowTaskBoardLanes,
  filterWorkflowTaskBoardTasks,
  getTaskStatusKey,
  getWorkflowTaskDueLabel,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskReasonLabel,
  getWorkflowTaskReadonlyReason,
  getWorkflowTaskStatusMeta,
  hasActiveWorkflowTaskBoardFilters,
  readWorkflowTaskBoardFiltersFromSearch,
  writeWorkflowTaskBoardFiltersToSearch,
} from '../utils/workflowTaskBoard.mjs'

const { Paragraph, Text, Title } = Typography

const EXCEPTION_FLOW_STEPS = Object.freeze([
  {
    key: 'blocked',
    title: '阻塞记录',
    description: '必须填写原因和影响范围。',
  },
  {
    key: 'assign',
    title: '责任分派',
    description: '按责任角色或具体负责人接收。',
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

const WORKBENCH_QUEUE_OPTIONS = Object.freeze([
  { key: 'actionable', label: '待我处理', hint: '当前可推进' },
  { key: 'risk', label: '阻塞/逾期', hint: '先补原因' },
  { key: 'waiting', label: '等待交接', hint: '非终态任务' },
])

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
      label: getWorkflowTaskSourceTypeLabel(sourceType),
    })),
  ]
}

function getWorkflowTaskStableKey(task) {
  return String(task?.id || task?.task_code || '')
}

function TaskLane({
  lane,
  selectedTaskId,
  onSelectTask,
  onOpenTask,
  onOpenEntry,
}) {
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
            const entryPath = resolveWorkflowTaskEntryPath(task)
            const taskId = getWorkflowTaskStableKey(task)
            const isSelected = taskId && taskId === selectedTaskId
            return (
              <div
                className={`erp-task-board-card${
                  isSelected ? ' erp-task-board-card--selected' : ''
                }`}
                key={`${lane.key}-${taskId || task.id}`}
                onClick={() => onSelectTask(task)}
                onFocusCapture={() => onSelectTask(task)}
              >
                <Space
                  className="erp-task-board-card-head"
                  align="start"
                  size={8}
                >
                  {entryPath ? (
                    <Button
                      type="link"
                      className="erp-dashboard-link-button erp-task-board-card-title"
                      onClick={() => onOpenEntry(task)}
                    >
                      {task.task_name || '未命名任务'}
                    </Button>
                  ) : (
                    <Text strong className="erp-task-board-card-title">
                      {task.task_name || '未命名任务'}
                    </Text>
                  )}
                  <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                </Space>
                <Text type="secondary" className="erp-task-board-card-meta">
                  {formatWorkflowTaskSource(task)} /{' '}
                  {getWorkflowTaskDueLabel(task)}
                </Text>
                {getWorkflowTaskReason(task) ? (
                  <Text type="danger" className="erp-task-board-card-meta">
                    {getWorkflowTaskReasonLabel(task)}：
                    {getWorkflowTaskReason(task)}
                  </Text>
                ) : null}
                <Space wrap>
                  <Button size="small" onClick={() => onOpenTask(task)}>
                    查看
                  </Button>
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

function WorkbenchQueueEmpty({ activeOption, fallbackOption, onSwitchQueue }) {
  const description = fallbackOption
    ? `${activeOption.label}暂无任务，可切到${fallbackOption.label}继续处理。`
    : '当前没有需要处理的 Workflow 任务。'

  return (
    <div className="erp-workbench-queue-empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
      {fallbackOption ? (
        <Button size="small" onClick={() => onSwitchQueue(fallbackOption.key)}>
          查看{fallbackOption.label}
        </Button>
      ) : null}
    </div>
  )
}

export default function DashboardPage({ initialView = 'workbench' }) {
  const [loading, setLoading] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedTaskBoardTaskId, setSelectedTaskBoardTaskId] = useState('')
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
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )

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
  const activeExceptionStep =
    EXCEPTION_FLOW_STEPS.find((step) => step.key === exceptionStepKey) ||
    EXCEPTION_FLOW_STEPS[0]
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
      filteredTasks.find(
        (task) => getWorkflowTaskStableKey(task) === selectedTaskBoardTaskId
      ) || null,
    [filteredTasks, selectedTaskBoardTaskId]
  )
  const taskCenterCurrentStatusMeta = taskCenterCurrentTask
    ? getWorkflowTaskStatusMeta(taskCenterCurrentTask)
    : null
  const taskCenterCurrentEntryPath = taskCenterCurrentTask
    ? resolveWorkflowTaskEntryPath(taskCenterCurrentTask)
    : ''

  useEffect(() => {
    if (!selectedTaskBoardTaskId) return
    const stillVisible = filteredTasks.some(
      (task) => getWorkflowTaskStableKey(task) === selectedTaskBoardTaskId
    )
    if (!stillVisible) {
      setSelectedTaskBoardTaskId('')
    }
  }, [filteredTasks, selectedTaskBoardTaskId])

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
  const activeWorkbenchQueueOption =
    WORKBENCH_QUEUE_OPTIONS.find(
      (option) => option.key === workbenchQueueKey
    ) || WORKBENCH_QUEUE_OPTIONS[0]
  const fallbackWorkbenchQueueOption =
    WORKBENCH_QUEUE_OPTIONS.find(
      (option) =>
        option.key !== workbenchQueueKey &&
        (workbenchQueueGroups[option.key]?.length || 0) > 0
    ) || null
  const selectedWorkbenchTask = useMemo(() => {
    if (workbenchQueueTasks.length === 0) {
      return null
    }
    return (
      workbenchQueueTasks.find(
        (task) => String(task.id || task.task_code) === selectedWorkbenchTaskId
      ) || workbenchQueueTasks[0]
    )
  }, [selectedWorkbenchTaskId, workbenchQueueTasks])
  const selectedWorkbenchStatusMeta = selectedWorkbenchTask
    ? getWorkflowTaskStatusMeta(selectedWorkbenchTask)
    : null
  const selectedWorkbenchEntryPath = selectedWorkbenchTask
    ? resolveWorkflowTaskEntryPath(selectedWorkbenchTask)
    : ''
  const selectedWorkbenchTaskAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedWorkbenchTask,
    enabled: Boolean(selectedWorkbenchTask),
  })
  const taskCenterCurrentTaskAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: taskCenterCurrentTask,
    enabled: Boolean(taskCenterCurrentTask),
  })
  const actionDrawerAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask),
  })

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

  const getTaskReadonlyNotice = useCallback(
    (task) => getWorkflowTaskReadonlyReason(adminProfile, task),
    [adminProfile]
  )

  const selectTaskBoardTask = useCallback((task) => {
    const taskId = getWorkflowTaskStableKey(task)
    if (taskId) {
      setSelectedTaskBoardTaskId(taskId)
    }
  }, [])

  const openTaskDrawer = (task, mode = '') => {
    const nextMode = TASK_ACTION_META[mode] ? mode : ''
    setSelectedTask(task)
    setActionMode(nextMode)
    setActionReason(nextMode === 'block' ? getWorkflowTaskReason(task) : '')
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
    if (actionDrawerAccess.loading) {
      message.warning('正在核对任务动作权限，请稍后再提交')
      return
    }
    if (!actionDrawerAccess.canRun(actionMode)) {
      message.warning(
        actionDrawerAccess.getReason(actionMode) ||
          getWorkflowTaskReadonlyReason(adminProfile, selectedTask)
      )
      return
    }

    const reason = actionReason.trim()
    if (actionMeta.requireReason && !reason) {
      message.warning(`${actionMeta.title}需要填写原因`)
      return
    }
    const accessVerified = await verifyWorkflowTaskActionAccessBeforeSubmit({
      task: selectedTask,
      actionKey: actionMode,
      reason,
      onWarning: message.warning,
      onError: message.error,
    })
    if (!accessVerified) return

    setActionSaving(true)
    try {
      if (actionMode === 'urge') {
        await urgeWorkflowTask({
          task_id: selectedTask.id,
          action: 'urge_task',
          reason,
          payload: {
            entry: 'desktop_task_board',
          },
        })
      } else {
        const nextStatusKey =
          actionMode === 'block'
            ? 'blocked'
            : actionMode === 'reject'
              ? 'rejected'
              : 'done'
        const actionParams = {
          task_id: selectedTask.id,
          reason,
          payload: {
            desktop_task_board_action: actionMode,
            blocked_reason: actionMode === 'block' ? reason : undefined,
            rejected_reason: actionMode === 'reject' ? reason : undefined,
          },
        }
        if (nextStatusKey === 'done') {
          await completeWorkflowTaskAction({
            ...actionParams,
            action_key: 'complete',
          })
        } else if (nextStatusKey === 'blocked') {
          await blockWorkflowTaskAction({
            ...actionParams,
            action_key: 'block',
          })
        } else {
          await rejectWorkflowTaskAction({
            ...actionParams,
            action_key: 'reject',
          })
        }
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
      key: 'task_priority',
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
      key: 'owner_role',
      width: 90,
      render: (_, record) => getWorkflowTaskOwnerRoleLabel(record),
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
      render: (_, record) => {
        return (
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation()
              openTaskDrawer(record)
            }}
          >
            查看
          </Button>
        )
      },
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
              className="erp-workbench-queue-filter-strip"
              aria-label="工作台队列筛选"
            >
              {WORKBENCH_QUEUE_OPTIONS.map((option) => {
                const count = workbenchQueueGroups[option.key]?.length || 0
                const active = option.key === workbenchQueueKey
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={[
                      'erp-workbench-queue-filter',
                      active ? 'erp-workbench-queue-filter--active' : '',
                      option.key === 'risk' && count > 0
                        ? 'erp-workbench-queue-filter--danger'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={active}
                    aria-label={`${option.label}，${count} 项，${option.hint}`}
                    onClick={() => setWorkbenchQueueKey(option.key)}
                  >
                    <span>{option.label}</span>
                    <strong>{count}</strong>
                  </button>
                )
              })}
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
                      先处理待办和卡点；选中任务后在右侧核对上下文。
                    </Text>
                  </div>
                  <Tag
                    color={workbenchQueueTasks.length > 0 ? 'blue' : 'default'}
                  >
                    {activeWorkbenchQueueOption.label}{' '}
                    {workbenchQueueTasks.length}
                  </Tag>
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
                      <WorkbenchQueueEmpty
                        activeOption={activeWorkbenchQueueOption}
                        fallbackOption={fallbackWorkbenchQueueOption}
                        onSwitchQueue={setWorkbenchQueueKey}
                      />
                    ),
                  }}
                />
              </section>

              <aside className="erp-workbench-side-stack">
                <section
                  className="erp-workbench-panel erp-workbench-task-detail"
                  aria-label="当前任务上下文"
                >
                  <div className="erp-workbench-panel-head">
                    <div>
                      <Title level={5}>当前任务上下文</Title>
                      <Text type="secondary">
                        只展示当前队列选中的 Workflow 任务
                      </Text>
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
                          {getWorkflowTaskOwnerRoleLabel(selectedWorkbenchTask)}
                        </Descriptions.Item>
                        <Descriptions.Item label="到期">
                          {getWorkflowTaskDueLabel(selectedWorkbenchTask)}
                        </Descriptions.Item>
                        <Descriptions.Item
                          label={getWorkflowTaskReasonLabel(
                            selectedWorkbenchTask
                          )}
                        >
                          {getWorkflowTaskReason(selectedWorkbenchTask) || '-'}
                        </Descriptions.Item>
                      </Descriptions>
                      <Space wrap className="erp-workbench-detail-actions">
                        {selectedWorkbenchTaskAccess.loading ? (
                          <Button disabled>核对权限中</Button>
                        ) : null}
                        {!selectedWorkbenchTaskAccess.loading &&
                        selectedWorkbenchTaskAccess.allowedModes.includes(
                          'complete'
                        ) ? (
                          <Button
                            type="primary"
                            onClick={() =>
                              openTaskDrawer(selectedWorkbenchTask, 'complete')
                            }
                          >
                            处理任务
                          </Button>
                        ) : null}
                        {!selectedWorkbenchTaskAccess.loading &&
                        selectedWorkbenchTaskAccess.allowedModes.includes(
                          'block'
                        ) ? (
                          <Button
                            danger
                            onClick={() =>
                              openTaskDrawer(selectedWorkbenchTask, 'block')
                            }
                          >
                            标记阻塞
                          </Button>
                        ) : null}
                        {!selectedWorkbenchTaskAccess.loading &&
                        selectedWorkbenchTaskAccess.allowedModes.includes(
                          'reject'
                        ) ? (
                          <Button
                            danger
                            onClick={() =>
                              openTaskDrawer(selectedWorkbenchTask, 'reject')
                            }
                          >
                            退回任务
                          </Button>
                        ) : null}
                        {!selectedWorkbenchTaskAccess.loading &&
                        selectedWorkbenchTaskAccess.allowedModes.length ===
                          0 ? (
                            <Button
                              title={selectedWorkbenchTaskAccess.readonlyReason}
                              onClick={() =>
                              openTaskDrawer(selectedWorkbenchTask)
                            }
                            >
                              查看上下文
                            </Button>
                        ) : null}
                        {selectedWorkbenchEntryPath ? (
                          <Button
                            onClick={() => openTaskEntry(selectedWorkbenchTask)}
                          >
                            关联记录
                          </Button>
                        ) : null}
                      </Space>
                    </Space>
                  ) : (
                    <div className="erp-workbench-detail-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          fallbackWorkbenchQueueOption
                            ? `当前队列暂无任务，可切到${fallbackWorkbenchQueueOption.label}。`
                            : '暂无可处理任务'
                        }
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
                    label="可推进任务"
                    value={taskCenterAssignedCount}
                    actionLabel="筛选可推进任务"
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
                aria-label="当前选中任务"
              >
                <div className="erp-task-center-current-head">
                  <Text type="secondary">当前选中任务</Text>
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
                        {getWorkflowTaskReasonLabel(taskCenterCurrentTask)}：
                        {getWorkflowTaskReason(taskCenterCurrentTask)}
                      </Text>
                    ) : null}
                    <Space wrap className="erp-task-center-current-actions">
                      {taskCenterCurrentTaskAccess.loading ? (
                        <Button size="small" disabled>
                          核对权限中
                        </Button>
                      ) : null}
                      {!taskCenterCurrentTaskAccess.loading &&
                      taskCenterCurrentTaskAccess.allowedModes.includes(
                        'complete'
                      ) ? (
                        <Button
                          size="small"
                          type="primary"
                          onClick={() =>
                            openTaskDrawer(taskCenterCurrentTask, 'complete')
                          }
                        >
                          处理完成
                        </Button>
                      ) : null}
                      {!taskCenterCurrentTaskAccess.loading &&
                      taskCenterCurrentTaskAccess.allowedModes.includes(
                        'block'
                      ) ? (
                        <Button
                          size="small"
                          danger
                          onClick={() =>
                            openTaskDrawer(taskCenterCurrentTask, 'block')
                          }
                        >
                          标记阻塞
                        </Button>
                      ) : null}
                      {!taskCenterCurrentTaskAccess.loading &&
                      taskCenterCurrentTaskAccess.allowedModes.includes(
                        'reject'
                      ) ? (
                        <Button
                          size="small"
                          danger
                          onClick={() =>
                            openTaskDrawer(taskCenterCurrentTask, 'reject')
                          }
                        >
                          退回任务
                        </Button>
                      ) : null}
                      {!taskCenterCurrentTaskAccess.loading &&
                      taskCenterCurrentTaskAccess.allowedModes.length === 0 ? (
                        <Button
                          size="small"
                          title={taskCenterCurrentTaskAccess.readonlyReason}
                          onClick={() => openTaskDrawer(taskCenterCurrentTask)}
                        >
                          查看上下文
                        </Button>
                      ) : null}
                      {taskCenterCurrentEntryPath ? (
                        <Button
                          size="small"
                          onClick={() => openTaskEntry(taskCenterCurrentTask)}
                        >
                          关联对象
                        </Button>
                      ) : null}
                    </Space>
                  </>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="从下方任务卡选择一条任务"
                  />
                )}
              </section>
            </div>

            <div className="erp-task-board-filters">
              <Input.Search
                allowClear
                placeholder="搜索任务、单号、来源、处理原因"
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
                  selectedTaskId={selectedTaskBoardTaskId}
                  onSelectTask={selectTaskBoardTask}
                  onOpenTask={(task) => {
                    selectTaskBoardTask(task)
                    openTaskDrawer(task)
                  }}
                  onOpenEntry={(task) => {
                    selectTaskBoardTask(task)
                    openTaskEntry(task)
                  }}
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
                              {getWorkflowTaskReason(task)
                                ? `${getWorkflowTaskReasonLabel(
                                    task
                                  )}：${getWorkflowTaskReason(task)}`
                                : formatWorkflowTaskSource(task)}
                            </Text>
                          </div>
                          <Space wrap>
                            <Tag color={statusMeta.color}>
                              {statusMeta.label}
                            </Tag>
                            <Button
                              size="small"
                              onClick={() => openTaskDrawer(task)}
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

      <WorkflowTaskActionDrawer
        task={selectedTask}
        actionMode={actionMode}
        actionReason={actionReason}
        actionSaving={actionSaving}
        allowedActionModes={actionDrawerAccess.allowedModes}
        readonlyReason={
          actionDrawerAccess.loading
            ? '正在向后端核对当前任务动作权限。'
            : actionDrawerAccess.readonlyReason ||
              getTaskReadonlyNotice(selectedTask)
        }
        onActionModeChange={setActionMode}
        onActionReasonChange={setActionReason}
        onClose={closeTaskDrawer}
        onOpenEntry={openTaskEntry}
        onSubmit={submitTaskAction}
      />
    </Space>
  )
}
