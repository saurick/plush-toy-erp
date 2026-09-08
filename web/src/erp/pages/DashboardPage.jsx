import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Empty,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
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
import WorkflowTaskIdentity from '../components/workflow/WorkflowTaskIdentity.jsx'
import WorkflowTaskCard from '../components/workflow/WorkflowTaskCard.jsx'
import { WorkflowTaskSource } from '../components/workflow/WorkflowTaskCopy.jsx'
import WorkflowTaskTiming from '../components/workflow/WorkflowTaskTiming.jsx'
import WorkflowTaskPagination from '../components/workflow/WorkflowTaskPagination.jsx'
import { retainWorkflowTaskIdentity } from '../utils/workflowTaskIdentity.mjs'
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
  getWorkflowTaskSourceTypeLabel,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import { getWorkflowWorkbenchScopeKey } from '../utils/workflowDashboardStats.mjs'
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
  TASK_BOARD_FOCUS_PAGE_SIZE,
  TASK_BOARD_LANE_DEFINITIONS,
  TASK_BOARD_SORT_OPTIONS,
  TASK_BOARD_STATUS_OPTIONS,
  buildWorkflowTaskBoardRoleOptions,
  buildWorkflowTaskBoardModel,
  buildWorkflowTaskBoardRequest,
  getWorkflowTaskBoardRequestKey,
  getWorkflowTaskBoardSummaryRequestKey,
  getWorkflowTaskBoardStatusOptions,
  getWorkflowTaskBoardDueOptions,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskReasonMeta,
  getWorkflowTaskReadonlyReason,
  getWorkflowTaskStatusMeta,
  getWorkflowTaskStatusRiskTags,
  hasActiveWorkflowTaskBoardFilters,
  normalizeWorkflowTaskPageSize,
  readWorkflowTaskBoardFiltersFromSearch,
  resolveWorkflowTaskBoardResponseState,
  writeWorkflowTaskBoardFiltersToSearch,
} from '../utils/workflowTaskBoard.mjs'
import { canOpenWorkflowTaskEntry } from '../utils/workflowTaskEntryAccess.mjs'
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

const TASK_BOARD_SCOPE_OPTIONS = Object.freeze([
  {
    label: '全部任务',
    value: 'all',
    icon: <CheckOutlined aria-hidden="true" />,
  },
  {
    label: '待我审批',
    value: 'approval',
    icon: <CheckOutlined aria-hidden="true" />,
  },
])

const WORKBENCH_QUEUE_PAGE_SIZE = TASK_BOARD_FOCUS_PAGE_SIZE
const TASK_BOARD_PAGE_SCROLL_GAP = 12

