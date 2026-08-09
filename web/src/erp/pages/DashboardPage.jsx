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
  Descriptions,
  Empty,
  Pagination,
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
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import WorkflowTaskActionDrawer, {
  TASK_ACTION_META,
  getWorkflowTaskActionMeta,
} from '../components/workflow/WorkflowTaskActionDrawer.jsx'
import {
  SearchInput,
  SelectFilter,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  getWorkflowWorkbench,
  getWorkflowTaskBoard,
  reassignWorkflowTask,
  rejectWorkflowTaskAction,
  resumeWorkflowTaskAction,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import useWorkflowTaskActionAccess from '../hooks/useWorkflowTaskActionAccess.js'
import useWorkflowTaskAssignmentAccess from '../hooks/useWorkflowTaskAssignmentAccess.js'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceTypeLabel,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import {
  getWorkflowTaskDueStatus,
  getWorkflowWorkbenchScopeKey,
} from '../utils/workflowDashboardStats.mjs'
import { isTerminalWorkflowTask } from '../utils/workflowTaskLifecycle.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../utils/workflowTaskActionSubmitGuard.mjs'
import { buildDesktopWorkflowTaskActionParams } from '../utils/desktopWorkflowTaskAction.mjs'
import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  isWorkflowTaskMutationResultUnknown,
  verifyNewWorkflowTaskMutationAttempt,
} from '../utils/workflowTaskMutation.mjs'
import {
  TASK_BOARD_DUE_OPTIONS,
  TASK_BOARD_STATUS_OPTIONS,
  buildWorkflowTaskBoardRoleOptions,
  buildWorkflowTaskBoardModel,
  buildWorkflowTaskBoardRequest,
  getWorkflowTaskDueLabel,
  getWorkflowTaskBoardRequestKey,
  getWorkflowTaskBoardSummaryRequestKey,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskReasonLabel,
  getWorkflowTaskReasonMeta,
  getWorkflowTaskReadonlyReason,
  getWorkflowTaskStatusMeta,
  getWorkflowTaskStatusRiskTags,
  hasActiveWorkflowTaskBoardFilters,
  readWorkflowTaskBoardFiltersFromSearch,
  resolveWorkflowTaskBoardResponseState,
  writeWorkflowTaskBoardFiltersToSearch,
} from '../utils/workflowTaskBoard.mjs'
import { openDashboardItemOnDoubleClick } from '../utils/dashboardDoubleClick.mjs'
import { canOpenWorkflowTaskEntry } from '../utils/workflowTaskEntryAccess.mjs'
import { getWorkflowTaskProcessingHint } from '../utils/workflowTaskProcessingHint.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import {
  canViewWorkflowApprovalInbox,
  getWorkflowApprovalInboxCapabilityKeys,
} from '../utils/workflowApprovalInbox.mjs'

const { Paragraph, Text, Title } = Typography

