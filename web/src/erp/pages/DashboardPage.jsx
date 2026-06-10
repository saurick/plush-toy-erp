import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertOutlined,
  ArrowRightOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  PrinterOutlined,
  ReloadOutlined,
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
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
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
import CommandCenterNav from '../components/CommandCenterNav.jsx'
import {
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import { getBusinessDashboardStats } from '../api/businessRecordApi.mjs'
import {
  commandCenterViews,
  getCommandCenterView,
} from '../config/commandCenter.mjs'
import { dashboardModules } from '../config/dashboardModules.mjs'
import { printTemplateStats } from '../config/printTemplates.mjs'
import {
  formatWorkflowTaskSource,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import {
  buildDashboardModuleRows,
  buildDashboardSummary,
  normalizeDashboardModuleStats,
} from '../utils/dashboardStats.mjs'
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

function TaskLane({ lane, onOpenTask, onOpenAction }) {
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
                  <Text strong>{task.task_name || '未命名任务'}</Text>
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

export default function DashboardPage({ initialView = 'workbench' }) {
  const [loading, setLoading] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [moduleStats, setModuleStats] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [actionMode, setActionMode] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [activeView, setActiveView] = useState(initialView)
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
      const [workflowResult, businessResult] = await Promise.all([
        listWorkflowTasks({ limit: 200 }),
        getBusinessDashboardStats(),
      ])
      const modules = Array.isArray(businessResult?.modules)
        ? businessResult.modules.map((item) =>
            normalizeDashboardModuleStats(item)
          )
        : []
      if (mountedRef.current) {
        setWorkflowTasks(workflowResult?.tasks || [])
        setModuleStats(modules)
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
  const moduleRows = useMemo(
    () => buildDashboardModuleRows(dashboardModules, moduleStats),
    [moduleStats]
  )
  const businessSummary = useMemo(
    () => buildDashboardSummary(moduleRows),
    [moduleRows]
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
  const selectedTaskEntryPath = selectedTask
    ? resolveWorkflowTaskEntryPath(selectedTask)
    : ''
  const activeViewMeta =
    getCommandCenterView(activeView) || commandCenterViews[0]
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
  const roleReminderCards = useMemo(
    () => [
      { key: 'finance', title: '财务', value: workflowStats.financePending },
      {
        key: 'warehouse',
        title: '仓库',
        value: workflowStats.warehousePending,
      },
      { key: 'pmc', title: 'PMC', value: workflowStats.pmcFocus },
      { key: 'quality', title: '品质', value: workflowStats.qualityPending },
    ],
    [workflowStats]
  )
  const businessSummaryRows = useMemo(
    () =>
      [
        { key: 'active', title: '推进中', value: businessSummary.activeCount },
        {
          key: 'blocked',
          title: '阻塞/取消',
          value: businessSummary.blockedCount,
        },
        {
          key: 'closed',
          title: '已归档',
          value: businessSummary.completedCount,
        },
      ].map((item) => ({
        ...item,
        percent: businessSummary.totalRecords
          ? Math.round((item.value / businessSummary.totalRecords) * 100)
          : 0,
      })),
    [businessSummary]
  )

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

  const openCommandCenterView = (viewKey) => {
    const viewMeta = getCommandCenterView(viewKey)
    if (!viewMeta) return
    if (['workbench', 'task-board', 'exception-flow'].includes(viewKey)) {
      setActiveView(viewKey)
    }
    if (viewMeta.path) {
      navigate(viewMeta.path)
    }
  }

  const openBusinessDashboard = () => {
    navigate('/erp/business-dashboard')
  }

  const openPrintCenter = () => {
    navigate('/erp/print-center')
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

  const taskColumns = [
    {
      title: '任务',
      dataIndex: 'task_name',
      width: 230,
      fixed: 'left',
      render: (value, record) => (
        <Button
          type="link"
          className="erp-dashboard-link-button"
          disabled={!resolveWorkflowTaskEntryPath(record)}
          onClick={() => openTaskEntry(record)}
        >
          {value || '未命名任务'}
        </Button>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source_no',
      width: 190,
      render: (_, record) => formatWorkflowTaskSource(record),
    },
    {
      title: '状态',
      dataIndex: 'task_status_key',
      width: 110,
      render: (_, record) => {
        const meta = getWorkflowTaskStatusMeta(record)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '负责人',
      dataIndex: 'owner_role_key',
      width: 100,
      render: (_, record) => getTaskOwnerRoleKey(record) || '-',
    },
    {
      title: '到期',
      dataIndex: 'due_at',
      width: 150,
      render: (_, record) => {
        const dueStatus = getWorkflowTaskDueStatus(record)
        const color =
          dueStatus === 'overdue'
            ? 'red'
            : dueStatus === 'due_soon'
              ? 'orange'
              : 'default'
        return <Tag color={color}>{getWorkflowTaskDueLabel(record)}</Tag>
      },
    },
    {
      title: '原因 / 备注',
      dataIndex: 'blocked_reason',
      width: 220,
      render: (_, record) => getWorkflowTaskReason(record) || '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 230,
      render: (_, record) => {
        const terminal = isTerminalWorkflowTask(record)
        return (
          <Space>
            <Button size="small" onClick={() => openTaskDrawer(record)}>
              详情
            </Button>
            <Button
              size="small"
              type="primary"
              disabled={terminal}
              onClick={() => openTaskDrawer(record, 'complete')}
            >
              完成
            </Button>
            <Button
              size="small"
              disabled={terminal}
              onClick={() => openTaskDrawer(record, 'urge')}
            >
              催办
            </Button>
          </Space>
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
      <Card
        className="erp-dashboard-card erp-command-center-nav-card"
        variant="borderless"
      >
        <div className="erp-command-center-shell">
          <CommandCenterNav
            activeKey={activeView}
            onSelect={(item) => openCommandCenterView(item.key)}
          />
          <Space
            direction="vertical"
            size={12}
            className="erp-dashboard-block erp-command-center-shell-main"
          >
            <Space className="erp-dashboard-heading-row" align="start">
              <div>
                <Text type="secondary">ERP / 运营中枢</Text>
                <Title level={4} className="erp-dashboard-section-title">
                  {activeViewMeta.label}
                </Title>
                <Paragraph type="secondary" className="erp-dashboard-summary">
                  吸收后台工作台原型的五个视图；所有动作仍回到现有
                  Workflow、业务页和打印工作台，不写库存、出货、财务或发票事实。
                </Paragraph>
              </div>
              <Button
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={loadDashboardStats}
              >
                刷新运营数据
              </Button>
            </Space>
          </Space>
        </div>
      </Card>

      {activeView === 'workbench' ? (
        <>
          <Card
            className="erp-dashboard-card erp-command-center-hero-card"
            variant="borderless"
            loading={loading}
          >
            <div className="erp-command-center-hero">
              <div className="erp-command-center-hero-main">
                <Text type="secondary">ERP / 工作台</Text>
                <Title level={3} className="erp-command-center-hero-title">
                  今天先处理协同卡点，再进入具体业务模块
                </Title>
                <Paragraph className="erp-dashboard-summary">
                  工作台只做跨模块聚合和入口分发：把今日必须处理、跨角色阻塞、业务记录摘要、打印入口和常用业务入口放在第一屏。
                </Paragraph>
                <Space wrap>
                  <Tag color="blue">
                    本页待办 {workflowStats.pending + workflowStats.processing}
                  </Tag>
                  <Tag color="red">阻塞 {workflowStats.blocked}</Tag>
                  <Tag color="orange">
                    今日/超时 {workflowStats.dueSoon + workflowStats.overdue}
                  </Tag>
                  <Tag color="green">
                    业务记录 {businessSummary.totalRecords}
                  </Tag>
                  <Tag>只展示运营与协同状态，不写事实层</Tag>
                </Space>
              </div>
              <Row
                gutter={[12, 12]}
                className="erp-command-center-hero-metrics"
              >
                <Col xs={24} sm={8}>
                  <Statistic
                    title="今日必须处理"
                    value={workflowStats.pending + workflowStats.processing}
                  />
                </Col>
                <Col xs={24} sm={8}>
                  <Statistic title="跨角色阻塞" value={workflowStats.blocked} />
                </Col>
                <Col xs={24} sm={8}>
                  <Statistic
                    title="正式打印模板"
                    value={printTemplateStats.total}
                    suffix="套"
                  />
                </Col>
              </Row>
            </div>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card
                className="erp-dashboard-card erp-command-center-focus-card"
                variant="borderless"
                title="今日焦点"
                extra={
                  <Button
                    size="small"
                    onClick={() => openCommandCenterView('task-board')}
                  >
                    看全部任务
                  </Button>
                }
              >
                <Space
                  direction="vertical"
                  size={10}
                  className="erp-dashboard-block"
                >
                  {todayFocusTasks.length > 0 ? (
                    todayFocusTasks.map((task) => {
                      const statusMeta = getWorkflowTaskStatusMeta(task)
                      return (
                        <div
                          className="erp-command-center-focus-item"
                          key={task.id || task.task_code}
                        >
                          <div className="erp-command-center-focus-copy">
                            <Text strong>{task.task_name || '未命名任务'}</Text>
                            <Text type="secondary">
                              {formatWorkflowTaskSource(task)} /{' '}
                              {getWorkflowTaskDueLabel(task)}
                            </Text>
                          </div>
                          <Space wrap>
                            <Tag color={statusMeta.color}>
                              {statusMeta.label}
                            </Tag>
                            <Button
                              size="small"
                              type="primary"
                              onClick={() => openTaskDrawer(task)}
                            >
                              处理
                            </Button>
                          </Space>
                        </div>
                      )
                    })
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="暂无待处理焦点"
                    />
                  )}
                </Space>
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card
                className="erp-dashboard-card erp-command-center-health-card"
                variant="borderless"
                title="业务状态摘要"
                extra={
                  <Button size="small" onClick={openBusinessDashboard}>
                    看业务看板
                  </Button>
                }
              >
                <Space
                  direction="vertical"
                  size={12}
                  className="erp-dashboard-block"
                >
                  {businessSummaryRows.map((row) => (
                    <div
                      className="erp-command-center-health-row"
                      key={row.key}
                    >
                      <Text strong>{row.title}</Text>
                      <Progress percent={row.percent} />
                      <Tag
                        color={
                          row.key === 'blocked' && row.value > 0
                            ? 'red'
                            : 'green'
                        }
                      >
                        {row.value}
                      </Tag>
                    </div>
                  ))}
                </Space>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8}>
              <Card
                className="erp-dashboard-card"
                variant="borderless"
                title="常用入口"
              >
                <Space wrap>
                  {dashboardModules.slice(0, 8).map((moduleItem) => (
                    <Button
                      key={moduleItem.key}
                      onClick={() => navigate(moduleItem.path)}
                    >
                      {moduleItem.title}
                    </Button>
                  ))}
                </Space>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card
                className="erp-dashboard-card"
                variant="borderless"
                title="角色提醒"
              >
                <Row gutter={[10, 10]}>
                  {roleReminderCards.map((item) => (
                    <Col xs={12} key={item.key}>
                      <Card
                        size="small"
                        className="erp-dashboard-status-card"
                        variant="borderless"
                      >
                        <Statistic title={item.title} value={item.value} />
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card
                className="erp-dashboard-card"
                variant="borderless"
                title="运营工具"
              >
                <Space direction="vertical" className="erp-dashboard-block">
                  <Button icon={<PrinterOutlined />} onClick={openPrintCenter}>
                    模板打印中心
                  </Button>
                  <Button
                    icon={<ExclamationCircleOutlined />}
                    onClick={() => openCommandCenterView('exception-flow')}
                  >
                    异常 / 阻塞闭环
                  </Button>
                  <Alert
                    type="info"
                    showIcon
                    message="边界"
                    description="运营工具只组织协同和打印入口，不绕过业务页、WorkflowUsecase 或事实层。"
                  />
                </Space>
              </Card>
            </Col>
          </Row>
        </>
      ) : null}

      {activeView === 'task-board' ? (
        <>
          <Card
            className="erp-dashboard-card erp-dashboard-task-board-card"
            variant="borderless"
            loading={loading}
          >
            <Space
              direction="vertical"
              className="erp-dashboard-block"
              size={14}
            >
              <Space className="erp-dashboard-heading-row" align="start">
                <div>
                  <Title level={4} className="erp-dashboard-section-title">
                    任务看板
                  </Title>
                  <Paragraph type="secondary" className="erp-dashboard-summary">
                    协同层总览。任务完成不代表库存、出货、财务或发票事实已过账。
                  </Paragraph>
                </div>
                <Space wrap className="erp-dashboard-task-board-actions">
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={loadDashboardStats}
                  >
                    刷新任务
                  </Button>
                  <Button
                    icon={<ArrowRightOutlined />}
                    onClick={openBusinessDashboard}
                  >
                    看业务状态
                  </Button>
                  <Button icon={<PrinterOutlined />} onClick={openPrintCenter}>
                    去打印中心
                  </Button>
                </Space>
              </Space>
              <Space wrap>
                <Tag color="blue">
                  本页待办 {workflowStats.pending + workflowStats.processing}
                </Tag>
                <Tag color="red">阻塞 {workflowStats.blocked}</Tag>
                <Tag color="orange">
                  到期 {workflowStats.dueSoon + workflowStats.overdue}
                </Tag>
                <Tag color="green">已完成 {workflowStats.done}</Tag>
                <Tag color={hasActiveFilters ? 'green' : 'default'}>
                  {hasActiveFilters ? '筛选已生效' : '全部任务'}
                </Tag>
              </Space>
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
                <Button
                  icon={<CloseCircleOutlined />}
                  disabled={!hasActiveFilters}
                  onClick={clearFilters}
                >
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
                  />
                ))}
              </div>
            </Space>
          </Card>

          <Card
            className="erp-dashboard-card erp-dashboard-table-card"
            variant="borderless"
            title="任务处理明细"
            extra={
              <Button
                icon={<FileSearchOutlined />}
                onClick={openBusinessDashboard}
              >
                打开业务状态
              </Button>
            }
          >
            <Table
              size="middle"
              loading={{
                spinning: loading,
                indicator: <Spin size="small" />,
              }}
              rowKey={(record) => record.id || record.task_code}
              scroll={{ x: 1320 }}
              columns={taskColumns}
              dataSource={filteredTasks}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total, range) =>
                  `共 ${total} 条，当前显示 ${range[0]}-${range[1]} 条`,
              }}
            />
          </Card>
        </>
      ) : null}

      {activeView === 'exception-flow' ? (
        <>
          <Card
            className="erp-dashboard-card erp-command-center-exception-card"
            variant="borderless"
            title="异常 / 阻塞闭环"
            extra={
              <Button onClick={() => openCommandCenterView('task-board')}>
                回任务看板
              </Button>
            }
          >
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
        title="任务详情"
        width={560}
        open={Boolean(selectedTask)}
        onClose={closeTaskDrawer}
        destroyOnHidden
        extra={
          selectedTask ? (
            <Tag color={selectedTaskStatusMeta?.color}>
              {selectedTaskStatusMeta?.label}
            </Tag>
          ) : null
        }
        footer={
          selectedTask ? (
            <Space wrap>
              <Button
                type="primary"
                disabled={isTerminalWorkflowTask(selectedTask)}
                onClick={() => setActionMode('complete')}
              >
                处理完成
              </Button>
              <Button
                danger
                disabled={isTerminalWorkflowTask(selectedTask)}
                onClick={() => {
                  setActionMode('block')
                  setActionReason(getWorkflowTaskReason(selectedTask))
                }}
              >
                标记阻塞
              </Button>
              <Button
                disabled={isTerminalWorkflowTask(selectedTask)}
                onClick={() => setActionMode('urge')}
              >
                催办
              </Button>
              <Button
                disabled={!selectedTaskEntryPath}
                onClick={() => openTaskEntry(selectedTask)}
              >
                查看关联记录
              </Button>
            </Space>
          ) : null
        }
      >
        {selectedTask ? (
          <Space direction="vertical" size={14} className="erp-dashboard-block">
            <Alert
              type="info"
              showIcon
              icon={<AlertOutlined />}
              message="协同任务说明"
              description="这里的完成、阻塞和催办只处理 Workflow 任务；不直接写库存、出货、应收、开票、付款或其他事实表。"
            />
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="任务">
                {selectedTask.task_name || '未命名任务'}
              </Descriptions.Item>
              <Descriptions.Item label="任务编号">
                {formatTaskCode(selectedTask)}
              </Descriptions.Item>
              <Descriptions.Item label="来源">
                {formatWorkflowTaskSource(selectedTask)}
              </Descriptions.Item>
              <Descriptions.Item label="负责角色">
                {getTaskOwnerRoleKey(selectedTask) || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="到期时间">
                {getWorkflowTaskDueLabel(selectedTask)}
              </Descriptions.Item>
              <Descriptions.Item label="阻塞 / 退回原因">
                {getWorkflowTaskReason(selectedTask) || '-'}
              </Descriptions.Item>
            </Descriptions>
            {actionMeta ? (
              <Card
                size="small"
                className="erp-task-board-action-panel"
                title={actionMeta.title}
              >
                <Space
                  direction="vertical"
                  size={10}
                  className="erp-dashboard-block"
                >
                  <Text type="secondary">
                    {actionMode === 'complete'
                      ? '完成只关闭协同任务；如需登记真实业务事实，请进入对应业务模块。'
                      : '请填写原因、影响范围和需要谁继续处理。'}
                  </Text>
                  <TextArea
                    value={actionReason}
                    rows={4}
                    maxLength={180}
                    showCount
                    placeholder="填写原因、影响范围、需要谁处理"
                    onChange={(event) => setActionReason(event.target.value)}
                  />
                  <Space wrap>
                    <Button
                      type="primary"
                      loading={actionSaving}
                      onClick={submitTaskAction}
                    >
                      {actionMeta.buttonLabel}
                    </Button>
                    <Button
                      disabled={actionSaving}
                      onClick={() => {
                        setActionMode('')
                        setActionReason('')
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Space>
              </Card>
            ) : null}
          </Space>
        ) : null}
      </Drawer>
    </Space>
  )
}
