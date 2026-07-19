import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Space, Spin, Table, Typography } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getBusinessDashboardStats } from '../api/businessDashboardApi.mjs'
import { getWorkflowTaskBoard } from '../api/workflowApi.mjs'
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
  buildDashboardSummary,
  normalizeDashboardModuleStats,
} from '../utils/dashboardStats.mjs'
import { openDashboardItemOnDoubleClick } from '../utils/dashboardDoubleClick.mjs'
import { effectiveSessionAllowsPage } from '../utils/adminProfileSync.mjs'
import { TASK_BOARD_LANE_DEFINITIONS } from '../utils/workflowTaskBoard.mjs'

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
    key: 'business-record',
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

export default function BusinessDashboardPage() {
  const [loading, setLoading] = useState(false)
  const [moduleStats, setModuleStats] = useState([])
  const [dashboardLoadError, setDashboardLoadError] = useState(false)
  const [taskBoard, setTaskBoard] = useState(null)
  const [taskBoardReady, setTaskBoardReady] = useState(false)
  const [workflowLoadError, setWorkflowLoadError] = useState(false)
  const mountedRef = useRef(false)
  const loadPromiseRef = useRef(null)
  const navigate = useNavigate()
  const outletContext = useOutletContext()

  const loadDashboardStats = useCallback(async () => {
    if (loadPromiseRef.current) {
      return loadPromiseRef.current
    }

    setLoading(true)
    const request = (async () => {
      const [dashboardResult, workflowResult] = await Promise.allSettled([
        getBusinessDashboardStats(),
        getWorkflowTaskBoard({ limit: 1, offset: 0 }),
      ])

      if (!mountedRef.current) {
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
    })()

    loadPromiseRef.current = request

    try {
      return await request
    } finally {
      loadPromiseRef.current = null
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

  const moduleRows = useMemo(
    () => buildDashboardModuleRows(dashboardHealthModules, moduleStats),
    [moduleStats]
  )
  const summary = useMemo(() => buildDashboardSummary(moduleRows), [moduleRows])
  const isSuperAdmin = outletContext?.adminProfile?.is_super_admin === true
  const allowedMenuPaths = useMemo(
    () =>
      new Set(
        Array.isArray(outletContext?.allowedMenuPaths)
          ? outletContext.allowedMenuPaths
          : []
    ),
    [outletContext?.allowedMenuPaths]
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
            effectiveSessionAllowsPage(outletContext?.adminProfile, pageKey, {
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
    [allowedMenuPaths, isSuperAdmin, moduleRows, outletContext?.adminProfile]
  )
  const collaborationRisk = taskBoardReady
    ? Number(taskBoard?.counts?.exception || 0) +
      Number(taskBoard?.counts?.due || 0)
    : null

  const businessMetricCards = useMemo(
    () => [
      {
        key: 'master-data',
        title: '基础资料',
        note: '档案与物料清单',
        ...summary[DASHBOARD_TRUTH_KINDS.MASTER_DATA],
      },
      {
        key: 'source-document',
        title: '业务单据',
        note: '订单与合同',
        ...summary[DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT],
      },
      {
        key: 'business-fact',
        title: '办理结果',
        note: '已经发生',
        ...summary[DASHBOARD_TRUTH_KINDS.BUSINESS_FACT],
      },
      {
        key: 'collaboration-risk',
        title: '需要关注',
        note: '当前账号',
        available: taskBoardReady,
        total: collaborationRisk,
        color: '#d4380d',
      },
    ],
    [collaborationRisk, summary, taskBoardReady]
  )

  const openTaskEntry = (task) => {
    const entryPath = resolveWorkflowTaskEntryPath(task)
    if (entryPath) {
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
            <Paragraph type="secondary" className="erp-dashboard-summary">
              从业务数量和待办风险定位需要关注的环节。
            </Paragraph>
          </div>
        </div>
        <div className="erp-business-board-summary-grid">
          {businessMetricCards.map((item) => {
            const displayValue = item.available ? formatCount(item.total) : '—'
            return (
              <div
                className="erp-business-board-summary-card erp-metric-readonly-card"
                key={item.key}
                aria-label={`${item.title} ${
                  item.available ? displayValue : '暂不可用'
                }，只读摘要`}
              >
                <div className="erp-metric-readonly-card__head">
                  <Text type="secondary">{item.title}</Text>
                  <span className="erp-metric-readonly-card__badge">
                    {item.note}
                  </span>
                </div>
                <strong style={item.color ? { color: item.color } : undefined}>
                  {displayValue}
                </strong>
                {!item.available ? (
                  <Text
                    type="secondary"
                    className="erp-metric-readonly-card__hint"
                  >
                    暂不可用
                  </Text>
                ) : null}
              </div>
            )
          })}
        </div>
        <Paragraph type="secondary" className="erp-business-board-summary-note">
          四类数字分别统计，请不要直接相加；“需要关注”只统计当前账号可见的阻塞和到期任务。
        </Paragraph>
      </Card>

      <div className="erp-business-board-workspace">
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
            每项分别统计；0 表示当前确实为零，—
            表示统计暂不可用。有“查看业务记录”的项目可进入，电脑端也可双击整行；其他项目仅显示数量。
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
              source.canOpen
                ? 'erp-business-board-source-item--openable'
                : ''
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
                width: 150,
                render: (value) => <Text strong>{value}</Text>,
              },
              {
                title: '业务记录',
                dataIndex: 'label',
                width: 180,
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
                width: 150,
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
                      查看业务记录
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
              {BUSINESS_ATTENTION_LANES.map((definition) => {
                const lane = getLane(taskBoard, definition.key)
                const total = taskBoardReady
                  ? taskBoard.counts[definition.key]
                  : null
                const task = taskBoardReady ? lane?.tasks?.[0] : null
                const entryPath = task ? resolveWorkflowTaskEntryPath(task) : ''
                return (
                  <div
                    className={`erp-business-board-alert-item${
                      entryPath
                        ? ' erp-business-board-alert-item--openable'
                        : ''
                    }`}
                    key={definition.key}
                    data-open-on-double-click={entryPath ? 'true' : undefined}
                    title={entryPath ? '双击查看相关业务' : undefined}
                    onDoubleClick={
                      entryPath
                        ? (event) =>
                            openDashboardItemOnDoubleClick(event, () =>
                              openTaskEntry(task)
                            )
                        : undefined
                    }
                  >
                    <div>
                      <Text strong>{definition.title}</Text>
                      <strong className="erp-business-board-alert-count">
                        {taskBoardReady ? formatCount(total) : '—'}
                      </strong>
                    </div>
                    {!taskBoardReady ? (
                      <Text type="secondary">暂不可用</Text>
                    ) : task ? (
                      entryPath ? (
                        <Button
                          type="link"
                          size="small"
                          className="erp-dashboard-link-button erp-business-board-task-entry"
                          onClick={() => openTaskEntry(task)}
                          aria-label={`查看${task.task_name || definition.title}`}
                        >
                          {task.task_name || definition.title} /{' '}
                          {formatWorkflowTaskSource(task)}
                        </Button>
                      ) : (
                        <Text className="erp-business-board-task-text">
                          {task.task_name || definition.title} /{' '}
                          {formatWorkflowTaskSource(task)}
                        </Text>
                      )
                    ) : total > 0 ? (
                      <Text type="secondary">暂无可展示事项</Text>
                    ) : (
                      <Text type="secondary">暂无</Text>
                    )}
                  </div>
                )
              })}
            </div>
            <Text type="secondary">
              阻塞和到期任务互不重复；显示当前账号可见的总数，每类最多展示一项。
            </Text>
          </Space>
        </Card>
      </div>

      <Text type="secondary" className="erp-business-board-boundary-summary">
        {DATA_BOUNDARIES.map(
          (item) => `${item.title}：${item.description}`
        ).join('；')}
      </Text>
    </Space>
  )
}
