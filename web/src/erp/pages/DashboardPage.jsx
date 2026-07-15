import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Pagination,
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
  getWorkflowTaskBoard,
  listAllWorkflowRoleTasks,
  rejectWorkflowTaskAction,
  resumeWorkflowTaskAction,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import useWorkflowTaskActionAccess from '../hooks/useWorkflowTaskActionAccess.js'
import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceTypeLabel,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import {
  createWorkflowWorkbenchSnapshot,
  getWorkflowTaskDueStatus,
  getWorkflowWorkbenchRoleKeys,
  getWorkflowWorkbenchScopeKey,
  readWorkflowWorkbenchSnapshot,
} from '../utils/workflowDashboardStats.mjs'
import { isTerminalWorkflowTask } from '../utils/workflowTaskLifecycle.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../utils/workflowTaskActionSubmitGuard.mjs'
import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  isWorkflowTaskMutationResultUnknown,
  verifyNewWorkflowTaskMutationAttempt,
} from '../utils/workflowTaskMutation.mjs'
import {
  TASK_BOARD_ROLE_OPTIONS,
  TASK_BOARD_DUE_OPTIONS,
  TASK_BOARD_STATUS_OPTIONS,
  buildWorkflowTaskBoardModel,
  buildWorkflowTaskBoardRequest,
  getTaskStatusKey,
  getWorkflowTaskDueLabel,
  getWorkflowTaskBoardRequestKey,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskReasonLabel,
  getWorkflowTaskReasonMeta,
  getWorkflowTaskReadonlyReason,
  getWorkflowTaskStatusMeta,
  hasActiveWorkflowTaskBoardFilters,
  readWorkflowTaskBoardFiltersFromSearch,
  resolveWorkflowTaskBoardResponseState,
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
    description: '按负责岗位或具体负责人接收。',
  },
  {
    key: 'follow',
    title: '处理跟进',
    description: '催办、补充说明或转派。',
  },
  {
    key: 'verify',
    title: '验证恢复',
    description: '确认任务可以继续推进。',
  },
  {
    key: 'close',
    title: '关闭归档',
    description: '只关闭当前异常任务，不会改变相关业务记录。',
  },
])

const WORKBENCH_QUEUE_OPTIONS = Object.freeze([
  { key: 'actionable', label: '待我处理', hint: '当前可推进' },
  { key: 'risk', label: '阻塞/逾期', hint: '先补原因' },
])

const WORKBENCH_QUEUE_PAGE_SIZE = 8
const TASK_BOARD_PAGE_SCROLL_GAP = 12

function scrollTaskBoardLanesToStart(lanesElement) {
  const scrollContainer = lanesElement?.closest?.('.erp-admin-content')
  if (!scrollContainer) return

  const containerRect = scrollContainer.getBoundingClientRect()
  const lanesRect = lanesElement.getBoundingClientRect()
  const paddingTop =
    Number.parseFloat(window.getComputedStyle(scrollContainer).paddingTop) || 0
  const expectedTop =
    containerRect.top + paddingTop + TASK_BOARD_PAGE_SCROLL_GAP
  const nextScrollTop = scrollContainer.scrollTop + lanesRect.top - expectedTop
  scrollContainer.scrollTo({
    top: Math.max(0, nextScrollTop),
    behavior: 'auto',
  })
}

const PRODUCT_CORE_METRICS = Object.freeze([
  {
    label: '业务功能',
    value: '11',
    note: '基础资料、销售、采购、物料清单、库存、质检、出货和财务',
  },
  {
    label: '系统设置',
    value: '4',
    note: '员工权限、操作记录、打印模板和客户业务设置',
  },
  {
    label: '业务数据',
    value: '未连接',
    note: '当前不读取客户订单、库存、待办任务或财务记录',
  },
])

const PRODUCT_CORE_REVIEW_ENTRIES = Object.freeze([
  {
    key: 'business-dashboard',
    title: '业务看板',
    path: '/erp/business-dashboard',
    description: '查看业务数量、办理情况和需要关注的事项。',
  },
  {
    key: 'sales-orders',
    title: '销售订单',
    path: '/erp/sales/project-orders/sales-orders',
    description: '查看销售订单状态、可用操作和填写内容。',
  },
  {
    key: 'bom',
    title: '物料清单（BOM）/ 产品工程',
    path: '/erp/purchase/material-bom',
    description: '查看产品结构、材料用量、损耗和版本状态。',
  },
  {
    key: 'purchase',
    title: '采购与入库',
    path: '/erp/purchase/accessories',
    description: '查看采购订单与入库办理条件。',
  },
  {
    key: 'outsourcing',
    title: '委外加工',
    path: '/erp/outsourcing/orders',
    description: '查看加工合同、工序、回货和质检的衔接方式。',
  },
  {
    key: 'shipment',
    title: '出货与库存',
    path: '/erp/warehouse/shipments',
    description: '查看出货放行、出库、库存和应收的办理顺序。',
  },
])

