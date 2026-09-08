import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Space, Spin, Table, Typography } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import WorkflowTaskIdentity from '../components/workflow/WorkflowTaskIdentity.jsx'
import WorkflowTaskTiming from '../components/workflow/WorkflowTaskTiming.jsx'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getBusinessDashboardStats } from '../api/businessDashboardApi.mjs'
import { getWorkflowTaskBoard } from '../api/workflowApi.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import useWorkflowTaskActionAccess from '../hooks/useWorkflowTaskActionAccess.js'
import {
  DASHBOARD_TRUTH_KINDS,
  dashboardHealthModules,
} from '../config/dashboardModules.mjs'
import {
  formatWorkflowTaskSource,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import {
  buildDashboardModuleRows,
  normalizeDashboardModuleStats,
} from '../utils/dashboardStats.mjs'
import { openDashboardItemOnDoubleClick } from '../utils/dashboardDoubleClick.mjs'
import { effectiveSessionAllowsPage } from '../utils/adminProfileSync.mjs'
import {
  TASK_BOARD_LANE_DEFINITIONS,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReasonMeta,
} from '../utils/workflowTaskBoard.mjs'
import { canOpenWorkflowTaskEntry } from '../utils/workflowTaskEntryAccess.mjs'

const { Paragraph, Text, Title } = Typography

const NUMBER_FORMATTER = new Intl.NumberFormat('zh-CN')
const PAGE_KEY_BY_DASHBOARD_SOURCE = Object.freeze({
  outbound: 'shipments',
})

const DATA_BOUNDARIES = Object.freeze([
  {
    key: 'master-data',
    title: '基础资料',
    description: '客户、供应商、产品与物料清单等基础资料。',
  },
  {
    key: 'source-document',
    title: '业务单据',
    description:
      '销售、采购、生产与委外等订单或合同，用于记录业务发起或约定，后续仍需按流程办理。',
  },
  {
    key: 'business-overview',
    title: '办理结果',
    description: '入库、质检、库存、出货和财务等已经完成的业务记录。',
  },
  {
    key: 'collaboration',
    title: '待办事项',
    description:
      '排程、异常、放行等需要跟进的工作；完成任务不会自动产生库存、出货或财务记录。',
  },
])

const DATA_BOUNDARY_LABELS = Object.freeze({
  [DASHBOARD_TRUTH_KINDS.MASTER_DATA]: '基础资料',
  [DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT]: '业务单据',
  [DASHBOARD_TRUTH_KINDS.BUSINESS_FACT]: '办理结果',
  [DASHBOARD_TRUTH_KINDS.COLLABORATION]: '待办事项',
})
const BUSINESS_ATTENTION_LANES = Object.freeze(
  TASK_BOARD_LANE_DEFINITIONS.filter(
    (definition) => definition.key === 'exception' || definition.key === 'due'
  )
)

function formatCount(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? NUMBER_FORMATTER.format(value)
    : '—'
}

function getLane(taskBoard, key) {
  return Array.isArray(taskBoard?.lanes)
    ? taskBoard.lanes.find((lane) => lane?.key === key) || null
    : null
}

function BusinessAttentionItem({
  adminProfile,
  definition,
  onOpenEntry,
  taskBoard,
  taskBoardReady,
  onViewAll,
}) {
  const lane = getLane(taskBoard, definition.key)
  const total = taskBoardReady ? taskBoard.counts[definition.key] : null
  const task = taskBoardReady ? lane?.tasks?.[0] : null
  const reason = task ? getWorkflowTaskReasonMeta(task) : null
  const access = useWorkflowTaskActionAccess({
    adminProfile,
    task,
    enabled: Boolean(task),
  })
  const entryPath = task ? resolveWorkflowTaskEntryPath(task) : ''
  const canOpenEntry = canOpenWorkflowTaskEntry(
    adminProfile,
    entryPath,
    access.sourceAccess
  )

  return (
    <div
      role="group"
      aria-label={`${definition.title}，${taskBoardReady ? `${formatCount(total)} 项` : '暂不可用'}`}
      className={`erp-business-board-alert-item${
        canOpenEntry ? ' erp-business-board-alert-item--openable' : ''
      }`}
      data-open-on-double-click={canOpenEntry ? 'true' : undefined}
      title={canOpenEntry ? '双击查看相关业务' : undefined}
      onDoubleClick={
        canOpenEntry
          ? (event) =>
              openDashboardItemOnDoubleClick(event, () =>
                onOpenEntry(task, access)
              )
          : undefined
      }
    >
      <div className="erp-business-board-alert-head">
        <Text strong>{definition.title}</Text>
        <strong className="erp-business-board-alert-count">
          {taskBoardReady ? formatCount(total) : '—'}
        </strong>
      </div>
      {!taskBoardReady ? (
        <Text type="secondary">暂不可用</Text>
      ) : task ? (
        <>
          <Text strong className="erp-business-board-task-text">
            {task.task_name || definition.title}
          </Text>
          <WorkflowTaskIdentity task={task} compact />
          <Text type="secondary" className="erp-business-board-task-source">
            <FileTextOutlined aria-hidden="true" />
            <span>{formatWorkflowTaskSource(task)}</span>
          </Text>
          {reason?.value ? (
            <Text
              className="erp-business-board-task-reason"
              type={reason.kind === 'blocked' ? 'danger' : 'secondary'}
            >
              {reason.label}：{reason.value}
            </Text>
          ) : null}
          <WorkflowTaskTiming task={task} />
          <div className="erp-business-board-task-meta">
            <Text type="secondary">
              <UserOutlined aria-hidden="true" />{' '}
              {getWorkflowTaskOwnerRoleLabel(task)}
            </Text>
          </div>
        </>
      ) : total > 0 ? (
        <Text type="secondary">暂无可展示事项</Text>
      ) : (
        <Text type="secondary">暂无</Text>
      )}
      <div className="erp-business-board-alert-actions">
        {canOpenEntry ? (
          <Button
            type="link"
            size="small"
            className="erp-dashboard-link-button erp-business-board-task-entry"
            onClick={() => onOpenEntry(task, access)}
            aria-label={`查看${task.task_name || definition.title}的单据`}
          >
            查看单据
          </Button>
        ) : null}
        {taskBoardReady && total > 0 && onViewAll ? (
          <Button
            type="link"
            size="small"
            icon={<ArrowRightOutlined aria-hidden="true" />}
            iconPosition="end"
            onClick={() => onViewAll(definition.key)}
          >
            查看全部 {formatCount(total)} 项
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default function BusinessDashboardPage() {
  const [loading, setLoading] = useState(false)
  const [moduleStats, setModuleStats] = useState([])
  const [dashboardLoadError, setDashboardLoadError] = useState(false)
  const [taskBoard, setTaskBoard] = useState(null)
  const [taskBoardReady, setTaskBoardReady] = useState(false)
  const [workflowLoadError, setWorkflowLoadError] = useState(false)
  const navigate = useNavigate()
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || null
  const beginLatestRequest = useLatestRequestCoordinator()

  const loadDashboardStats = useCallback(async () => {
    const request = beginLatestRequest('business-dashboard')
    if (!adminProfile?.id) {
      setLoading(false)
      request.finish()
      return false
    }

    setLoading(true)
    try {
      const [dashboardResult, workflowResult] = await Promise.allSettled([
        getBusinessDashboardStats({}, { signal: request.signal }),
        getWorkflowTaskBoard(
          { limit: 1, offset: 0 },
          { signal: request.signal }
        ),
      ])

      if (!request.isCurrent()) {
        return false
      }

      if (dashboardResult.status === 'fulfilled') {
        setModuleStats(
          dashboardResult.value.modules.map((item) =>
            normalizeDashboardModuleStats(item)
          )
        )
        setDashboardLoadError(false)
      } else {
        setModuleStats([])
        setDashboardLoadError(true)
        message.error(
          getActionErrorMessage(dashboardResult.reason, '加载业务统计')
        )
      }

      if (workflowResult.status === 'fulfilled') {
        setTaskBoard(workflowResult.value)
        setTaskBoardReady(true)
        setWorkflowLoadError(false)
      } else {
        setTaskBoard(null)
        setTaskBoardReady(false)
        setWorkflowLoadError(true)
        message.error(
          getActionErrorMessage(workflowResult.reason, '加载待办概览')
        )
      }

      return (
        dashboardResult.status === 'fulfilled' &&
        workflowResult.status === 'fulfilled'
      )
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [adminProfile, beginLatestRequest])

  useEffect(() => {
    setModuleStats([])
    setDashboardLoadError(false)
    setTaskBoard(null)
    setTaskBoardReady(false)
    setWorkflowLoadError(false)
  }, [adminProfile])

  useEffect(() => {
    loadDashboardStats()
  }, [loadDashboardStats])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadDashboardStats)
  }, [loadDashboardStats, outletContext])

  const moduleRows = useMemo(
    () => buildDashboardModuleRows(dashboardHealthModules, moduleStats),
    [moduleStats]
  )
  const isSuperAdmin = adminProfile?.is_super_admin === true
  const allowedMenuPaths = useMemo(
    () =>
      new Set(
        Array.isArray(outletContext?.allowedMenuPaths)
          ? outletContext.allowedMenuPaths
          : []
      ),
    [outletContext?.allowedMenuPaths]
  )
  const taskEntryAdminProfile = useMemo(
    () => ({
      ...(adminProfile || {}),
      menus: [...allowedMenuPaths],
    }),
    [adminProfile, allowedMenuPaths]
  )
  const businessSourceRows = useMemo(
    () =>
      moduleRows.flatMap((moduleRow) =>
        moduleRow.sources.map((source) => {
          const pageKey = PAGE_KEY_BY_DASHBOARD_SOURCE[source.key] || source.key
          const rbacAllowsPath =
            isSuperAdmin || allowedMenuPaths.has(source.path)
          const canOpen =
            rbacAllowsPath &&
            effectiveSessionAllowsPage(adminProfile, pageKey, {
              isLocalDev: false,
              isSuperAdmin,
            })
          return {
            ...source,
            module: moduleRow.module,
            canOpen,
          }
        })
      ),
    [adminProfile, allowedMenuPaths, isSuperAdmin, moduleRows]
  )
  const openTaskEntry = (task, access) => {
    const entryPath = resolveWorkflowTaskEntryPath(task)
    if (
      canOpenWorkflowTaskEntry(
        taskEntryAdminProfile,
        entryPath,
        access?.sourceAccess
      )
    ) {
      navigate(entryPath)
    }
  }

  return (
    <Space
      direction="vertical"
      size={10}
      className="erp-dashboard-page erp-business-dashboard-page"
    >
      <Card className="erp-dashboard-card" variant="borderless">
        <div className="erp-business-board-hero erp-business-board-hero--compact">
          <div className="erp-business-board-hero-main">
            <Title level={4} className="erp-dashboard-title">
              业务看板
            </Title>
          </div>
        </div>
      </Card>

      <div className="erp-business-board-workspace">
        <Card
          className="erp-dashboard-card erp-business-board-attention-card"
          variant="borderless"
        >
          <Space direction="vertical" className="erp-dashboard-block" size={8}>
            <Title level={5} className="erp-dashboard-section-title">
              需要关注
            </Title>
            {workflowLoadError ? (
              <Alert
                type="warning"
                showIcon
                message="待办概览暂不可用"
                description="业务统计和各业务页面不受影响，可稍后刷新重试。"
                className="erp-business-board-inline-alert"
              />
            ) : null}
            <div className="erp-business-board-alert-grid">
              {BUSINESS_ATTENTION_LANES.map((definition) => (
                <BusinessAttentionItem
                  key={definition.key}
                  adminProfile={taskEntryAdminProfile}
                  definition={definition}
                  onOpenEntry={openTaskEntry}
                  taskBoard={taskBoard}
                  taskBoardReady={taskBoardReady}
                  onViewAll={
                    (isSuperAdmin || allowedMenuPaths.has('/erp/task-board')) &&
                    effectiveSessionAllowsPage(adminProfile, 'task-board', {
                      isLocalDev: false,
                      isSuperAdmin,
                    })
                      ? (lane) => navigate(`/erp/task-board?lane=${lane}`)
                      : null
                  }
                />
              ))}
            </div>
            <Text type="secondary">显示当前账号可见的任务，每类预览一项。</Text>
          </Space>
        </Card>

        <Card
          className="erp-dashboard-card erp-dashboard-table-card"
          variant="borderless"
          title="业务数据"
        >
          {dashboardLoadError ? (
            <Alert
              type="warning"
              showIcon
              message="业务统计暂不可用"
              description="仍可进入各业务页面；数字恢复后请刷新本页。"
              className="erp-business-board-inline-alert"
            />
          ) : null}
          <Paragraph type="secondary" className="erp-business-board-table-note">
            各项独立统计；0 表示暂无记录，— 表示数量暂不可用。
          </Paragraph>
          <Table
            size="middle"
            loading={{
              spinning: loading,
              indicator: <Spin size="small" />,
            }}
            pagination={false}
            rowKey="key"
            scroll={{ x: 760 }}
            rowClassName={(source) =>
              source.canOpen ? 'erp-business-board-source-item--openable' : ''
            }
            onRow={(source) =>
              source.canOpen
                ? {
                    'data-open-on-double-click': 'true',
                    'data-target-path': source.path,
                    title: `双击进入${source.label}`,
                    onDoubleClick: (event) =>
                      openDashboardItemOnDoubleClick(event, () =>
                        navigate(source.path)
                      ),
                  }
                : {}
            }
            columns={[
              {
                title: '业务环节',
                dataIndex: 'module',
                fixed: 'left',
                width: 125,
                render: (value) => <Text strong>{value}</Text>,
              },
              {
                title: '业务记录',
                dataIndex: 'label',
                width: 155,
                render: (value) => <Text>{value}</Text>,
              },
              {
                title: '当前数量',
                dataIndex: 'total',
                width: 110,
                align: 'right',
                render: (_, source) => (
                  <strong
                    className="erp-business-board-source-count"
                    aria-label={`${source.label}数量${
                      source.available ? formatCount(source.total) : '暂不可用'
                    }`}
                  >
                    {source.available ? formatCount(source.total) : '—'}
                  </strong>
                ),
              },
              {
                title: '统计口径',
                dataIndex: 'truthKind',
                width: 120,
                render: (value) => DATA_BOUNDARY_LABELS[value] || '业务数据',
              },
              {
                title: '进入业务',
                key: 'entry',
                width: 110,
                fixed: 'right',
                render: (_, source) =>
                  source.canOpen ? (
                    <Button
                      type="link"
                      size="small"
                      className="erp-business-board-source-entry"
                      onClick={() => navigate(source.path)}
                      aria-label={`查看${source.label}`}
                    >
                      查看记录 <ArrowRightOutlined aria-hidden="true" />
                    </Button>
                  ) : (
                    <Text
                      type="secondary"
                      className="erp-business-board-source-readonly"
                    >
                      只读
                    </Text>
                  ),
              },
            ]}
            dataSource={businessSourceRows}
          />
        </Card>
      </div>

      <details className="erp-business-board-boundary-summary">
        <summary>
          <InfoCircleOutlined aria-hidden="true" /> 统计说明
        </summary>
        <dl>
          {DATA_BOUNDARIES.map((item) => (
            <div key={item.key}>
              <dt>{item.title}</dt>
              <dd>{item.description}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Space>
  )
}
