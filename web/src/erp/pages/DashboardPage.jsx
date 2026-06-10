import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertOutlined,
  ArrowRightOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
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

export default function DashboardPage() {
  const [loading, setLoading] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [actionMode, setActionMode] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
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
  const selectedTaskEntryPath = selectedTask
    ? resolveWorkflowTaskEntryPath(selectedTask)
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

  const metricCards = [
    {
      key: 'today',
      title: '待处理任务数',
      value: workflowStats.pending + workflowStats.processing,
      icon: <ClockCircleOutlined />,
    },
    {
      key: 'blocked',
      title: '跨角色阻塞',
      value: workflowStats.blocked,
      color: '#d4380d',
      icon: <ExclamationCircleOutlined />,
    },
    {
      key: 'dueSoon',
      title: '即将到期任务数',
      value: workflowStats.dueSoon,
      color: '#d48806',
      icon: <BellOutlined />,
    },
    {
      key: 'done',
      title: '已完成协同',
      value: workflowStats.done,
      icon: <CheckCircleOutlined />,
    },
  ]

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
    <Space direction="vertical" size={16} className="erp-dashboard-page">
      <Card
        className="erp-dashboard-card erp-workbench-hero-card"
        variant="borderless"
        loading={loading}
      >
        <div className="erp-workbench-hero">
          <div>
            <Title level={4} className="erp-dashboard-title">
              任务看板
            </Title>
            <Paragraph type="secondary" className="erp-dashboard-summary">
              工作台式协同入口：先处理今日任务、阻塞和即将到期任务，再进入具体业务模块。这里处理
              Workflow 任务，不代表库存、出货、应收、开票或收付款事实已过账。
            </Paragraph>
            <Space wrap>
              <Tag color="green">本页任务 {workflowStats.total}</Tag>
              <Tag color="red">阻塞 {workflowStats.blocked}</Tag>
              <Tag color="orange">超时 {workflowStats.overdue}</Tag>
              <Tag>完成任务只关闭协同，不写事实</Tag>
            </Space>
          </div>
          <Space wrap className="erp-workbench-hero-actions">
            <Button icon={<ReloadOutlined />} onClick={loadDashboardStats}>
              刷新任务
            </Button>
            <Button
              icon={<ArrowRightOutlined />}
              onClick={openBusinessDashboard}
            >
              去业务看板
            </Button>
            <Button icon={<PrinterOutlined />} onClick={openPrintCenter}>
              去打印中心
            </Button>
          </Space>
        </div>
      </Card>

      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" className="erp-dashboard-block" size={12}>
          <Title level={5} className="erp-dashboard-section-title">
            任务处理统计
          </Title>
          <Row gutter={[12, 12]}>
            {metricCards.map((item) => (
              <Col xs={24} sm={12} lg={6} key={item.key}>
                <Card size="small" variant="borderless">
                  <Statistic
                    title={
                      <Space>
                        {item.icon}
                        <span>{item.title}</span>
                      </Space>
                    }
                    value={item.value}
                    valueStyle={item.color ? { color: item.color } : undefined}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Space>
      </Card>

      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" className="erp-dashboard-block" size={12}>
          <Space className="erp-dashboard-heading-row" align="start">
            <div>
              <Title level={5} className="erp-dashboard-section-title">
                任务处理明细
              </Title>
              <Paragraph type="secondary" className="erp-dashboard-summary">
                支持按状态、角色、来源和到期筛选；阻塞、催办、完成动作会回到现有
                workflow API。
              </Paragraph>
            </div>
            <Button
              icon={<FileSearchOutlined />}
              onClick={openBusinessDashboard}
            >
              看业务状态
            </Button>
          </Space>
          <div className="erp-task-board-filters">
            <Input.Search
              allowClear
              placeholder="搜索任务、单号、来源、阻塞原因"
              value={filters.keyword}
              onChange={(event) => updateFilter('keyword', event.target.value)}
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
        </Space>
      </Card>

      <div className="erp-task-board-lanes">
        {taskLanes.map((lane) => (
          <TaskLane
            key={lane.key}
            lane={lane}
            onOpenTask={openTaskDrawer}
            onOpenAction={openTaskDrawer}
          />
        ))}
      </div>

      <Card
        className="erp-dashboard-card erp-dashboard-table-card"
        variant="borderless"
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