const PRODUCT_CORE_CONTROL_ENTRIES = Object.freeze([
  {
    key: 'print',
    title: '模板打印中心',
    path: '/erp/print-center',
    description: '查看可用打印模板和客户默认内容。',
  },
  {
    key: 'permissions',
    title: '权限管理',
    path: '/erp/system/permissions',
    description: '维护员工账号、岗位和功能权限。',
  },
  {
    key: 'audit',
    title: '系统操作记录',
    path: '/erp/system/audit-logs',
    description: '查看客户业务设置变更和系统管理操作记录。',
  },
])

function ProductCoreDashboard({ onNavigate }) {
  return (
    <Card
      className="erp-dashboard-card erp-product-core-dashboard"
      variant="borderless"
      data-product-core-dashboard="true"
    >
      <div className="erp-product-core-dashboard__hero">
        <div>
          <Text type="secondary">功能预览</Text>
          <Title level={3} className="erp-command-center-hero-title">
            系统功能总览
          </Title>
          <Paragraph className="erp-dashboard-summary">
            这里用于查看系统已配置的功能和设置。当前尚未连接客户业务数据，因此不会显示订单、库存、待办任务或财务记录。
          </Paragraph>
        </div>
        <Space wrap>
          <Tag color="blue">不显示客户业务数据</Tag>
          <Tag color="green">功能预览</Tag>
          <Tag>尚未连接客户环境</Tag>
        </Space>
      </div>

      <div className="erp-product-core-dashboard__metrics">
        {PRODUCT_CORE_METRICS.map((metric) => (
          <section key={metric.label} className="erp-product-core-metric">
            <Text type="secondary">{metric.label}</Text>
            <strong>{metric.value}</strong>
            <span>{metric.note}</span>
          </section>
        ))}
      </div>

      <div className="erp-product-core-dashboard__grid">
        <section className="erp-product-core-panel">
          <div className="erp-product-core-panel__head">
            <Title level={5}>业务功能</Title>
            <Text type="secondary">
              可查看页面说明、填写内容和可用操作；不会读取客户业务记录。
            </Text>
          </div>
          <div className="erp-product-core-entry-grid">
            {PRODUCT_CORE_REVIEW_ENTRIES.map((entry) => (
              <button
                type="button"
                key={entry.key}
                className="erp-product-core-entry"
                onClick={() => onNavigate(entry.path)}
              >
                <strong>{entry.title}</strong>
                <span>{entry.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="erp-product-core-panel">
          <div className="erp-product-core-panel__head">
            <Title level={5}>系统设置</Title>
            <Text type="secondary">
              这里管理客户业务设置、员工权限和操作记录，不办理具体业务。
            </Text>
          </div>
          <Space direction="vertical" size={10} className="erp-dashboard-block">
            {PRODUCT_CORE_CONTROL_ENTRIES.map((entry) => (
              <div className="erp-command-center-focus-item" key={entry.key}>
                <div className="erp-command-center-focus-copy">
                  <Text strong>{entry.title}</Text>
                  <Text type="secondary">{entry.description}</Text>
                </div>
                <Button size="small" onClick={() => onNavigate(entry.path)}>
                  进入
                </Button>
              </div>
            ))}
          </Space>
        </section>
      </div>
    </Card>
  )
}

function buildSourceOptions(values = []) {
  const sourceTypes = [
    ...new Set(
      (values || [])
        .map((sourceType) => String(sourceType || '').trim())
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right))

  return [
    { value: 'all', label: '全部业务' },
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
  focused,
  page,
  selectedTaskId,
  onSelectTask,
  onOpenTask,
  onOpenEntry,
  onViewAll,
  onPageChange,
}) {
  const shownStart = lane.tasks.length > 0 ? lane.offset + 1 : 0
  const shownEnd = lane.offset + lane.tasks.length
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
            const reasonMeta = getWorkflowTaskReasonMeta(task)
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
                {reasonMeta.value ? (
                  <Text
                    type={
                      ['blocked', 'rejected'].includes(reasonMeta.kind)
                        ? 'danger'
                        : 'secondary'
                    }
                    className="erp-task-board-card-meta"
                  >
                    {reasonMeta.label}：{reasonMeta.value}
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
      {focused ? (
        <div className="erp-task-board-lane-footer erp-task-board-lane-footer--focused">
          <Text type="secondary">
            已显示第 {shownStart}-{shownEnd} 条，共 {lane.count} 条
          </Text>
          {lane.count > lane.limit ? (
            <Pagination
              size="small"
              current={page}
              pageSize={lane.limit}
              total={lane.count}
              showSizeChanger={false}
              onChange={onPageChange}
            />
          ) : null}
        </div>
      ) : lane.hiddenCount > 0 ? (
        <div className="erp-task-board-lane-footer">
          <Text type="secondary">
            已显示前 {lane.tasks.length} 条，共 {lane.count} 条
          </Text>
          <Button type="link" size="small" onClick={onViewAll}>
            查看全部 {lane.count} 条
          </Button>
        </div>
      ) : null}
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
    : '当前没有需要处理的任务。'

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
  const [workflowWorkbenchSnapshot, setWorkflowWorkbenchSnapshot] = useState(
    () => createWorkflowWorkbenchSnapshot()
  )
  const [taskBoardResponseState, setTaskBoardResponseState] = useState(null)
  const [taskBoardKeywordDraft, setTaskBoardKeywordDraft] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedTaskBoardTaskId, setSelectedTaskBoardTaskId] = useState('')
  const [actionMode, setActionMode] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [activeView, setActiveView] = useState(initialView)
  const [workbenchQueueKey, setWorkbenchQueueKey] = useState('actionable')
  const [workbenchQueuePage, setWorkbenchQueuePage] = useState(1)
  const [selectedWorkbenchTaskId, setSelectedWorkbenchTaskId] = useState('')
  const [taskBoardTransitionMinHeight, setTaskBoardTransitionMinHeight] =
    useState(0)
  const [exceptionStepKey, setExceptionStepKey] = useState(
    EXCEPTION_FLOW_STEPS[0].key
  )
  const mountedRef = useRef(false)
  const dashboardLoadRequestSeqRef = useRef(0)
  const taskBoardLanesRef = useRef(null)
  const pendingTaskBoardPageScrollRef = useRef(null)
  const mutationAttemptsRef = useRef(null)
  mutationAttemptsRef.current ||= createTaskMutationAttemptStore()
  const mutationInFlightRef = useRef(null)
  mutationInFlightRef.current ||= createTaskMutationInFlightGuard()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const effectiveSessionCustomerKey =
    typeof adminProfile?.effective_session?.customer?.key === 'string'
      ? adminProfile.effective_session.customer.key.trim()
      : ''
  const shouldShowProductCoreDashboard =
    initialView === 'workbench' &&
    adminProfile?.is_super_admin === true &&
    !effectiveSessionCustomerKey
  const workflowWorkbenchRoleKeys = useMemo(
    () => getWorkflowWorkbenchRoleKeys(adminProfile),
    [adminProfile]
  )
  const workflowWorkbenchScopeKey = useMemo(
    () =>
      getWorkflowWorkbenchScopeKey(adminProfile, workflowWorkbenchRoleKeys),
    [adminProfile, workflowWorkbenchRoleKeys]
  )
  const workflowWorkbenchScopeKeyRef = useRef(workflowWorkbenchScopeKey)
  workflowWorkbenchScopeKeyRef.current = workflowWorkbenchScopeKey
  const visibleWorkflowWorkbenchSnapshot = readWorkflowWorkbenchSnapshot(
    workflowWorkbenchSnapshot,
    workflowWorkbenchScopeKey
  )
  const workflowTasks = visibleWorkflowWorkbenchSnapshot.tasks
  const workflowRiskTaskIDs =
    visibleWorkflowWorkbenchSnapshot.riskTaskIDs
  const filters = useMemo(
    () => readWorkflowTaskBoardFiltersFromSearch(searchParams),
    [searchParams]
  )
  const isTaskBoardView = initialView === 'task-board'
  const taskBoardRequest = useMemo(
    () => buildWorkflowTaskBoardRequest(filters),
    [filters]
  )
  const taskBoardRequestKey = useMemo(
    () => getWorkflowTaskBoardRequestKey(taskBoardRequest),
    [taskBoardRequest]
  )

  const loadDashboardStats = useCallback(async () => {
    const requestSeq = dashboardLoadRequestSeqRef.current + 1
    dashboardLoadRequestSeqRef.current = requestSeq
    const requestWorkbenchScopeKey = workflowWorkbenchScopeKey
    if (shouldShowProductCoreDashboard) {
      setWorkflowWorkbenchSnapshot(
        createWorkflowWorkbenchSnapshot(requestWorkbenchScopeKey)
      )
      setLoading(false)
      return true
    }
    setLoading(true)
    if (isTaskBoardView && mountedRef.current) {
      setTaskBoardResponseState({
        requestKey: taskBoardRequestKey,
        response: null,
        error: '',
      })
    }
    try {
      if (isTaskBoardView) {
        const taskBoardResult = await getWorkflowTaskBoard(taskBoardRequest)
        if (
          mountedRef.current &&
          dashboardLoadRequestSeqRef.current === requestSeq &&
          workflowWorkbenchScopeKeyRef.current === requestWorkbenchScopeKey
        ) {
          setTaskBoardResponseState({
            requestKey: taskBoardRequestKey,
            response: taskBoardResult,
            error: '',
          })
        }
      } else {
        const roleTaskViews = await Promise.all(
          workflowWorkbenchRoleKeys.flatMap((roleKey) =>
            ['todo', 'risk'].map(async (viewKey) => ({
              viewKey,
              response: await listAllWorkflowRoleTasks({
                view_key: viewKey,
                role_key: roleKey,
                limit: 100,
              }),
            }))
          )
        )
        if (
          mountedRef.current &&
          dashboardLoadRequestSeqRef.current === requestSeq &&
          workflowWorkbenchScopeKeyRef.current === requestWorkbenchScopeKey
        ) {
          const tasksByID = new Map()
          const riskTaskIDs = new Set()
          for (const { response, viewKey } of roleTaskViews) {
            for (const task of response.items) {
              tasksByID.set(task.id, task)
              if (viewKey === 'risk') riskTaskIDs.add(task.id)
            }
          }
          setWorkflowWorkbenchSnapshot(
            createWorkflowWorkbenchSnapshot(requestWorkbenchScopeKey, {
              tasks: [...tasksByID.values()],
              riskTaskIDs,
            })
          )
        }
      }
      return true
    } catch (error) {
      if (
        mountedRef.current &&
        dashboardLoadRequestSeqRef.current === requestSeq &&
        workflowWorkbenchScopeKeyRef.current === requestWorkbenchScopeKey
      ) {
        const fallback = isTaskBoardView ? '加载任务看板失败' : '加载工作台失败'
        const errorMessage = getActionErrorMessage(error, fallback)
        if (isTaskBoardView) {
          setTaskBoardResponseState({
            requestKey: taskBoardRequestKey,
            response: null,
            error: errorMessage,
          })
        }
        message.error(errorMessage)
      }
      return false
    } finally {
      if (
        mountedRef.current &&
        dashboardLoadRequestSeqRef.current === requestSeq &&
        workflowWorkbenchScopeKeyRef.current === requestWorkbenchScopeKey
      ) {
        setLoading(false)
      }
    }
  }, [
    isTaskBoardView,
    shouldShowProductCoreDashboard,
    taskBoardRequest,
    taskBoardRequestKey,
    workflowWorkbenchRoleKeys,
    workflowWorkbenchScopeKey,
  ])

  useEffect(() => {
    mountedRef.current = true
    loadDashboardStats()
    return () => {
      mountedRef.current = false
      dashboardLoadRequestSeqRef.current += 1
    }
  }, [loadDashboardStats])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadDashboardStats)
  }, [loadDashboardStats, outletContext])

  useEffect(() => {
    setActiveView(initialView)
  }, [initialView])

  const hasActiveFilters = useMemo(
    () => hasActiveWorkflowTaskBoardFilters(filters),
    [filters]
  )
  const taskBoardResponse = useMemo(
    () =>
      resolveWorkflowTaskBoardResponseState(
        taskBoardResponseState,
        taskBoardRequest
      ),
    [taskBoardRequest, taskBoardResponseState]
  )
  const taskBoardLoadError =
    taskBoardResponseState?.requestKey === taskBoardRequestKey
      ? taskBoardResponseState.error
      : ''
  const taskBoardModel = useMemo(
    () => buildWorkflowTaskBoardModel(taskBoardResponse, filters),
    [filters, taskBoardResponse]
  )
  const taskBoardReady = Boolean(taskBoardResponse) && !taskBoardLoadError
  const taskLanes = taskBoardModel.visibleLanes
  const taskBoardVisibleTasks = useMemo(
    () => taskLanes.flatMap((lane) => lane.tasks),
    [taskLanes]
  )
  const sourceOptions = useMemo(
    () =>
      buildSourceOptions([
        ...taskBoardModel.sourceTypes,
        filters.sourceType === 'all' ? '' : filters.sourceType,
      ]),
    [filters.sourceType, taskBoardModel.sourceTypes]
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
            !isTerminalWorkflowTask(task) &&
            (statusKey === 'blocked' || Boolean(getWorkflowTaskReason(task)))
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
  const taskCenterCurrentTask = useMemo(
    () =>
      taskBoardVisibleTasks.find(
        (task) => getWorkflowTaskStableKey(task) === selectedTaskBoardTaskId
      ) || null,
    [selectedTaskBoardTaskId, taskBoardVisibleTasks]
  )
  const taskCenterCurrentStatusMeta = taskCenterCurrentTask
    ? getWorkflowTaskStatusMeta(taskCenterCurrentTask)
    : null
  const taskCenterCurrentEntryPath = taskCenterCurrentTask
    ? resolveWorkflowTaskEntryPath(taskCenterCurrentTask)
    : ''

  useEffect(() => {
    if (!taskBoardReady || !selectedTaskBoardTaskId) return
    const stillVisible = taskBoardVisibleTasks.some(
      (task) => getWorkflowTaskStableKey(task) === selectedTaskBoardTaskId
    )
    if (!stillVisible) {
      setSelectedTaskBoardTaskId('')
    }
  }, [selectedTaskBoardTaskId, taskBoardReady, taskBoardVisibleTasks])

  useEffect(() => {
    setTaskBoardKeywordDraft(filters.keyword)
  }, [filters.keyword])

  useLayoutEffect(() => {
    const pendingScroll = pendingTaskBoardPageScrollRef.current
    if (
      !pendingScroll ||
      loading ||
      !taskBoardReady ||
      !taskBoardModel.focused ||
      filters.lane !== pendingScroll.lane ||
      taskBoardModel.page !== pendingScroll.page
    ) {
      return
    }

    scrollTaskBoardLanesToStart(taskBoardLanesRef.current)
    pendingTaskBoardPageScrollRef.current = null
    setTaskBoardTransitionMinHeight(0)
  }, [
    filters.lane,
    loading,
    taskBoardModel.focused,
    taskBoardModel.page,
    taskBoardReady,
  ])

  useEffect(() => {
    if (!taskBoardLoadError || !pendingTaskBoardPageScrollRef.current) return
    pendingTaskBoardPageScrollRef.current = null
    setTaskBoardTransitionMinHeight(0)
  }, [taskBoardLoadError])

  useEffect(() => {
    if (
      !taskBoardResponse ||
      !taskBoardModel.focused ||
      taskBoardModel.requestedPage <= taskBoardModel.pageCount
    ) {
      return
    }
    if (pendingTaskBoardPageScrollRef.current) {
      pendingTaskBoardPageScrollRef.current = {
        ...pendingTaskBoardPageScrollRef.current,
        page: taskBoardModel.pageCount,
      }
    }
    setSelectedTaskBoardTaskId('')
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        page: taskBoardModel.pageCount,
      }),
      { replace: true }
    )
  }, [
    filters,
    searchParams,
    setSearchParams,
    taskBoardModel.focused,
    taskBoardModel.pageCount,
    taskBoardModel.requestedPage,
    taskBoardResponse,
  ])

  const workbenchQueueGroups = useMemo(() => {
    const groups = {
      actionable: [],
      risk: [],
    }
    workflowTasks.forEach((task) => {
      const statusKey = getTaskStatusKey(task)
      const dueStatus = getWorkflowTaskDueStatus(task)
      const hasReason = Boolean(getWorkflowTaskReason(task))
      if (isTerminalWorkflowTask(task)) {
        return
      }
      if (
        workflowRiskTaskIDs.has(task.id) ||
        statusKey === 'blocked' ||
        dueStatus === 'overdue' ||
        hasReason
      ) {
        groups.risk.push(task)
        return
      }
      if (statusKey === 'ready') {
        groups.actionable.push(task)
      }
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
  }, [workflowRiskTaskIDs, workflowTasks])
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
  const workbenchQueuePageCount = Math.max(
    1,
    Math.ceil(workbenchQueueTasks.length / WORKBENCH_QUEUE_PAGE_SIZE)
  )
  const activeWorkbenchQueuePage = Math.min(
    workbenchQueuePage,
    workbenchQueuePageCount
  )
  const workbenchQueuePageTasks = useMemo(() => {
    const start = (activeWorkbenchQueuePage - 1) * WORKBENCH_QUEUE_PAGE_SIZE
    return workbenchQueueTasks.slice(start, start + WORKBENCH_QUEUE_PAGE_SIZE)
  }, [activeWorkbenchQueuePage, workbenchQueueTasks])
  const selectedWorkbenchTask = useMemo(() => {
    if (workbenchQueuePageTasks.length === 0) {
      return null
    }
    return (
      workbenchQueuePageTasks.find(
        (task) => String(task.id || task.task_code) === selectedWorkbenchTaskId
      ) || workbenchQueuePageTasks[0]
    )
  }, [selectedWorkbenchTaskId, workbenchQueuePageTasks])
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
  const showSelectedWorkbenchTaskReadonlyAction =
    !selectedWorkbenchTaskAccess.loading &&
    selectedWorkbenchTaskAccess.allowedModes.length === 0
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

  useEffect(() => {
    if (workbenchQueuePage === activeWorkbenchQueuePage) return
    setWorkbenchQueuePage(activeWorkbenchQueuePage)
    setSelectedWorkbenchTaskId('')
  }, [activeWorkbenchQueuePage, workbenchQueuePage])

  const updateFilter = (key, value) => {
    pendingTaskBoardPageScrollRef.current = null
    setTaskBoardTransitionMinHeight(0)
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        [key]: value,
        page: 1,
      }),
      { replace: true }
    )
  }

  const clearFilters = () => {
    pendingTaskBoardPageScrollRef.current = null
    setTaskBoardTransitionMinHeight(0)
    setSearchParams(writeWorkflowTaskBoardFiltersToSearch(searchParams), {
      replace: true,
    })
  }

  const selectTaskBoardLane = (lane) => {
    pendingTaskBoardPageScrollRef.current = null
    setTaskBoardTransitionMinHeight(0)
    setSelectedTaskBoardTaskId('')
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        lane,
        page: 1,
      }),
      { replace: true }
    )
  }

  const selectTaskBoardPage = (page) => {
    const nextPage = Number(page)
    if (
      !taskBoardModel.focused ||
      !Number.isInteger(nextPage) ||
      nextPage < 1 ||
      nextPage === taskBoardModel.page
    ) {
      return
    }
    const taskBoardCard = taskBoardLanesRef.current?.closest?.(
      '.erp-dashboard-task-board-card'
    )
    const currentCardHeight = Math.ceil(
      taskBoardCard?.getBoundingClientRect().height || 0
    )
    pendingTaskBoardPageScrollRef.current = {
      lane: filters.lane,
      page: nextPage,
    }
    setTaskBoardTransitionMinHeight(currentCardHeight)
    setSelectedTaskBoardTaskId('')
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        page: nextPage,
      }),
      { replace: true }
    )
  }

  const openTaskEntry = (task) => {
    const entryPath = resolveWorkflowTaskEntryPath(task)
    if (entryPath) {
      navigate(entryPath)
    }
  }

  const openProductCoreEntry = useCallback(
    (path) => {
      if (path) {
        navigate(path)
      }
    },
    [navigate]
  )

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

  const selectWorkbenchQueue = useCallback((queueKey) => {
    setWorkbenchQueueKey(queueKey)
    setWorkbenchQueuePage(1)
    setSelectedWorkbenchTaskId('')
  }, [])

  const selectWorkbenchQueuePage = useCallback((page) => {
    setWorkbenchQueuePage(page)
    setSelectedWorkbenchTaskId('')
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

    const reason = actionReason.trim()
    if (actionMeta.requireReason && !reason) {
      message.warning(`${actionMeta.title}需要填写原因`)
      return
    }
    const scope = `${selectedTask.id}:${actionMode}`
    const operation = actionMode
    const mutate =
      actionMode === 'urge'
        ? urgeWorkflowTask
        : actionMode === 'complete'
          ? completeWorkflowTaskAction
          : actionMode === 'block'
            ? blockWorkflowTaskAction
            : actionMode === 'reject'
              ? rejectWorkflowTaskAction
              : resumeWorkflowTaskAction
    const params =
      actionMode === 'urge'
        ? {
            task_id: selectedTask.id,
            expected_version: selectedTask.version,
            action: 'urge_task',
            reason,
            payload: {
              surface_key: 'desktop_task_board',
            },
          }
        : {
            task_id: selectedTask.id,
            expected_version: selectedTask.version,
            action_key: actionMode,
            reason,
            payload: {
              surface_key: 'desktop_task_board',
            },
          }
    const inFlightLease = mutationInFlightRef.current.acquire(
      `task:${selectedTask.id}`
    )
    if (!inFlightLease) return
    try {
      const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
        attemptStore: mutationAttemptsRef.current,
        scope,
        operation,
        params,
        verify: async () => {
          if (isTerminalWorkflowTask(selectedTask)) {
            message.warning('已结束任务不能继续处理')
            return false
          }
          if (actionDrawerAccess.loading) {
            message.warning('正在确认这项操作是否可用，请稍后再提交')
            return false
          }
          if (!actionDrawerAccess.canRun(actionMode)) {
            message.warning(
              actionDrawerAccess.getReason(actionMode) ||
                getWorkflowTaskReadonlyReason(adminProfile, selectedTask)
            )
            return false
          }
          return verifyWorkflowTaskActionAccessBeforeSubmit({
            task: selectedTask,
            actionKey: actionMode,
            reason,
            onWarning: message.warning,
            onError: message.error,
          })
        },
      })
      if (!accessVerified) return

      setActionSaving(true)
      try {
        try {
          await mutationAttemptsRef.current.run({
            scope,
            operation,
            mutate,
            params,
          })
        } catch (error) {
          if (isWorkflowTaskMutationResultUnknown(error)) {
            message.warning('提交结果暂未确认，已保留本次操作，可直接重试')
          } else {
            message.error(
              getActionErrorMessage(error, `${actionMeta.title}失败`)
            )
            closeTaskDrawer()
            await loadDashboardStats().catch(() => {})
          }
          return
        }
        closeTaskDrawer()
        message.success(actionMeta.successMessage)
        try {
          await loadDashboardStats()
        } catch {
          message.warning('操作已成功但列表刷新失败，请手动刷新')
        }
      } finally {
        setActionSaving(false)
      }
    } finally {
      mutationInFlightRef.current.release(inFlightLease)
    }
  }

  const workbenchTaskColumns = [
    {
      title: '状态 / 风险',
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
      title: '任务 / 相关单据',
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
      title: '截止时间',
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
      {shouldShowProductCoreDashboard ? (
        <ProductCoreDashboard onNavigate={openProductCoreEntry} />
      ) : null}

      {!shouldShowProductCoreDashboard && activeView === 'workbench' ? (
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
                  登录后先看今天该处理什么，再进入相关业务页面继续办理。
                </Paragraph>
              </div>
            </div>

            <div
              className="erp-workbench-queue-filter-strip"
              aria-label="工作台任务筛选"
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
                    onClick={() => selectWorkbenchQueue(option.key)}
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
                aria-label="优先处理"
              >
                <div className="erp-workbench-panel-head">
                  <div>
                    <Title level={5}>优先处理</Title>
                    <Text type="secondary">
                      按截止时间排列；选中任务后可在右侧查看详情。
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
                  pagination={
                    workbenchQueueTasks.length > WORKBENCH_QUEUE_PAGE_SIZE
                      ? {
                          current: activeWorkbenchQueuePage,
                          pageSize: WORKBENCH_QUEUE_PAGE_SIZE,
                          total: workbenchQueueTasks.length,
                          showLessItems: true,
                          showSizeChanger: false,
                          showTotal: (total, [start, end]) =>
                            `第 ${start}-${end} 项 / 共 ${total} 项`,
                          onChange: selectWorkbenchQueuePage,
                        }
                      : false
                  }
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
                    tabIndex: 0,
                    onClick: () =>
                      setSelectedWorkbenchTaskId(
                        String(record.id || record.task_code || '')
                      ),
                    onFocus: () =>
                      setSelectedWorkbenchTaskId(
                        String(record.id || record.task_code || '')
                      ),
                    'aria-selected':
                      String(record.id || record.task_code) ===
                      String(
                        selectedWorkbenchTask?.id ||
                          selectedWorkbenchTask?.task_code ||
                          ''
                      ),
                  })}
                  locale={{
                    emptyText: (
                      <WorkbenchQueueEmpty
                        activeOption={activeWorkbenchQueueOption}
                        fallbackOption={fallbackWorkbenchQueueOption}
                        onSwitchQueue={selectWorkbenchQueue}
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
                      <Text type="secondary">当前选中的任务</Text>
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
                        <Descriptions.Item label="负责岗位">
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
                          <Button disabled>正在确认可用操作</Button>
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
                        selectedWorkbenchTaskAccess.allowedModes.includes(
                          'resume'
                        ) ? (
                          <Button
                            type="primary"
                            onClick={() =>
                              openTaskDrawer(selectedWorkbenchTask, 'resume')
                            }
                          >
                            解除阻塞
                          </Button>
                        ) : null}
                        {showSelectedWorkbenchTaskReadonlyAction ? (
                          <Button
                            title={selectedWorkbenchTaskAccess.readonlyReason}
                            onClick={() =>
                              openTaskDrawer(selectedWorkbenchTask)
                            }
                          >
                            查看详情
                          </Button>
                        ) : null}
                        {selectedWorkbenchEntryPath ? (
                          <Button
                            onClick={() => openTaskEntry(selectedWorkbenchTask)}
                          >
                            查看相关单据
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
                            ? `当前任务列表暂无任务，可切到${fallbackWorkbenchQueueOption.label}。`
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
          style={
            taskBoardTransitionMinHeight > 0
              ? { minHeight: taskBoardTransitionMinHeight }
              : undefined
          }
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
                    label="常规待办"
                    value={
                      taskBoardReady ? taskBoardModel.counts.actionable : '-'
                    }
                    actionLabel="查看常规待办"
                    active={filters.lane === 'actionable'}
                    onClick={() => selectTaskBoardLane('actionable')}
                  />
                  <TaskMetricAction
                    label="阻塞"
                    value={
                      taskBoardReady ? taskBoardModel.counts.exception : '-'
                    }
                    actionLabel="查看阻塞和退回任务"
                    active={filters.lane === 'exception'}
                    danger={taskBoardModel.counts.exception > 0}
                    onClick={() => selectTaskBoardLane('exception')}
                  />
                  <TaskMetricAction
                    label="到期提醒"
                    value={taskBoardReady ? taskBoardModel.counts.due : '-'}
                    actionLabel="查看到期提醒"
                    active={filters.lane === 'due'}
                    danger={taskBoardModel.counts.due > 0}
                    onClick={() => selectTaskBoardLane('due')}
                  />
                  <TaskMetricAction
                    label="已结束"
                    value={
                      taskBoardReady ? taskBoardModel.counts.finished : '-'
                    }
                    actionLabel="查看已结束任务"
                    active={filters.lane === 'finished'}
                    onClick={() => selectTaskBoardLane('finished')}
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
                        type={
                          ['blocked', 'rejected'].includes(
                            getWorkflowTaskReasonMeta(taskCenterCurrentTask)
                              .kind
                          )
                            ? 'danger'
                            : 'secondary'
                        }
                        className="erp-task-center-current-meta"
                      >
                        {getWorkflowTaskReasonLabel(taskCenterCurrentTask)}：
                        {getWorkflowTaskReason(taskCenterCurrentTask)}
                      </Text>
                    ) : null}
                    <Space wrap className="erp-task-center-current-actions">
                      {taskCenterCurrentTaskAccess.loading ? (
                        <Button size="small" disabled>
                          正在确认可用操作
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
                      taskCenterCurrentTaskAccess.allowedModes.includes(
                        'resume'
                      ) ? (
                        <Button
                          size="small"
                          type="primary"
                          onClick={() =>
                            openTaskDrawer(taskCenterCurrentTask, 'resume')
                          }
                        >
                          解除阻塞
                        </Button>
                      ) : null}
                      {!taskCenterCurrentTaskAccess.loading &&
                      taskCenterCurrentTaskAccess.allowedModes.length === 0 ? (
                        <Button
                          size="small"
                          title={taskCenterCurrentTaskAccess.readonlyReason}
                          onClick={() => openTaskDrawer(taskCenterCurrentTask)}
                        >
                          查看详情
                        </Button>
                      ) : null}
                      {taskCenterCurrentEntryPath ? (
                        <Button
                          size="small"
                          onClick={() => openTaskEntry(taskCenterCurrentTask)}
                        >
                          查看相关单据
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
                value={taskBoardKeywordDraft}
                onChange={(event) => {
                  const nextKeyword = event.target.value
                  setTaskBoardKeywordDraft(nextKeyword)
                  if (!nextKeyword && filters.keyword) {
                    updateFilter('keyword', '')
                  }
                }}
                onSearch={(value) => updateFilter('keyword', value)}
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
              <div className="erp-task-board-filter-summary" aria-live="polite">
                <Text type="secondary">
                  筛选结果 {taskBoardReady ? taskBoardModel.total : '-'} 条
                </Text>
                {taskBoardModel.focused ? (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => selectTaskBoardLane('all')}
                  >
                    查看全部分类
                  </Button>
                ) : null}
              </div>
            </div>
            {taskBoardLoadError ? (
              <Alert
                type="error"
                showIcon
                message="任务看板加载失败"
                description={taskBoardLoadError}
              />
            ) : (
              <div
                ref={taskBoardLanesRef}
                className={`erp-task-board-lanes${
                  taskBoardModel.focused ? ' erp-task-board-lanes--focused' : ''
                }`}
                aria-label="任务看板分类"
              >
                {taskLanes.map((lane) => (
                  <TaskLane
                    key={lane.key}
                    lane={lane}
                    focused={taskBoardModel.focused}
                    page={taskBoardModel.page}
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
                    onViewAll={() => selectTaskBoardLane(lane.key)}
                    onPageChange={selectTaskBoardPage}
                  />
                ))}
              </div>
            )}
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
              异常处理
            </Title>
            <Paragraph type="secondary" className="erp-dashboard-summary">
              按“登记原因—分派负责人—跟进处理—确认恢复—关闭”的步骤处理异常。
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
                    description="这里处理的是异常任务，不代表库存、出货、应收、开票、付款或会计凭证已经完成。"
                  />
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="阻塞任务">
                      {exceptionTasks.length}
                    </Descriptions.Item>
                    <Descriptions.Item label="今日/超时任务">
                      {dueTasks.length}
                    </Descriptions.Item>
                    <Descriptions.Item label="建议处理方式">
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
                title="异常任务列表"
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
            ? '正在确认您是否可以处理当前任务。'
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