const WORKBENCH_QUEUE_OPTIONS = Object.freeze([
  { key: 'actionable', label: '待我处理', hint: '当前可推进' },
  {
    key: 'approval',
    label: '待我审批',
    hint: '当前审批事项',
    requiresApproval: true,
  },
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
    value: 11,
    note: '基础资料、销售、采购、物料清单、库存、质检、出货和财务',
  },
  {
    label: '系统设置',
    value: 4,
    note: '员工权限、操作记录、打印模板和客户业务设置',
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
          <section
            key={metric.label}
            className="erp-product-core-metric erp-metric-readonly-card"
            aria-label={`${metric.label} ${metric.value}，只读摘要`}
          >
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
  loading = false,
  focused,
  page,
  selectedTaskId,
  onSelectTask,
  onOpenTask,
  onViewAll,
  onPageChange,
}) {
  const shownStart = lane.tasks.length > 0 ? lane.offset + 1 : 0
  const shownEnd = lane.offset + lane.tasks.length
  return (
    <Card
      size="small"
      variant="borderless"
      className={`erp-task-board-lane erp-task-board-lane--${lane.key}`}
      loading={loading}
      aria-busy={loading}
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
            const taskId = getWorkflowTaskStableKey(task)
            const isSelected = taskId && taskId === selectedTaskId
            return (
              <div
                className={`erp-task-board-card${
                  isSelected ? ' erp-task-board-card--selected' : ''
                }`}
                key={`${lane.key}-${taskId || task.id}`}
                data-task-code={task.task_code || undefined}
                data-task-group={task.task_group || undefined}
                data-open-on-double-click="true"
                title="单击选中，双击查看任务详情"
                onClick={() => onSelectTask(task)}
                onDoubleClick={(event) =>
                  openDashboardItemOnDoubleClick(event, () => onOpenTask(task))
                }
                onFocusCapture={() => onSelectTask(task)}
              >
                <Space
                  className="erp-task-board-card-head"
                  align="start"
                  size={8}
                >
                  <Text strong className="erp-task-board-card-title">
                    {task.task_name || '未命名任务'}
                  </Text>
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
                  <Button
                    size="small"
                    aria-label={`查看${task.task_name || '任务'}详情`}
                    onClick={() => onOpenTask(task)}
                  >
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
  tone = 'actionable',
}) {
  return (
    <button
      type="button"
      className={[
        'erp-task-center-metric',
        `erp-task-center-metric--tone-${tone}`,
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

function isWorkflowTaskAccessChecking(access = {}) {
  return access.loading || access.source === 'fallback_checking'
}

function getWorkflowTaskPrimaryButtonLabel(access = {}) {
  if (access.canHandle) return '处理任务'
  if (access.urgeOnly) return '催办'
  return '查看详情'
}

function TaskProcessingHint({ task, access = {}, canOpenEntry = false }) {
  const hint = getWorkflowTaskProcessingHint({
    task,
    allowedActionModes: access.allowedModes,
    loading: isWorkflowTaskAccessChecking(access),
    failed: access.failed || access.source === 'fallback_failed',
    readonlyReason: access.readonlyReason,
    canOpenEntry,
    sourceAccess: access.sourceAccess,
  })

  return (
    <Alert
      type="info"
      showIcon
      className="erp-task-processing-hint"
      message={
        <div className="erp-task-processing-hint__head">
          <span>处理提示</span>
          <Text type="secondary">系统按任务状态、可用操作和关联入口生成</Text>
        </div>
      }
      description={hint}
    />
  )
}

export default function DashboardPage({ initialView = 'workbench' }) {
  const [loading, setLoading] = useState(false)
  const [workbenchResponseState, setWorkbenchResponseState] = useState(null)
  const [workbenchCountsState, setWorkbenchCountsState] = useState(null)
  const [taskBoardResponseState, setTaskBoardResponseState] = useState(null)
  const [taskBoardSummaryState, setTaskBoardSummaryState] = useState(null)
  const [taskBoardKeywordDraft, setTaskBoardKeywordDraft] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedTaskBoardTaskId, setSelectedTaskBoardTaskId] = useState('')
  const [actionMode, setActionMode] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [assignmentTarget, setAssignmentTarget] = useState()
  const [actionSaving, setActionSaving] = useState(false)
  const selectedTaskRef = useRef(selectedTask)
  selectedTaskRef.current = selectedTask
  const [activeView, setActiveView] = useState(initialView)
  const [workbenchQueueKey, setWorkbenchQueueKey] = useState('actionable')
  const [workbenchQueuePage, setWorkbenchQueuePage] = useState(1)
  const [selectedWorkbenchTaskId, setSelectedWorkbenchTaskId] = useState('')
  const [taskBoardTransitionMinHeight, setTaskBoardTransitionMinHeight] =
    useState(0)
  const mountedRef = useRef(false)
  const beginLatestRequest = useLatestRequestCoordinator()
  const taskBoardLanesRef = useRef(null)
  const pendingTaskBoardPageScrollRef = useRef(null)
  const pendingTaskBoardTransitionRequestKeyRef = useRef('')
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
  const workflowApprovalInboxCapabilityKeys = useMemo(
    () => getWorkflowApprovalInboxCapabilityKeys(adminProfile),
    [adminProfile]
  )
  const canViewApprovalInbox = canViewWorkflowApprovalInbox(adminProfile)
  const effectiveSessionCustomerKey =
    typeof adminProfile?.effective_session?.customer?.key === 'string'
      ? adminProfile.effective_session.customer.key.trim()
      : ''
  const shouldShowProductCoreDashboard =
    initialView === 'workbench' &&
    adminProfile?.is_super_admin === true &&
    !effectiveSessionCustomerKey
  const workflowWorkbenchScopeKey = useMemo(
    () =>
      JSON.stringify([
        getWorkflowWorkbenchScopeKey(adminProfile),
        workflowApprovalInboxCapabilityKeys,
      ]),
    [adminProfile, workflowApprovalInboxCapabilityKeys]
  )
  const workflowWorkbenchScopeKeyRef = useRef(workflowWorkbenchScopeKey)
  workflowWorkbenchScopeKeyRef.current = workflowWorkbenchScopeKey
  const requestedFilters = useMemo(
    () => readWorkflowTaskBoardFiltersFromSearch(searchParams),
    [searchParams]
  )
  const filters = useMemo(
    () =>
      requestedFilters.mode === 'approval' && !canViewApprovalInbox
        ? { ...requestedFilters, mode: 'all', page: 1 }
        : requestedFilters,
    [canViewApprovalInbox, requestedFilters]
  )
  const approvalInboxActive = filters.mode === 'approval'
  const isTaskBoardView = initialView === 'task-board'
  const taskBoardRequest = useMemo(
    () => buildWorkflowTaskBoardRequest(filters),
    [filters]
  )
  const taskBoardRequestKey = useMemo(
    () => getWorkflowTaskBoardRequestKey(taskBoardRequest),
    [taskBoardRequest]
  )
  const taskBoardSummaryRequestKey = useMemo(
    () => getWorkflowTaskBoardSummaryRequestKey(taskBoardRequest),
    [taskBoardRequest]
  )
  const workbenchRequest = useMemo(
    () => ({
      queue_key: workbenchQueueKey,
      limit: WORKBENCH_QUEUE_PAGE_SIZE,
      offset: (workbenchQueuePage - 1) * WORKBENCH_QUEUE_PAGE_SIZE,
    }),
    [workbenchQueueKey, workbenchQueuePage]
  )
  const workbenchRequestKey = useMemo(
    () => JSON.stringify([workflowWorkbenchScopeKey, workbenchRequest]),
    [workflowWorkbenchScopeKey, workbenchRequest]
  )
  const preserveTaskBoardTransitionHeight = useCallback(
    (nextRequest = taskBoardRequest) => {
      pendingTaskBoardTransitionRequestKeyRef.current =
        getWorkflowTaskBoardRequestKey(nextRequest)
      const taskBoardCard = taskBoardLanesRef.current?.closest?.(
        '.erp-dashboard-task-board-card'
      )
      const currentCardHeight = Math.ceil(
        taskBoardCard?.getBoundingClientRect().height || 0
      )
      setTaskBoardTransitionMinHeight(currentCardHeight)
    },
    [taskBoardRequest]
  )

  const loadDashboardStats = useCallback(async () => {
    const request = beginLatestRequest('dashboard-load')
    const requestWorkbenchScopeKey = workflowWorkbenchScopeKey
    if (shouldShowProductCoreDashboard) {
      setWorkbenchResponseState(null)
      setWorkbenchCountsState(null)
      setLoading(false)
      request.finish()
      return true
    }
    if (isTaskBoardView && mountedRef.current) {
      preserveTaskBoardTransitionHeight(taskBoardRequest)
    }
    setLoading(true)
    if (isTaskBoardView && mountedRef.current) {
      setTaskBoardResponseState({
        requestKey: taskBoardRequestKey,
        response: null,
        error: '',
      })
    } else if (mountedRef.current) {
      setWorkbenchResponseState((current) => ({
        scopeKey: requestWorkbenchScopeKey,
        requestKey: workbenchRequestKey,
        response:
          current?.scopeKey === requestWorkbenchScopeKey &&
          current?.response?.queue_key === workbenchRequest.queue_key
            ? current.response
            : null,
        error: '',
      }))
    }
    try {
      if (isTaskBoardView) {
        const taskBoardResult = await getWorkflowTaskBoard(taskBoardRequest, {
          signal: request.signal,
        })
        if (
          mountedRef.current &&
          request.isCurrent() &&
          workflowWorkbenchScopeKeyRef.current === requestWorkbenchScopeKey
        ) {
          setTaskBoardResponseState({
            requestKey: taskBoardRequestKey,
            response: taskBoardResult,
            error: '',
          })
          setTaskBoardSummaryState({
            requestKey: taskBoardSummaryRequestKey,
            response: taskBoardResult,
          })
        }
      } else {
        const workbenchResult = await getWorkflowWorkbench(workbenchRequest, {
          signal: request.signal,
        })
        if (
          mountedRef.current &&
          request.isCurrent() &&
          workflowWorkbenchScopeKeyRef.current === requestWorkbenchScopeKey
        ) {
          setWorkbenchResponseState({
            scopeKey: requestWorkbenchScopeKey,
            requestKey: workbenchRequestKey,
            response: workbenchResult,
            error: '',
          })
          setWorkbenchCountsState({
            scopeKey: requestWorkbenchScopeKey,
            counts: workbenchResult.counts,
          })
        }
      }
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      if (
        mountedRef.current &&
        request.isCurrent() &&
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
        } else {
          setWorkbenchResponseState({
            scopeKey: requestWorkbenchScopeKey,
            requestKey: workbenchRequestKey,
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
        request.isCurrent() &&
        workflowWorkbenchScopeKeyRef.current === requestWorkbenchScopeKey
      ) {
        setLoading(false)
      }
      request.finish()
    }
  }, [
    beginLatestRequest,
    isTaskBoardView,
    preserveTaskBoardTransitionHeight,
    shouldShowProductCoreDashboard,
    taskBoardRequest,
    taskBoardRequestKey,
    taskBoardSummaryRequestKey,
    workbenchRequest,
    workbenchRequestKey,
    workflowWorkbenchScopeKey,
  ])

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

  useEffect(() => {
    if (
      !isTaskBoardView ||
      canViewApprovalInbox ||
      requestedFilters.mode !== 'approval'
    ) {
      return
    }
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, filters),
      { replace: true }
    )
  }, [
    canViewApprovalInbox,
    filters,
    isTaskBoardView,
    requestedFilters.mode,
    searchParams,
    setSearchParams,
  ])

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
  const taskBoardSummaryResponse =
    taskBoardSummaryState?.requestKey === taskBoardSummaryRequestKey
      ? taskBoardSummaryState.response
      : null
  const taskBoardModel = useMemo(
    () => buildWorkflowTaskBoardModel(taskBoardResponse, filters),
    [filters, taskBoardResponse]
  )
  const taskBoardReady = Boolean(taskBoardResponse) && !taskBoardLoadError
  const taskBoardHasLoaded = Boolean(taskBoardSummaryState?.response)
  const taskBoardMetricsReady =
    Boolean(taskBoardSummaryResponse) || taskBoardReady
  const taskBoardCounts =
    taskBoardSummaryResponse?.counts || taskBoardModel.counts
  const taskBoardTotal = taskBoardSummaryResponse?.total ?? taskBoardModel.total
  const taskBoardInitialLoading =
    isTaskBoardView &&
    !taskBoardHasLoaded &&
    !taskBoardResponse &&
    !taskBoardLoadError
  const taskBoardUpdating =
    isTaskBoardView &&
    taskBoardHasLoaded &&
    !taskBoardResponse &&
    !taskBoardLoadError
  const taskLanes = useMemo(
    () =>
      taskBoardModel.visibleLanes.map((lane) => ({
        ...lane,
        count: taskBoardMetricsReady ? taskBoardCounts[lane.key] : lane.count,
      })),
    [taskBoardCounts, taskBoardMetricsReady, taskBoardModel.visibleLanes]
  )
  const taskBoardVisibleTasks = useMemo(
    () => taskLanes.flatMap((lane) => lane.tasks),
    [taskLanes]
  )
  const sourceOptions = useMemo(
    () =>
      buildSourceOptions([
        ...(taskBoardSummaryResponse?.source_types ||
          taskBoardModel.sourceTypes),
        filters.sourceType === 'all' ? '' : filters.sourceType,
      ]),
    [
      filters.sourceType,
      taskBoardModel.sourceTypes,
      taskBoardSummaryResponse?.source_types,
    ]
  )
  const roleOptions = useMemo(
    () =>
      buildWorkflowTaskBoardRoleOptions(
        taskBoardSummaryResponse?.owner_role_keys ||
          taskBoardModel.ownerRoleKeys
      ),
    [taskBoardModel.ownerRoleKeys, taskBoardSummaryResponse?.owner_role_keys]
  )
  const actionMeta = actionMode
    ? getWorkflowTaskActionMeta(selectedTask, actionMode)
    : null
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

  useEffect(() => {
    if (
      !taskBoardReady ||
      filters.role === 'all' ||
      taskBoardModel.ownerRoleKeys.includes(filters.role)
    ) {
      return
    }
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        role: 'all',
        page: 1,
      }),
      { replace: true }
    )
  }, [
    filters,
    searchParams,
    setSearchParams,
    taskBoardModel.ownerRoleKeys,
    taskBoardReady,
  ])

  useLayoutEffect(() => {
    const pendingScroll = pendingTaskBoardPageScrollRef.current
    if (
      !pendingTaskBoardTransitionRequestKeyRef.current ||
      pendingTaskBoardTransitionRequestKeyRef.current !== taskBoardRequestKey ||
      loading ||
      !taskBoardReady ||
      taskBoardTransitionMinHeight <= 0
    ) {
      return
    }

    if (pendingScroll) {
      if (
        !taskBoardModel.focused ||
        filters.lane !== pendingScroll.lane ||
        taskBoardModel.page !== pendingScroll.page
      ) {
        return
      }
      scrollTaskBoardLanesToStart(taskBoardLanesRef.current)
      pendingTaskBoardPageScrollRef.current = null
    }
    pendingTaskBoardTransitionRequestKeyRef.current = ''
    setTaskBoardTransitionMinHeight(0)
  }, [
    filters.lane,
    loading,
    taskBoardModel.focused,
    taskBoardModel.page,
    taskBoardReady,
    taskBoardRequestKey,
    taskBoardTransitionMinHeight,
  ])

  useEffect(() => {
    if (!taskBoardLoadError) return
    pendingTaskBoardPageScrollRef.current = null
    pendingTaskBoardTransitionRequestKeyRef.current = ''
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
      pendingTaskBoardTransitionRequestKeyRef.current =
        getWorkflowTaskBoardRequestKey(
          buildWorkflowTaskBoardRequest({
            ...filters,
            page: taskBoardModel.pageCount,
          })
        )
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

  const workbenchResponse =
    workbenchResponseState?.scopeKey === workflowWorkbenchScopeKey &&
    workbenchResponseState?.requestKey === workbenchRequestKey
      ? workbenchResponseState.response
      : null
  const workbenchLoadError =
    workbenchResponseState?.scopeKey === workflowWorkbenchScopeKey &&
    workbenchResponseState?.requestKey === workbenchRequestKey
      ? workbenchResponseState.error
      : ''
  const workbenchCounts =
    workbenchCountsState?.scopeKey === workflowWorkbenchScopeKey
      ? workbenchCountsState.counts
      : null
  const visibleWorkbenchQueueOptions = useMemo(
    () =>
      WORKBENCH_QUEUE_OPTIONS.filter(
        (option) => !option.requiresApproval || canViewApprovalInbox
      ),
    [canViewApprovalInbox]
  )
  const workbenchQueueTotal = Number(workbenchCounts?.[workbenchQueueKey] || 0)
  const activeWorkbenchQueueOption =
    visibleWorkbenchQueueOptions.find(
      (option) => option.key === workbenchQueueKey
    ) || visibleWorkbenchQueueOptions[0]
  const fallbackWorkbenchQueueOption =
    visibleWorkbenchQueueOptions.find(
      (option) =>
        option.key !== workbenchQueueKey &&
        Number(workbenchCounts?.[option.key] || 0) > 0
    ) || null
  const workbenchQueuePageCount = Math.max(
    1,
    Math.ceil(workbenchQueueTotal / WORKBENCH_QUEUE_PAGE_SIZE)
  )
  const activeWorkbenchQueuePage = Math.min(
    workbenchQueuePage,
    workbenchQueuePageCount
  )
  const workbenchQueuePageTasks = useMemo(
    () => workbenchResponse?.items || [],
    [workbenchResponse]
  )
  useEffect(() => {
    if (!workbenchResponse || workbenchQueuePage <= workbenchQueuePageCount) {
      return
    }
    setWorkbenchQueuePage(workbenchQueuePageCount)
    setSelectedWorkbenchTaskId('')
  }, [workbenchQueuePage, workbenchQueuePageCount, workbenchResponse])
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
  const selectedWorkbenchCanOpenEntry = canOpenWorkflowTaskEntry(
    adminProfile,
    selectedWorkbenchEntryPath,
    selectedWorkbenchTaskAccess.sourceAccess
  )
  const taskCenterCurrentCanOpenEntry = canOpenWorkflowTaskEntry(
    adminProfile,
    taskCenterCurrentEntryPath,
    taskCenterCurrentTaskAccess.sourceAccess
  )
  const actionDrawerEntryPath = selectedTask
    ? resolveWorkflowTaskEntryPath(selectedTask)
    : ''
  const actionDrawerCanOpenEntry = canOpenWorkflowTaskEntry(
    adminProfile,
    actionDrawerEntryPath,
    actionDrawerAccess.sourceAccess
  )
  const actionDrawerCanViewAttachments = hasActionPermission(
    adminProfile,
    'workflow.task.read'
  )
  const actionDrawerCanManageAttachments =
    actionDrawerAccess.canHandle &&
    hasActionPermission(adminProfile, 'workflow.task.update')
  const assignmentAccess = useWorkflowTaskAssignmentAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask),
  })
  const actionDrawerAllowedModes = useMemo(
    () =>
      assignmentAccess.can_reassign
        ? [...actionDrawerAccess.allowedModes, 'assign']
        : actionDrawerAccess.allowedModes,
    [actionDrawerAccess.allowedModes, assignmentAccess.can_reassign]
  )

  useEffect(() => {
    if (
      visibleWorkbenchQueueOptions.some(
        (option) => option.key === workbenchQueueKey
      )
    ) {
      return
    }
    setWorkbenchQueueKey('actionable')
    setWorkbenchQueuePage(1)
    setSelectedWorkbenchTaskId('')
  }, [visibleWorkbenchQueueOptions, workbenchQueueKey])

  useEffect(() => {
    if (workbenchQueuePage === activeWorkbenchQueuePage) return
    setWorkbenchQueuePage(activeWorkbenchQueuePage)
    setSelectedWorkbenchTaskId('')
  }, [activeWorkbenchQueuePage, workbenchQueuePage])

  const updateFilter = (key, value) => {
    const nextFilters = {
      ...filters,
      [key]: value,
      page: 1,
    }
    pendingTaskBoardPageScrollRef.current = null
    preserveTaskBoardTransitionHeight(
      buildWorkflowTaskBoardRequest(nextFilters)
    )
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, nextFilters),
      { replace: true }
    )
  }

  const clearFilters = () => {
    pendingTaskBoardPageScrollRef.current = null
    preserveTaskBoardTransitionHeight(buildWorkflowTaskBoardRequest({}))
    setSearchParams(writeWorkflowTaskBoardFiltersToSearch(searchParams), {
      replace: true,
    })
  }

  const selectTaskBoardLane = (lane) => {
    const nextFilters = {
      ...filters,
      lane,
      page: 1,
    }
    pendingTaskBoardPageScrollRef.current = null
    preserveTaskBoardTransitionHeight(
      buildWorkflowTaskBoardRequest(nextFilters)
    )
    setSelectedTaskBoardTaskId('')
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, nextFilters),
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
    pendingTaskBoardPageScrollRef.current = {
      lane: filters.lane,
      page: nextPage,
    }
    preserveTaskBoardTransitionHeight(
      buildWorkflowTaskBoardRequest({
        ...filters,
        page: nextPage,
      })
    )
    setSelectedTaskBoardTaskId('')
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        page: nextPage,
      }),
      { replace: true }
    )
  }

  const openTaskEntry = (task, access) => {
    const entryPath = resolveWorkflowTaskEntryPath(task)
    if (
      canOpenWorkflowTaskEntry(adminProfile, entryPath, access?.sourceAccess)
    ) {
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
    if (actionSaving) return
    const nextMode = TASK_ACTION_META[mode] ? mode : ''
    setSelectedTask(task)
    setActionMode(nextMode)
    setActionReason(nextMode === 'block' ? getWorkflowTaskReason(task) : '')
    setAssignmentTarget(undefined)
  }

  const closeTaskDrawer = () => {
    if (actionSaving) return
    setSelectedTask(null)
    setActionMode('')
    setActionReason('')
    setAssignmentTarget(undefined)
  }

  const changeTaskActionMode = (nextMode) => {
    setActionMode(nextMode)
    setAssignmentTarget(undefined)
  }

  const submitTaskAction = async ({ processDecision = null } = {}) => {
    if (!selectedTask || !actionMode || !actionMeta) return

    const taskSnapshot = selectedTask
    const taskIdentity = getWorkflowTaskStableKey(taskSnapshot)
    const actionModeSnapshot = actionMode
    const actionMetaSnapshot = actionMeta
    const actionAccessSnapshot = actionDrawerAccess
    const assignmentAccessSnapshot = assignmentAccess
    const assignmentTargetSnapshot = assignmentTarget
    const reason = actionReason.trim()
    if (actionMetaSnapshot.requireReason && !reason) {
      message.warning(`${actionMetaSnapshot.title}需要填写原因`)
      return
    }
    const scope = `${taskSnapshot.id}:${actionModeSnapshot}`
    const operation = actionModeSnapshot
    const mutate =
      actionModeSnapshot === 'assign'
        ? reassignWorkflowTask
        : actionModeSnapshot === 'urge'
          ? urgeWorkflowTask
          : actionModeSnapshot === 'complete'
            ? completeWorkflowTaskAction
            : actionModeSnapshot === 'block'
              ? blockWorkflowTaskAction
              : actionModeSnapshot === 'reject'
                ? rejectWorkflowTaskAction
                : resumeWorkflowTaskAction
    let params
    try {
      params = buildDesktopWorkflowTaskActionParams({
        task: taskSnapshot,
        actionMode: actionModeSnapshot,
        reason,
        assignmentTarget: assignmentTargetSnapshot,
        processDecision,
      })
    } catch (error) {
      message.warning(
        getActionErrorMessage(
          error,
          '审批表单与当前流程节点不一致，请刷新后重试'
        )
      )
      return
    }
    const inFlightLease = mutationInFlightRef.current.acquire(
      `task:${taskSnapshot.id}`
    )
    if (!inFlightLease) return
    setActionSaving(true)
    const closeSubmittedTaskDrawer = () => {
      if (getWorkflowTaskStableKey(selectedTaskRef.current) !== taskIdentity) {
        return false
      }
      setSelectedTask(null)
      setActionMode('')
      setActionReason('')
      setAssignmentTarget(undefined)
      return true
    }
    try {
      const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
        attemptStore: mutationAttemptsRef.current,
        scope,
        operation,
        params,
        verify: async () => {
          if (isTerminalWorkflowTask(taskSnapshot)) {
            message.warning('已结束任务不能继续处理')
            return false
          }
          if (
            actionModeSnapshot === 'assign' &&
            assignmentAccessSnapshot.loading
          ) {
            message.warning('正在确认可转交人员，请稍后再提交')
            return false
          }
          if (actionModeSnapshot === 'assign') {
            const targetAllowed =
              assignmentTargetSnapshot === 'pool'
                ? assignmentAccessSnapshot.can_return_to_pool
                : assignmentAccessSnapshot.candidates.some(
                    (candidate) =>
                      candidate.admin_id === assignmentTargetSnapshot
                  )
            if (
              assignmentAccessSnapshot.failed ||
              assignmentAccessSnapshot.stale ||
              !assignmentAccessSnapshot.can_reassign ||
              !targetAllowed
            ) {
              message.warning(
                assignmentAccessSnapshot.reason || '转交去向已失效，请重新选择'
              )
              return false
            }
            return true
          }
          if (actionAccessSnapshot.loading) {
            message.warning('正在确认这项操作是否可用，请稍后再提交')
            return false
          }
          if (!actionAccessSnapshot.canRun(actionModeSnapshot)) {
            message.warning(
              actionAccessSnapshot.getReason(actionModeSnapshot) ||
                getWorkflowTaskReadonlyReason(adminProfile, taskSnapshot)
            )
            return false
          }
          return verifyWorkflowTaskActionAccessBeforeSubmit({
            task: taskSnapshot,
            actionKey: actionModeSnapshot,
            reason,
            onWarning: message.warning,
            onError: message.error,
          })
        },
      })
      if (!accessVerified) return

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
            getActionErrorMessage(error, `${actionMetaSnapshot.title}失败`)
          )
          closeSubmittedTaskDrawer()
          await loadDashboardStats().catch(() => {})
        }
        return
      }
      closeSubmittedTaskDrawer()
      message.success(actionMetaSnapshot.successMessage)
      try {
        await loadDashboardStats()
      } catch {
        message.warning('操作已成功但列表刷新失败，请手动刷新')
      }
    } finally {
      setActionSaving(false)
      mutationInFlightRef.current.release(inFlightLease)
    }
  }

  const workbenchTaskColumns = [
    {
      title: '状态 / 风险',
      key: 'task_priority',
      width: 132,
      render: (_, record) => {
        return (
          <Space
            className="erp-workbench-task-status-risk"
            size={[4, 4]}
            style={{ width: '100%' }}
            wrap
          >
            {getWorkflowTaskStatusRiskTags(record).map((tag) => (
              <Tag
                key={tag.key}
                color={tag.color}
                style={{ marginInlineEnd: 0 }}
              >
                {tag.label}
              </Tag>
            ))}
          </Space>
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
      <div
        hidden
        aria-hidden="true"
        data-testid="dashboard-workflow-task-evidence"
      >
        {workbenchQueuePageTasks.map((task) => (
          <span
            key={task.id || task.task_code}
            data-task-code={task.task_code || undefined}
            data-task-group={task.task_group || undefined}
            data-task-terminal={String(isTerminalWorkflowTask(task))}
          />
        ))}
      </div>
      {shouldShowProductCoreDashboard ? (
        <ProductCoreDashboard onNavigate={openProductCoreEntry} />
      ) : null}

      {!shouldShowProductCoreDashboard && activeView === 'workbench' ? (
        <Card
          className="erp-dashboard-card erp-workbench-command-card"
          variant="borderless"
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
              {visibleWorkbenchQueueOptions.map((option) => {
                const count = workbenchCounts?.[option.key]
                const countReady = Number.isSafeInteger(count)
                const active = option.key === workbenchQueueKey
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={[
                      'erp-workbench-queue-filter',
                      active ? 'erp-workbench-queue-filter--active' : '',
                      option.key === 'risk' && countReady && count > 0
                        ? 'erp-workbench-queue-filter--danger'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={active}
                    aria-label={
                      countReady
                        ? `${option.label}，${count} 项，${option.hint}`
                        : `${option.label}，数量读取中，${option.hint}`
                    }
                    onClick={() => selectWorkbenchQueue(option.key)}
                  >
                    <span>{option.label}</span>
                    <strong>{countReady ? count : '—'}</strong>
                  </button>
                )
              })}
            </div>

            <div className="erp-workbench-main-grid">
              <section
                className="erp-workbench-panel erp-workbench-queue-panel"
                aria-label="优先处理"
                aria-busy={loading}
              >
                <div className="erp-workbench-panel-head">
                  <div>
                    <Title level={5}>优先处理</Title>
                    <Text type="secondary">
                      单击任务可在右侧查看；电脑端双击可直接打开详情。
                    </Text>
                  </div>
                  <Tag color={workbenchQueueTotal > 0 ? 'blue' : 'default'}>
                    {activeWorkbenchQueueOption.label}{' '}
                    {workbenchCounts ? workbenchQueueTotal : '—'}
                  </Tag>
                </div>
                {workbenchLoadError ? (
                  <Alert
                    type="error"
                    showIcon
                    message="工作台任务加载失败"
                    description={workbenchLoadError}
                    action={
                      <Button size="small" onClick={loadDashboardStats}>
                        重新加载
                      </Button>
                    }
                  />
                ) : null}
                <Table
                  size="small"
                  rowKey={(record) => record.id || record.task_code}
                  columns={workbenchTaskColumns}
                  dataSource={workbenchQueuePageTasks}
                  loading={{ spinning: loading, delay: 120 }}
                  pagination={
                    workbenchQueueTotal > WORKBENCH_QUEUE_PAGE_SIZE
                      ? {
                          current: activeWorkbenchQueuePage,
                          pageSize: WORKBENCH_QUEUE_PAGE_SIZE,
                          total: workbenchQueueTotal,
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
                    [
                      'erp-workbench-task-row--openable',
                      String(record.id || record.task_code) ===
                      String(
                        selectedWorkbenchTask?.id ||
                          selectedWorkbenchTask?.task_code ||
                          ''
                      )
                        ? 'erp-workbench-task-row--active'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                  onRow={(record) => ({
                    tabIndex: 0,
                    title: '单击选中，双击查看任务详情',
                    'data-task-code': record.task_code || undefined,
                    'data-task-group': record.task_group || undefined,
                    'data-open-on-double-click': 'true',
                    onClick: () =>
                      setSelectedWorkbenchTaskId(
                        String(record.id || record.task_code || '')
                      ),
                    onDoubleClick: (event) =>
                      openDashboardItemOnDoubleClick(event, () =>
                        openTaskDrawer(record)
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
                      <TaskProcessingHint
                        task={selectedWorkbenchTask}
                        access={selectedWorkbenchTaskAccess}
                        canOpenEntry={selectedWorkbenchCanOpenEntry}
                      />
                      <Space wrap className="erp-workbench-detail-actions">
                        {isWorkflowTaskAccessChecking(
                          selectedWorkbenchTaskAccess
                        ) ? (
                          <Button disabled>正在确认可用操作</Button>
                        ) : (
                          <Button
                            type={
                              selectedWorkbenchTaskAccess.allowedModes.length >
                              0
                                ? 'primary'
                                : 'default'
                            }
                            title={
                              selectedWorkbenchTaskAccess.allowedModes.length >
                              0
                                ? undefined
                                : selectedWorkbenchTaskAccess.readonlyReason
                            }
                            onClick={() =>
                              openTaskDrawer(selectedWorkbenchTask)
                            }
                          >
                            {getWorkflowTaskPrimaryButtonLabel(
                              selectedWorkbenchTaskAccess
                            )}
                          </Button>
                        )}
                        {selectedWorkbenchCanOpenEntry ? (
                          <Button
                            onClick={() =>
                              openTaskEntry(
                                selectedWorkbenchTask,
                                selectedWorkbenchTaskAccess
                              )
                            }
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
          loading={taskBoardInitialLoading}
          style={
            taskBoardTransitionMinHeight > 0
              ? { minHeight: taskBoardTransitionMinHeight }
              : undefined
          }
        >
          <div className="erp-dashboard-block">
            <div className="erp-task-center-overview">
              <section className="erp-task-center-summary">
                <div>
                  <Space wrap align="center">
                    <Title level={3} className="erp-command-center-hero-title">
                      {approvalInboxActive ? '待我审批' : '任务看板'}
                    </Title>
                    {canViewApprovalInbox ? (
                      <Button
                        type={approvalInboxActive ? 'primary' : 'default'}
                        onClick={() =>
                          updateFilter(
                            'mode',
                            approvalInboxActive ? 'all' : 'approval'
                          )
                        }
                      >
                        {approvalInboxActive ? '返回全部任务' : '待我审批'}
                      </Button>
                    ) : null}
                  </Space>
                  <Paragraph className="erp-dashboard-summary">
                    {approvalInboxActive
                      ? '只显示服务端登记为审批节点且当前账号可见的事项；审批仍受岗位、指定处理人、配置版本和单据状态约束。'
                      : '看清谁该处理、哪里卡住、哪些已经超时；电脑端可双击任务卡快速查看详情。'}
                  </Paragraph>
                </div>
                <div
                  className="erp-task-center-metrics"
                  aria-label="任务看板关键筛选"
                >
                  <TaskMetricAction
                    label="常规待办"
                    tone="actionable"
                    value={
                      taskBoardMetricsReady ? taskBoardCounts.actionable : '-'
                    }
                    actionLabel="查看常规待办"
                    active={filters.lane === 'actionable'}
                    onClick={() => selectTaskBoardLane('actionable')}
                  />
                  <TaskMetricAction
                    label="阻塞"
                    tone="exception"
                    value={
                      taskBoardMetricsReady ? taskBoardCounts.exception : '-'
                    }
                    actionLabel="查看阻塞任务"
                    active={filters.lane === 'exception'}
                    danger={taskBoardCounts.exception > 0}
                    onClick={() => selectTaskBoardLane('exception')}
                  />
                  <TaskMetricAction
                    label="到期提醒"
                    tone="due"
                    value={taskBoardMetricsReady ? taskBoardCounts.due : '-'}
                    actionLabel="查看到期提醒"
                    active={filters.lane === 'due'}
                    danger={taskBoardCounts.due > 0}
                    onClick={() => selectTaskBoardLane('due')}
                  />
                  <TaskMetricAction
                    label="已结束"
                    tone="finished"
                    value={
                      taskBoardMetricsReady ? taskBoardCounts.finished : '-'
                    }
                    actionLabel="查看已结束任务"
                    active={filters.lane === 'finished'}
                    onClick={() => selectTaskBoardLane('finished')}
                  />
                </div>
                <Text type="secondary" className="erp-task-center-metrics-note">
                  {taskBoardMetricsReady
                    ? `当前筛选共 ${taskBoardTotal} 项；四类任务互不重复，点击指标可查看对应任务。`
                    : '任务数量读取完成后，可点击指标查看对应任务。'}
                </Text>
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
                    <TaskProcessingHint
                      task={taskCenterCurrentTask}
                      access={taskCenterCurrentTaskAccess}
                      canOpenEntry={taskCenterCurrentCanOpenEntry}
                    />
                    <Space wrap className="erp-task-center-current-actions">
                      {isWorkflowTaskAccessChecking(
                        taskCenterCurrentTaskAccess
                      ) ? (
                        <Button size="small" disabled>
                          正在确认可用操作
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          type={
                            taskCenterCurrentTaskAccess.allowedModes.length > 0
                              ? 'primary'
                              : 'default'
                          }
                          title={
                            taskCenterCurrentTaskAccess.allowedModes.length > 0
                              ? undefined
                              : taskCenterCurrentTaskAccess.readonlyReason
                          }
                          onClick={() => openTaskDrawer(taskCenterCurrentTask)}
                        >
                          {getWorkflowTaskPrimaryButtonLabel(
                            taskCenterCurrentTaskAccess
                          )}
                        </Button>
                      )}
                      {taskCenterCurrentCanOpenEntry ? (
                        <Button
                          size="small"
                          onClick={() =>
                            openTaskEntry(
                              taskCenterCurrentTask,
                              taskCenterCurrentTaskAccess
                            )
                          }
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
              <SearchInput
                placeholder="搜索任务"
                searchHint="可搜索：任务、单号、来源、处理原因"
                value={taskBoardKeywordDraft}
                onChange={(event) => {
                  const nextKeyword = event.target.value
                  setTaskBoardKeywordDraft(nextKeyword)
                  if (!nextKeyword && filters.keyword) {
                    updateFilter('keyword', '')
                  }
                }}
                onPressEnter={(event) =>
                  updateFilter('keyword', event.currentTarget.value)
                }
              />
              <SelectFilter
                value={filters.status}
                options={TASK_BOARD_STATUS_OPTIONS}
                onChange={(value) => updateFilter('status', value)}
              />
              {roleOptions.length > 1 ? (
                <SelectFilter
                  aria-label="负责岗位"
                  value={filters.role}
                  options={roleOptions}
                  onChange={(value) => updateFilter('role', value)}
                />
              ) : null}
              <SelectFilter
                value={filters.due}
                options={TASK_BOARD_DUE_OPTIONS}
                onChange={(value) => updateFilter('due', value)}
              />
              <SelectFilter
                value={filters.sourceType}
                options={sourceOptions}
                onChange={(value) => updateFilter('sourceType', value)}
              />
              <ToolbarButton
                disabled={!hasActiveFilters}
                onClick={clearFilters}
              >
                清空筛选
              </ToolbarButton>
              <div className="erp-task-board-filter-summary" aria-live="polite">
                <Text type="secondary">
                  筛选结果 {taskBoardMetricsReady ? taskBoardTotal : '-'} 条
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
                aria-busy={taskBoardUpdating}
              >
                {taskLanes.map((lane) => (
                  <TaskLane
                    key={lane.key}
                    lane={lane}
                    loading={taskBoardUpdating}
                    focused={taskBoardModel.focused}
                    page={taskBoardModel.page}
                    selectedTaskId={selectedTaskBoardTaskId}
                    onSelectTask={selectTaskBoardTask}
                    onOpenTask={(task) => {
                      selectTaskBoardTask(task)
                      openTaskDrawer(task)
                    }}
                    onViewAll={() => selectTaskBoardLane(lane.key)}
                    onPageChange={selectTaskBoardPage}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : null}

      <WorkflowTaskActionDrawer
        task={selectedTask}
        actionMode={actionMode}
        actionReason={actionReason}
        actionSaving={actionSaving}
        actionAvailabilityLoading={
          actionDrawerAccess.loading ||
          actionDrawerAccess.source === 'fallback_checking'
        }
        allowedActionModes={actionDrawerAllowedModes}
        readonlyReason={
          actionDrawerAccess.loading
            ? '正在确认您是否可以处理当前任务。'
            : actionDrawerAccess.readonlyReason ||
              getTaskReadonlyNotice(selectedTask)
        }
        assignmentAccess={assignmentAccess}
        assignmentTarget={assignmentTarget}
        canOpenEntry={actionDrawerCanOpenEntry}
        canViewAttachments={actionDrawerCanViewAttachments}
        canManageAttachments={actionDrawerCanManageAttachments}
        onActionModeChange={changeTaskActionMode}
        onActionReasonChange={setActionReason}
        onAssignmentTargetChange={setAssignmentTarget}
        onClose={closeTaskDrawer}
        onOpenEntry={(task) => openTaskEntry(task, actionDrawerAccess)}
        onSubmit={submitTaskAction}
      />
    </Space>
  )
}