function scrollTaskListToStart(lanesElement) {
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

function TaskTitleEntry({ task, onOpenTask }) {
  const name = task.task_name || '未命名任务'
  return (
    <button
      type="button"
      className="erp-task-title-entry"
      aria-label={`查看${name}详情`}
      aria-haspopup="dialog"
      onClick={(event) => {
        event.stopPropagation()
        event.currentTarget.focus({ preventScroll: true })
        onOpenTask(task)
      }}
    >
      <span>{name}</span>
      <ArrowRightOutlined aria-hidden="true" />
    </button>
  )
}

function openTaskTableRow(event, task, onOpenTask) {
  if (
    event.target.closest(
      'button, a, input, textarea, select, label, summary, [role="button"], [role="link"], [role="combobox"]'
    )
  ) {
    return
  }
  const selection = event.currentTarget.ownerDocument.getSelection()
  if (
    selection &&
    !selection.isCollapsed &&
    event.currentTarget.contains(selection.anchorNode)
  ) {
    return
  }
  event.currentTarget
    .querySelector('.erp-task-title-entry')
    ?.focus({ preventScroll: true })
  onOpenTask(task)
}

function TaskLane({ lane, loading = false, focused, onOpenTask, onViewAll }) {
  if (focused) {
    return (
      <Card
        size="small"
        variant="borderless"
        className={`erp-task-board-lane erp-task-board-lane--${lane.key} erp-task-board-lane--focused`}
        aria-busy={loading}
      >
        <Table
          size="middle"
          rowKey={getWorkflowTaskStableKey}
          loading={loading}
          dataSource={lane.tasks}
          scroll={{ x: 900 }}
          rowClassName="erp-task-table-row"
          columns={[
            {
              title: '任务 / 产品与物料',
              key: 'identity',
              width: '36%',
              render: (_, task) => (
                <div className="erp-workbench-task-cell">
                  <TaskTitleEntry task={task} onOpenTask={onOpenTask} />
                  <WorkflowTaskIdentity task={task} compact />
                </div>
              ),
            },
            {
              title: '关联单据 / 时间',
              key: 'source',
              width: '27%',
              render: (_, task) => (
                <div className="erp-workbench-task-cell">
                  <WorkflowTaskSource task={task} />
                  <WorkflowTaskTiming task={task} />
                </div>
              ),
            },
            {
              title:
                lane.key === 'exception'
                  ? '阻塞原因 / 负责'
                  : '状态与说明 / 负责',
              key: 'reason',
              render: (_, task) => (
                <div className="erp-workbench-task-cell">
                  <Space size={[4, 4]} wrap>
                    {getWorkflowTaskStatusRiskTags(task).map((tag) => (
                      <Tag key={tag.key} color={tag.color}>
                        {tag.label}
                      </Tag>
                    ))}
                  </Space>
                  {getWorkflowTaskReason(task) ? (
                    <Text
                      type={
                        task.task_status_key === 'blocked'
                          ? 'danger'
                          : undefined
                      }
                    >
                      {getWorkflowTaskReason(task)}
                    </Text>
                  ) : null}
                  <Text type="secondary">
                    {getWorkflowTaskOwnerRoleLabel(task)}
                  </Text>
                </div>
              ),
            },
          ]}
          onRow={(task) => ({
            'data-task-code': task.task_code,
            'data-task-group': task.task_group,
            onClick: (event) => openTaskTableRow(event, task, onOpenTask),
          })}
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="当前分类暂无匹配任务"
              />
            ),
          }}
        />
      </Card>
    )
  }
  return (
    <Card
      size="small"
      variant="borderless"
      className={`erp-task-board-lane erp-task-board-lane--${lane.key}`}
      loading={loading}
      aria-busy={loading}
      title={
        <span className="erp-task-board-lane-heading" title={lane.description}>
          {lane.key === 'exception' ? (
            <ExclamationCircleOutlined aria-hidden="true" />
          ) : null}
          {lane.key === 'due' ? (
            <ClockCircleOutlined aria-hidden="true" />
          ) : null}
          <span>{lane.title}</span>
        </span>
      }
      extra={<span className="erp-task-board-lane-count">{lane.count}</span>}
    >
      <Space direction="vertical" size={8} className="erp-task-board-list">
        {lane.tasks.length > 0 ? (
          lane.tasks.map((task) => {
            const statusMeta = getWorkflowTaskStatusMeta(task)
            const reasonMeta = getWorkflowTaskReasonMeta(task)
            const taskId = getWorkflowTaskStableKey(task)
            return (
              <WorkflowTaskCard
                className="erp-task-board-card"
                key={`${lane.key}-${taskId || task.id}`}
                data-task-code={task.task_code || undefined}
                data-task-group={task.task_group || undefined}
                label={`查看${task.task_name || '任务'}详情`}
                onOpen={() => onOpenTask(task)}
              >
                <span className="erp-task-board-card-head">
                  <Text strong className="erp-task-board-card-title">
                    {task.task_name || '未命名任务'}
                  </Text>
                  <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                </span>
                <WorkflowTaskIdentity task={task} compact />
                <Text
                  type="secondary"
                  className="erp-task-board-card-meta erp-task-board-card-source"
                >
                  <FileTextOutlined aria-hidden="true" />
                  <span className="erp-task-board-card-source-text">
                    <WorkflowTaskSource task={task} />
                  </span>
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
                <WorkflowTaskTiming task={task} />
                <span className="erp-task-board-card-footer">
                  <Text type="secondary" className="erp-task-board-card-meta">
                    {getWorkflowTaskOwnerRoleLabel(task)}
                  </Text>
                  <span
                    className="erp-task-board-card-entry"
                    aria-hidden="true"
                  >
                    <ArrowRightOutlined />
                  </span>
                </span>
              </WorkflowTaskCard>
            )
          })
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />
        )}
      </Space>
      {lane.count > 0 ? (
        <div className="erp-task-board-lane-footer">
          <Button
            type="link"
            size="small"
            aria-label={`${lane.actionLabel}，${lane.count} 项`}
            icon={<ArrowRightOutlined aria-hidden="true" />}
            iconPosition="end"
            onClick={onViewAll}
          >
            查看全部 {lane.count} 项
          </Button>
        </div>
      ) : null}
    </Card>
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
  const [workbenchResponseState, setWorkbenchResponseState] = useState(null)
  const [workbenchCountsState, setWorkbenchCountsState] = useState(null)
  const [taskBoardResponseState, setTaskBoardResponseState] = useState(null)
  const [taskBoardSummaryState, setTaskBoardSummaryState] = useState(null)
  const [taskBoardKeywordDraft, setTaskBoardKeywordDraft] = useState('')
  const [taskBoardFiltersOpen, setTaskBoardFiltersOpen] = useState(false)
  const taskBoardFilterButtonRef = useRef(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [actionMode, setActionMode] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [assignmentTarget, setAssignmentTarget] = useState()
  const [actionReceipt, setActionReceipt] = useState(null)
  const [actionSaving, setActionSaving] = useState(false)
  const selectedTaskRef = useRef(selectedTask)
  selectedTaskRef.current = selectedTask
  const [activeView, setActiveView] = useState(initialView)
  const [workbenchQueueKey, setWorkbenchQueueKey] = useState('actionable')
  const [workbenchQueuePage, setWorkbenchQueuePage] = useState(1)
  const [workbenchQueuePageSize, setWorkbenchQueuePageSize] = useState(
    WORKBENCH_QUEUE_PAGE_SIZE
  )
  const [taskBoardTransitionMinHeight, setTaskBoardTransitionMinHeight] =
    useState(0)
  const mountedRef = useRef(false)
  const beginLatestRequest = useLatestRequestCoordinator()
  const taskBoardLanesRef = useRef(null)
  const workbenchListRef = useRef(null)
  const pendingWorkbenchPageScrollRef = useRef(null)
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
      limit: workbenchQueuePageSize,
      offset: (workbenchQueuePage - 1) * workbenchQueuePageSize,
    }),
    [workbenchQueueKey, workbenchQueuePage, workbenchQueuePageSize]
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
    () => hasActiveWorkflowTaskBoardFilters({ ...filters, mode: 'all' }),
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
  const statusOptions = getWorkflowTaskBoardStatusOptions(filters.lane)
  const dueOptions = getWorkflowTaskBoardDueOptions(filters.lane)
  const activeExtraFilters = [
    { key: 'status', label: '状态', options: TASK_BOARD_STATUS_OPTIONS },
    { key: 'due', label: '截止', options: TASK_BOARD_DUE_OPTIONS },
    { key: 'sourceType', label: '业务', options: sourceOptions },
  ]
    .filter((filter) => filters[filter.key] !== 'all')
    .map((filter) => ({
      ...filter,
      valueLabel: filter.options.find(
        (option) => option.value === filters[filter.key]
      )?.label,
    }))
  const actionMeta = actionMode
    ? getWorkflowTaskActionMeta(selectedTask, actionMode)
    : null
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
      scrollTaskListToStart(taskBoardLanesRef.current)
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
    Math.ceil(workbenchQueueTotal / workbenchQueuePageSize)
  )
  const activeWorkbenchQueuePage = Math.min(
    workbenchQueuePage,
    workbenchQueuePageCount
  )
  const workbenchQueuePageTasks = useMemo(
    () => workbenchResponse?.items || [],
    [workbenchResponse]
  )
  useLayoutEffect(() => {
    const pending = pendingWorkbenchPageScrollRef.current
    if (!pending || loading || !workbenchResponse || workbenchLoadError) return
    if (
      pending.queue !== workbenchQueueKey ||
      pending.page !== workbenchQueuePage ||
      pending.pageSize !== workbenchQueuePageSize ||
      workbenchResponse.offset !== workbenchRequest.offset ||
      workbenchResponse.limit !== workbenchRequest.limit
    ) {
      return
    }
    scrollTaskListToStart(workbenchListRef.current)
    pendingWorkbenchPageScrollRef.current = null
  }, [
    loading,
    workbenchLoadError,
    workbenchQueueKey,
    workbenchQueuePage,
    workbenchQueuePageSize,
    workbenchRequest,
    workbenchResponse,
  ])
  useEffect(() => {
    if (!workbenchResponse || workbenchQueuePage <= workbenchQueuePageCount) {
      return
    }
    if (pendingWorkbenchPageScrollRef.current) {
      pendingWorkbenchPageScrollRef.current.page = workbenchQueuePageCount
    }
    setWorkbenchQueuePage(workbenchQueuePageCount)
  }, [workbenchQueuePage, workbenchQueuePageCount, workbenchResponse])
  const actionDrawerAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask),
  })
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
  }, [visibleWorkbenchQueueOptions, workbenchQueueKey])

  useEffect(() => {
    if (workbenchQueuePage === activeWorkbenchQueuePage) return
    setWorkbenchQueuePage(activeWorkbenchQueuePage)
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
    taskBoardFilterButtonRef.current?.focus({ preventScroll: true })
    pendingTaskBoardPageScrollRef.current = null
    const nextFilters = {
      lane: filters.lane,
      mode: filters.mode,
      sort: filters.sort,
      pageSize: filters.pageSize,
    }
    preserveTaskBoardTransitionHeight(
      buildWorkflowTaskBoardRequest(nextFilters)
    )
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, nextFilters),
      {
        replace: true,
      }
    )
  }

  const selectTaskBoardLane = (lane) => {
    const nextFilters = {
      ...filters,
      lane,
      sort: 'smart',
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

  const selectTaskBoardPage = (page, pageSize = filters.pageSize) => {
    const nextPageSize = normalizeWorkflowTaskPageSize(pageSize)
    const nextPage = nextPageSize !== filters.pageSize ? 1 : Number(page)
    if (
      !taskBoardModel.focused ||
      !Number.isInteger(nextPage) ||
      nextPage < 1 ||
      (nextPage === taskBoardModel.page && nextPageSize === filters.pageSize)
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
        pageSize: nextPageSize,
      })
    )
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        page: nextPage,
        pageSize: nextPageSize,
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

  const selectWorkbenchQueue = useCallback((queueKey) => {
    pendingWorkbenchPageScrollRef.current = null
    setWorkbenchQueueKey(queueKey)
    setWorkbenchQueuePage(1)
  }, [])

  const selectWorkbenchQueuePage = (
    page,
    pageSize = workbenchQueuePageSize
  ) => {
    const nextPageSize = normalizeWorkflowTaskPageSize(pageSize)
    if (nextPageSize !== workbenchQueuePageSize) page = 1
    pendingWorkbenchPageScrollRef.current = {
      queue: workbenchQueueKey,
      page,
      pageSize: nextPageSize,
    }
    setWorkbenchQueuePage(page)
    setWorkbenchQueuePageSize(nextPageSize)
  }

  const openTaskDrawer = (task, mode = '') => {
    if (actionSaving) return
    const nextMode = TASK_ACTION_META[mode] ? mode : ''
    setSelectedTask(task)
    setActionMode(nextMode)
    setActionReason(nextMode === 'block' ? getWorkflowTaskReason(task) : '')
    setAssignmentTarget(undefined)
    setActionReceipt(null)
  }

  const closeTaskDrawer = () => {
    if (actionSaving) return
    setSelectedTask(null)
    setActionMode('')
    setActionReason('')
    setAssignmentTarget(undefined)
    setActionReceipt(null)
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
        const confirmedTask = await mutationAttemptsRef.current.run({
          scope,
          operation,
          mutate,
          params,
        })
        if (
          getWorkflowTaskStableKey(selectedTaskRef.current) === taskIdentity
        ) {
          setSelectedTask(
            retainWorkflowTaskIdentity(taskSnapshot, confirmedTask)
          )
          setActionReceipt({
            actionMode: actionModeSnapshot,
            actionTitle: actionMetaSnapshot.title,
            reason,
            successMessage: actionMetaSnapshot.successMessage,
          })
        }
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
      title: '任务 / 产品与物料',
      dataIndex: 'task_name',
      render: (_, record) => (
        <div className="erp-workbench-task-cell">
          <TaskTitleEntry task={record} onOpenTask={openTaskDrawer} />
          <WorkflowTaskIdentity task={record} compact />
          <Text type="secondary">
            <WorkflowTaskSource task={record} />
          </Text>
          {getWorkflowTaskReason(record) ? (
            <Text
              type={
                record.task_status_key === 'blocked' ? 'danger' : 'secondary'
              }
            >
              {getWorkflowTaskReasonMeta(record).label}：
              {getWorkflowTaskReason(record)}
            </Text>
          ) : null}
        </div>
      ),
    },
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
      title: '负责',
      key: 'owner_role',
      width: 90,
      render: (_, record) => getWorkflowTaskOwnerRoleLabel(record),
    },
    {
      title: '任务时间',
      key: 'timing',
      width: 210,
      render: (_, record) => <WorkflowTaskTiming task={record} />,
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
                ref={workbenchListRef}
                className="erp-workbench-panel erp-workbench-queue-panel"
                aria-label="优先处理"
                aria-busy={loading}
              >
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
                  pagination={false}
                  scroll={{ x: 680 }}
                  rowClassName="erp-task-table-row"
                  onRow={(record) => ({
                    'data-task-code': record.task_code || undefined,
                    'data-task-group': record.task_group || undefined,
                    onClick: (event) =>
                      openTaskTableRow(event, record, openTaskDrawer),
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
            </div>
            {workbenchCounts ? (
              <WorkflowTaskPagination
                total={workbenchQueueTotal}
                current={activeWorkbenchQueuePage}
                pageSize={workbenchQueuePageSize}
                loading={loading}
                error={Boolean(workbenchLoadError)}
                onChange={selectWorkbenchQueuePage}
              />
            ) : null}
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
            <section className="erp-task-center-summary">
              <div className="erp-task-board-heading">
                <div className="erp-task-board-title">
                  {taskBoardModel.focused ? (
                    <Tooltip title="返回任务概览">
                      <Button
                        type="text"
                        aria-label="返回任务概览"
                        icon={<ArrowLeftOutlined aria-hidden="true" />}
                        onClick={() => selectTaskBoardLane('all')}
                      />
                    </Tooltip>
                  ) : null}
                  <Title level={3} className="erp-command-center-hero-title">
                    任务看板
                  </Title>
                </div>
                {canViewApprovalInbox ? (
                  <div className="erp-task-board-scope-filter">
                    <Segmented
                      aria-label="任务范围"
                      value={filters.mode}
                      options={TASK_BOARD_SCOPE_OPTIONS}
                      onChange={(value) => updateFilter('mode', value)}
                    />
                  </div>
                ) : null}
              </div>
              {taskBoardModel.focused ? (
                <Tabs
                  className="erp-task-board-categories"
                  aria-label="任务分类"
                  activeKey={filters.lane}
                  onChange={selectTaskBoardLane}
                  tabBarGutter={24}
                  items={TASK_BOARD_LANE_DEFINITIONS.map((lane) => ({
                    key: lane.key,
                    label: (
                      <span className="erp-task-board-category">
                        <span>{lane.title}</span>
                        <span className="erp-task-board-category-count">
                          {taskBoardMetricsReady
                            ? taskBoardCounts[lane.key]
                            : '—'}
                        </span>
                      </span>
                    ),
                  }))}
                />
              ) : null}
            </section>

            <div className="erp-task-board-controls">
              <div className="erp-task-board-filters">
                <SearchInput
                  placeholder="订单 / 产品 / 物料 / 款号"
                  searchHint="可搜索：任务、单号、产品、款号、物料、处理原因"
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
                {roleOptions.length > 1 ? (
                  <SelectFilter
                    aria-label="负责岗位"
                    value={filters.role}
                    options={roleOptions}
                    onChange={(value) => updateFilter('role', value)}
                  />
                ) : null}
                <Button
                  ref={taskBoardFilterButtonRef}
                  icon={<FilterOutlined aria-hidden="true" />}
                  aria-expanded={taskBoardFiltersOpen}
                  aria-controls="task-board-extra-filters"
                  onClick={() => setTaskBoardFiltersOpen((open) => !open)}
                >
                  筛选
                  {activeExtraFilters.length
                    ? ` · ${activeExtraFilters.length}`
                    : ''}
                </Button>
                {taskBoardModel.focused ? (
                  <SelectFilter
                    aria-label="任务排序"
                    value={filters.sort}
                    options={TASK_BOARD_SORT_OPTIONS}
                    onChange={(value) => updateFilter('sort', value)}
                  />
                ) : null}
              </div>
              {taskBoardFiltersOpen ? (
                <div
                  id="task-board-extra-filters"
                  className="erp-task-board-extra-filters"
                  role="group"
                  aria-label="更多筛选条件"
                >
                  {filters.lane === 'all' || filters.lane === 'finished' ? (
                    <label>
                      <span>任务状态</span>
                      <SelectFilter
                        aria-label="任务状态"
                        value={filters.status}
                        options={statusOptions}
                        onChange={(value) => updateFilter('status', value)}
                      />
                    </label>
                  ) : null}
                  <label>
                    <span>截止时间</span>
                    <SelectFilter
                      aria-label="截止时间"
                      value={filters.due}
                      options={dueOptions}
                      onChange={(value) => updateFilter('due', value)}
                    />
                  </label>
                  <label>
                    <span>业务来源</span>
                    <SelectFilter
                      aria-label="业务来源"
                      value={filters.sourceType}
                      options={sourceOptions}
                      onChange={(value) => updateFilter('sourceType', value)}
                    />
                  </label>
                </div>
              ) : null}
              {hasActiveFilters ? (
                <div
                  className="erp-task-board-active-filters"
                  aria-label="已选筛选条件"
                >
                  {activeExtraFilters.map((filter) => (
                    <Button
                      key={filter.key}
                      size="small"
                      className="erp-task-board-filter-chip"
                      aria-label={`清除${filter.label}：${filter.valueLabel}`}
                      icon={<CloseOutlined aria-hidden="true" />}
                      iconPosition="end"
                      onClick={() => {
                        taskBoardFilterButtonRef.current?.focus({
                          preventScroll: true,
                        })
                        updateFilter(filter.key, 'all')
                      }}
                    >
                      {filter.label}：{filter.valueLabel}
                    </Button>
                  ))}
                  <ToolbarButton onClick={clearFilters}>清空筛选</ToolbarButton>
                </div>
              ) : null}
            </div>
            {taskBoardLoadError ? (
              <Alert
                type="error"
                showIcon
                message="任务看板加载失败"
                description={taskBoardLoadError}
                action={<Button onClick={loadDashboardStats}>重新加载</Button>}
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
                    onOpenTask={openTaskDrawer}
                    onViewAll={() => selectTaskBoardLane(lane.key)}
                  />
                ))}
              </div>
            )}
            {taskBoardModel.focused ? (
              <WorkflowTaskPagination
                total={taskBoardCounts[filters.lane] || 0}
                current={taskBoardReady ? taskBoardModel.page : filters.page}
                pageSize={filters.pageSize}
                loading={taskBoardUpdating}
                error={Boolean(taskBoardLoadError)}
                onChange={selectTaskBoardPage}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <WorkflowTaskActionDrawer
        task={selectedTask}
        actionReceipt={actionReceipt}
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
