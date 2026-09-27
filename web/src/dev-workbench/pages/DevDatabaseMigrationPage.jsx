import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Steps,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import Table from '@/common/components/table/AppTable'
import { message } from '@/common/utils/antdApp'
import DevDatabaseMigrationFlow from '../components/DevDatabaseMigrationFlow.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevStaticGuidance from '../components/DevStaticGuidance.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import {
  DEV_DATABASE_MIGRATION_SOURCE_PATH,
  createDatabaseMigrationIdempotencyKey,
  createDevDatabaseMigrationClient,
  databaseMigrationPathStatuses,
  databaseMigrationDataScopeText,
  databaseMigrationExecutionText,
  databaseMigrationPreparationAvailable,
  databaseMigrationUpgradePresentation,
  databaseMigrationStatusPresentation,
  isDatabaseMigrationOperationPolling,
  selectActiveDatabaseMigrationOperation,
  selectDatabaseMigrationPathOperation,
} from '../config/devDatabaseMigration.mjs'
import {
  formatDevSummaryCheckedAt,
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
  updateDevSummarySnapshot,
} from '../config/devSummarySnapshot.mjs'
import { isDevDatabaseMigrationRecoveryActive } from '../config/devRuntimeRecovery.mjs'

const { Paragraph, Text, Title } = Typography
const OPERATION_POLL_INTERVAL_MS = 1500
const DATABASE_MIGRATION_SNAPSHOT_KEY = 'database-migration'

function StatusTag({ status, issues }) {
  const presentation = databaseMigrationStatusPresentation(status, issues)
  return <Tag color={presentation.color}>{presentation.label}</Tag>
}

function operationUpdateAction(operation) {
  return ['passed', 'failed', 'blocked', 'not_proven'].includes(
    operation?.status
  )
    ? '完成于'
    : '更新于'
}

function shortHash(value) {
  return typeof value === 'string' && value.length >= 12
    ? value.slice(0, 12)
    : '未证明'
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '未证明'
  if (value < 1024) return `${value} B`
  const units = ['KiB', 'MiB', 'GiB']
  let size = value
  let unit = -1
  do {
    size /= 1024
    unit += 1
  } while (size >= 1024 && unit < units.length - 1)
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`
}

function issueText(issues = []) {
  return Array.isArray(issues)
    ? issues.map((issue) => issue.message).join('；')
    : ''
}

function upsertOperation(operations, operation) {
  if (!operation) return operations
  return [operation, ...operations.filter((item) => item.id !== operation.id)]
}

function runtimePresentation(runtime) {
  if (runtime?.available) {
    return { color: 'success', label: 'health / ready 通过' }
  }
  if (
    runtime?.health?.status === 'unavailable' &&
    runtime?.ready?.status === 'unavailable'
  ) {
    return { color: 'default', label: '本地后端未运行' }
  }
  return { color: 'warning', label: '本地后端未就绪' }
}

function toolReadinessPresentation(tools) {
  return tools?.status === 'ready'
    ? { color: 'success', label: '迁移准备环境已就绪' }
    : { color: 'error', label: '迁移准备环境未就绪' }
}

export default function DevDatabaseMigrationPage() {
  const recoveryActive = isDevDatabaseMigrationRecoveryActive()
  const client = useMemo(() => createDevDatabaseMigrationClient(), [])
  const initialSnapshot = useMemo(
    () => readDevSummarySnapshot(DATABASE_MIGRATION_SNAPSHOT_KEY),
    []
  )
  const [summary, setSummary] = useState(initialSnapshot?.summary || null)
  const summaryRef = useRef(initialSnapshot?.summary || null)
  const [initialLoading, setInitialLoading] = useState(!initialSnapshot)
  const [refreshing, setRefreshing] = useState(false)
  const [summaryFresh, setSummaryFresh] = useState(false)
  const [checkedAt, setCheckedAt] = useState(initialSnapshot?.checkedAt || '')
  const [loadError, setLoadError] = useState('')
  const [actionKey, setActionKey] = useState('')
  const [confirmationOperation, setConfirmationOperation] = useState(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [operationDetail, setOperationDetail] = useState(null)
  const mutationInFlightRef = useRef(false)
  const refreshRequestRef = useRef(0)

  const updateSummary = useCallback((update) => {
    const { current } = summaryRef
    const next = typeof update === 'function' ? update(current) : update
    if (!next) return current
    summaryRef.current = next
    updateDevSummarySnapshot(DATABASE_MIGRATION_SNAPSHOT_KEY, () => next)
    setSummary(next)
    return next
  }, [])

  const refresh = useCallback(async () => {
    const requestId = refreshRequestRef.current + 1
    refreshRequestRef.current = requestId
    const hasVisibleSummary = Boolean(summaryRef.current)
    setInitialLoading(!hasVisibleSummary)
    setRefreshing(hasVisibleSummary)
    setSummaryFresh(false)
    setLoadError('')
    try {
      const snapshot = await loadDevSummarySnapshot(
        DATABASE_MIGRATION_SNAPSHOT_KEY,
        () => client.summary()
      )
      if (refreshRequestRef.current !== requestId) return false
      summaryRef.current = snapshot.summary
      setSummary(snapshot.summary)
      setCheckedAt(snapshot.checkedAt)
      setSummaryFresh(true)
      return true
    } catch (error) {
      if (refreshRequestRef.current !== requestId) return false
      setLoadError(error?.message || '数据库迁移状态读取失败')
      return false
    } finally {
      if (refreshRequestRef.current === requestId) {
        setInitialLoading(false)
        setRefreshing(false)
      }
    }
  }, [client])

  useEffect(() => {
    refresh()
    return () => {
      refreshRequestRef.current += 1
    }
  }, [refresh])

  const operations = summary?.operations || []
  const activeOperation = selectActiveDatabaseMigrationOperation(operations)
  const pollingOperation = operations.find((operation) =>
    isDatabaseMigrationOperationPolling(operation.status)
  )

  useEffect(() => {
    if (!pollingOperation) return undefined
    let cancelled = false
    let timer = 0
    const poll = async () => {
      try {
        const operation = await client.operation(pollingOperation.id)
        if (cancelled) return
        updateSummary((current) =>
          current
            ? {
                ...current,
                operations: upsertOperation(
                  current.operations || [],
                  operation
                ),
              }
            : current
        )
        if (!isDatabaseMigrationOperationPolling(operation.status)) {
          await refresh()
          return
        }
      } catch (error) {
        if (!cancelled) {
          message.error(error?.message || '迁移操作状态读取失败')
        }
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, OPERATION_POLL_INTERVAL_MS)
      }
    }

    timer = window.setTimeout(poll, OPERATION_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [client, pollingOperation, refresh, updateSummary])

  const performAction = async (key, action) => {
    if (!summaryFresh || mutationInFlightRef.current) return null
    mutationInFlightRef.current = true
    setSummaryFresh(false)
    setActionKey(key)
    try {
      const operation = await client.act(action)
      updateSummary((current) =>
        current
          ? {
              ...current,
              operations: upsertOperation(current.operations || [], operation),
            }
          : current
      )
      if (['blocked', 'failed', 'not_proven'].includes(operation.status)) {
        message.warning(issueText(operation.issues) || operation.message)
      } else {
        message.success(
          operation.status === 'passed'
            ? operation.message
            : action.action === 'prepare'
              ? '已开始检查、计划与备份恢复验证'
              : action.action === 'restart'
                ? '已开始重启本地后端'
                : '已接受确认，开始升级数据库'
        )
      }
      refresh()
      return operation
    } catch (error) {
      message.error(error?.message || '数据库迁移操作提交失败')
      await refresh()
      return null
    } finally {
      mutationInFlightRef.current = false
      setActionKey('')
    }
  }

  const target = summary?.target
  const runtime = summary?.runtime
  const tools = summary?.tools
  const runtimeState = runtimePresentation(runtime)
  const toolState = toolReadinessPresentation(tools)
  const pendingFiles = target?.pendingFiles
  const isLatest = pendingFiles === 0
  const pathOperation = selectDatabaseMigrationPathOperation(summary)
  const pathStatuses = databaseMigrationPathStatuses(pathOperation)
  const upgradeState = databaseMigrationUpgradePresentation(summary)
  const hasRunningOperation = operations.some((operation) =>
    ['preparing', 'applying', 'restarting'].includes(operation.status)
  )
  const readyOperation =
    activeOperation?.status === 'ready' ? activeOperation : null
  const canPrepare =
    summaryFresh && !actionKey && databaseMigrationPreparationAvailable(summary)
  const canRestart =
    summaryFresh &&
    !actionKey &&
    summary?.status === 'success' &&
    (isLatest || runtime?.bundleId) &&
    !runtime?.available &&
    !hasRunningOperation
  const refreshBusy = initialLoading || refreshing
  const refreshStatusText = initialLoading
    ? '正在读取最新状态'
    : refreshing
      ? `正在后台核对，当前显示 ${formatDevSummaryCheckedAt(checkedAt)} 的结果`
      : summaryFresh
        ? `已核对 ${formatDevSummaryCheckedAt(checkedAt)}`
        : summary
          ? `显示 ${formatDevSummaryCheckedAt(checkedAt)} 的上次结果，写操作暂不可用`
          : '尚未取得可用状态'

  const columns = [
    {
      title: '时间',
      key: 'time',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <DevTimestamp
            value={record.createdAt}
            action="开始于"
            missing="开始时间未证明"
          />
          <DevTimestamp
            value={record.updatedAt}
            action={operationUpdateAction(record)}
            missing="更新时间未证明"
          />
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      key: 'kind',
      width: 112,
      render: (value) => (value === 'migration' ? '数据库升级' : '后端重启'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 126,
      render: (value, record) => (
        <StatusTag status={value} issues={record.issues} />
      ),
    },
    {
      align: 'left',
      title: '结果',
      dataIndex: 'message',
      key: 'message',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{value}</Text>
          {record.issues.length > 0 ? (
            <Text
              type={
                record.issues.some((issue) => issue.severity === 'blocked')
                  ? 'danger'
                  : 'warning'
              }
            >
              {issueText(record.issues)}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      align: 'center',
      width: 96,
      render: (_value, record) => (
        <Button onClick={() => setOperationDetail(record)}>查看</Button>
      ),
    },
  ]

  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-database-migration-page">
      <DevPageNav sourcePath={DEV_DATABASE_MIGRATION_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <DatabaseOutlined aria-hidden="true" />
          </span>
          <Title level={1} className="erp-dev-hub-title">
            数据库迁移
          </Title>
          <Paragraph className="erp-dev-hub-summary">
            面向登记的共享开发库，把 status、plan、真实备份恢复、apply、读回和
            本地后端重启收口为一次可追踪操作。不会自动迁移，也不会自动重试。
          </Paragraph>
        </div>
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={refreshBusy}
              onClick={refresh}
            >
              刷新状态
            </Button>
            <Tooltip
              title={
                canPrepare
                  ? ''
                  : !summaryFresh
                    ? '正在核对最新状态；上次结果只供查看'
                    : isLatest
                      ? '没有待执行迁移；如需重新核对，请使用“刷新状态”'
                      : tools?.status !== 'ready'
                        ? '迁移准备环境未就绪，请按下方检查项处理后刷新'
                        : hasRunningOperation
                          ? '已有操作正在执行'
                          : '当前目标或 migration 状态未通过检查'
              }
            >
              <Button
                type="primary"
                icon={<SafetyCertificateOutlined />}
                disabled={!canPrepare}
                loading={actionKey === 'prepare'}
                onClick={() =>
                  performAction('prepare', {
                    action: 'prepare',
                    idempotencyKey:
                      createDatabaseMigrationIdempotencyKey('prepare'),
                  })
                }
              >
                {summaryFresh && isLatest
                  ? '无需迁移'
                  : readyOperation
                    ? '重新检查并准备'
                    : '检查并准备'}
              </Button>
            </Tooltip>
          </Space>
          <Text type="secondary" role="status" aria-live="polite">
            {refreshStatusText}
          </Text>
        </Space>
      </header>

      <main className="erp-dev-hub-shell erp-dev-database-migration-shell">
        {recoveryActive ? (
          summaryFresh &&
          summary?.status === 'success' &&
          (isLatest || runtime?.bundleId) &&
          runtime?.available ? (
            <Alert
              type="success"
              showIcon
              message="数据库与本地后端已经恢复"
              description="普通 ERP 页面和 RPC 已可重新开放；进入完整效能工作台会重新载入当前页面。"
              action={
                <Button
                  type="primary"
                  onClick={() => window.location.assign('/__dev')}
                >
                  进入完整效能工作台
                </Button>
              }
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="当前处于数据库迁移恢复模式"
              description="启动检查未通过时仍保留本页。请按下方提示处理并刷新状态；数据库、启动检查及后端健康均通过后，才能进入完整工作台。"
            />
          )
        ) : null}
        {loadError ? (
          <Alert
            type={summary ? 'warning' : 'error'}
            showIcon
            message={summary ? '最新状态核对失败' : '数据库迁移页不可用'}
            description={
              summary
                ? `${loadError}；当前保留上次结果，写操作已停用。`
                : loadError
            }
          />
        ) : null}
        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="候选版本检查未通过"
            description={issueText(summary.issues)}
          />
        ) : null}
        {summary ? (
          <Alert
            type={summaryFresh ? upgradeState.type : 'info'}
            showIcon
            message={upgradeState.label}
            description={upgradeState.description}
          />
        ) : null}
        <DevStaticGuidance title="固定安全边界" hint="数据库目标与执行限制">
          仅允许本机 DEV 页面和登记的
          shared-dev；浏览器不能提交数据库地址、账号、SQL、命令、路径或生产目标。准备与执行分开，中断后只记录结果待核对，禁止自动重试。
        </DevStaticGuidance>

        <section
          className="erp-dev-database-migration-summary"
          aria-label="数据库迁移状态摘要"
        >
          <Card title="共享开发库">
            <Space direction="vertical" size={8}>
              <Text code>{target?.safeTarget || '目标未证明'}</Text>
              <Tag color={isLatest ? 'success' : 'warning'}>
                {Number.isSafeInteger(pendingFiles)
                  ? isLatest
                    ? '已是最新版本'
                    : `${pendingFiles} 条待执行`
                  : '状态未证明'}
              </Tag>
              <Text type="secondary">
                当前 {target?.currentVersion || 'none'} · 最新{' '}
                {target?.latestVersion || 'none'}
              </Text>
            </Space>
          </Card>
          <Card title="日常运行">
            <Space direction="vertical" size={8}>
              <Text strong>
                {!summaryFresh
                  ? '状态待刷新核对'
                  : runtime?.available
                    ? '本地服务可用'
                    : '本地服务未恢复'}
              </Text>
              <Tag color={runtimeState.color}>{runtimeState.label}</Tag>
              <Text type="secondary">
                health {runtime?.health?.httpCode || '—'} · ready{' '}
                {runtime?.ready?.httpCode || '—'}
              </Text>
              {runtime?.activeVersion ? (
                <Text>运行迁移版本：{runtime.activeVersion}</Text>
              ) : null}
              {runtime?.bundleId ? (
                <Text type="secondary">运行制品：{runtime.bundleId}</Text>
              ) : null}
              {summaryFresh &&
              runtime?.available &&
              (!recoveryActive || isLatest) ? (
                <Button type="primary" href="/erp">
                  进入业务系统
                </Button>
              ) : null}
              <Button
                icon={<SyncOutlined />}
                disabled={!canRestart}
                loading={actionKey === 'restart'}
                onClick={() =>
                  performAction('restart', {
                    action: 'restart',
                    idempotencyKey:
                      createDatabaseMigrationIdempotencyKey('restart'),
                  })
                }
              >
                恢复已验证后端
              </Button>
            </Space>
          </Card>
          <Card title="执行策略">
            <Space direction="vertical" size={8}>
              <Tag color="blue">一次准备 · 一次执行</Tag>
              <Text>固定后端、页面、迁移及目标数据库身份</Text>
              <Text type="secondary">
                准备期间保留日常版本；候选代码变化后必须重新验证。
              </Text>
              <Text type="secondary">
                开发前端加载当前源码；后端代码修改后运行 make dev_restart。
              </Text>
            </Space>
          </Card>
          <Card title="迁移准备环境">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Tag color={toolState.color}>{toolState.label}</Tag>
              <List
                size="small"
                dataSource={tools?.checks || []}
                locale={{ emptyText: '工具状态未证明' }}
                renderItem={(check) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Space size={6}>
                        <Text>{check.label}</Text>
                        <Tag
                          color={
                            check.status === 'passed' ? 'success' : 'error'
                          }
                        >
                          {check.status === 'passed' ? '已就绪' : '需处理'}
                        </Tag>
                      </Space>
                      {check.status === 'blocked' ? (
                        <Text type="secondary">{check.message}</Text>
                      ) : null}
                    </Space>
                  </List.Item>
                )}
              />
            </Space>
          </Card>
        </section>

        <Card
          title="本次升级路径"
          extra={
            pathOperation ? (
              <Space size={8} wrap>
                <Text type="secondary">
                  {activeOperation?.kind === 'migration'
                    ? '当前升级'
                    : '最近一次升级'}
                  {pathOperation.target?.latestVersion
                    ? ` · 目标 ${pathOperation.target.latestVersion}`
                    : ''}
                </Text>
                <StatusTag
                  status={pathOperation.status}
                  issues={pathOperation.issues}
                />
              </Space>
            ) : (
              <Text type="secondary">流程示意</Text>
            )
          }
        >
          <div className="erp-dev-database-migration-flow">
            <Steps
              responsive
              size="small"
              labelPlacement="vertical"
              items={[
                {
                  title: '固定候选版本',
                  description: '核对目标，固定代码、配置与迁移计划',
                  status: pathStatuses[0],
                },
                {
                  title: '恢复演练',
                  description: '临时库升级、附件恢复与候选业务验证',
                  status: pathStatuses[1],
                },
                {
                  title: '停写与恢复点',
                  description: '确认后暂停写入，验证最新成套备份',
                  status: pathStatuses[2],
                },
                {
                  title: '原库迁移事务',
                  description:
                    pathOperation?.target?.pendingFiles === 0
                      ? '本次无待执行迁移，跳过此步'
                      : 'BEGIN → 迁移 SQL → COMMIT',
                  status: pathStatuses[3],
                },
                {
                  title: '业务验证',
                  description: '读回原库，验证新后端、登录与业务',
                  status: pathStatuses[4],
                },
                {
                  title: '切换日常版本',
                  description: '验证通过后更新固定运行版本',
                  status: pathStatuses[5],
                },
              ]}
            />
            <Text type="secondary">
              仅点亮已有完成证据的节点，具体进展见操作记录。数据库事务只覆盖原库迁移，不包含恢复演练、业务验证和版本切换。
            </Text>
            {pathOperation ? (
              <Text>{databaseMigrationExecutionText(pathOperation)}</Text>
            ) : null}
            {pathOperation?.backup ? (
              <Text type="secondary">
                演练范围（{pathOperation.backup.migrationBefore} →{' '}
                {pathOperation.backup.migrationAfter}）：
                {databaseMigrationDataScopeText(pathOperation.backup)}
              </Text>
            ) : null}
            <DevDatabaseMigrationFlow />
          </div>
          {readyOperation ? (
            <div className="erp-dev-database-migration-ready">
              <Alert
                type="warning"
                showIcon
                message="计划与备份恢复验证已完成，等待你的明确确认"
                description={`将从 ${readyOperation.target?.currentVersion} 升级到 ${readyOperation.target?.latestVersion}；备份 ${readyOperation.backup?.id} 已在隔离 PostgreSQL 中恢复并验证。`}
                action={
                  <Button
                    type="primary"
                    danger
                    disabled={!summaryFresh || Boolean(actionKey)}
                    onClick={() => {
                      setConfirmationOperation(readyOperation)
                      setConfirmationText('')
                    }}
                  >
                    确认升级并重启
                  </Button>
                }
              />
            </div>
          ) : null}
          {!activeOperation && isLatest ? (
            <div className="erp-dev-database-migration-ready">
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="数据库已经是最新版本"
                description="前端使用当前源码并支持热更新；后端代码变化后执行 make dev_restart，先编译验证再替换运行进程。"
              />
            </div>
          ) : null}
        </Card>

        <Card
          title="历史操作记录"
          extra={<HistoryOutlined aria-hidden="true" />}
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={operations}
            loading={initialLoading}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            locale={{
              emptyText: <Empty description="尚无数据库迁移操作" />,
            }}
            scroll={{ x: 760 }}
          />
        </Card>
      </main>

      <Modal
        title="确认升级共享开发库"
        open={Boolean(confirmationOperation)}
        okText="确认升级并重启"
        cancelText="取消"
        confirmLoading={
          actionKey === `execute:${confirmationOperation?.id || ''}`
        }
        cancelButtonProps={{
          disabled: actionKey === `execute:${confirmationOperation?.id || ''}`,
        }}
        closable={actionKey !== `execute:${confirmationOperation?.id || ''}`}
        maskClosable={
          actionKey !== `execute:${confirmationOperation?.id || ''}`
        }
        keyboard={actionKey !== `execute:${confirmationOperation?.id || ''}`}
        okButtonProps={{
          danger: true,
          disabled:
            !summaryFresh ||
            !confirmationOperation ||
            confirmationText !== confirmationOperation.confirmationPrompt,
        }}
        onOk={async () => {
          if (!confirmationOperation) return
          const operation = await performAction(
            `execute:${confirmationOperation.id}`,
            {
              action: 'execute',
              operationId: confirmationOperation.id,
              confirmation: confirmationText,
            }
          )
          if (operation) {
            setConfirmationOperation(null)
            setConfirmationText('')
          }
        }}
        onCancel={() => {
          if (actionKey === `execute:${confirmationOperation?.id || ''}`) {
            return
          }
          setConfirmationOperation(null)
          setConfirmationText('')
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="该动作会写入共享开发数据库并重启本地后端"
            description="确认后会短暂停止业务写入，验证最新备份，再执行当前计划并切换到已验证的固定版本。此确认不包含清空业务数据；结果未知时保留现场，不自动重试。"
          />
          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              {
                key: 'range',
                label: '升级范围',
                children: (
                  <>
                    {confirmationOperation?.target?.currentVersion} →{' '}
                    {confirmationOperation?.target?.latestVersion}
                  </>
                ),
              },
              {
                key: 'backup',
                label: '备份',
                children: confirmationOperation?.backup?.id || '未证明',
              },
              {
                key: 'restore',
                label: '恢复验证',
                children: confirmationOperation?.backup?.restoreVerified
                  ? '已通过'
                  : '未证明',
              },
            ]}
          />
          <Text>请完整输入以下确认文本：</Text>
          <Text copyable code>
            {confirmationOperation?.confirmationPrompt || ''}
          </Text>
          <Input
            autoFocus
            aria-label="数据库升级确认文本"
            value={confirmationText}
            maxLength={180}
            placeholder="粘贴完整确认文本"
            onChange={(event) => setConfirmationText(event.target.value)}
          />
        </Space>
      </Modal>

      <Drawer
        title="数据库迁移 Operation"
        open={Boolean(operationDetail)}
        width={640}
        onClose={() => setOperationDetail(null)}
        destroyOnHidden
      >
        {operationDetail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <StatusTag
                status={operationDetail.status}
                issues={operationDetail.issues}
              />
              <Text code copyable>
                {operationDetail.id}
              </Text>
            </Space>
            <Space wrap size={[12, 4]}>
              <DevTimestamp
                value={operationDetail.createdAt}
                action="开始于"
                missing="开始时间未证明"
              />
              <DevTimestamp
                value={operationDetail.updatedAt}
                action={operationUpdateAction(operationDetail)}
                missing="更新时间未证明"
              />
            </Space>
            <Paragraph>{operationDetail.message}</Paragraph>
            <Paragraph>
              {databaseMigrationExecutionText(operationDetail)}
            </Paragraph>
            {operationDetail.issues.length > 0 ? (
              <Alert
                type="error"
                showIcon
                message="已记录问题"
                description={issueText(operationDetail.issues)}
              />
            ) : null}
            {operationDetail.plan ? (
              <Descriptions
                size="small"
                column={1}
                bordered
                items={[
                  {
                    key: 'hash',
                    label: '计划哈希',
                    children: (
                      <Text code copyable>
                        {operationDetail.plan.hash}
                      </Text>
                    ),
                  },
                  {
                    key: 'prepared-at',
                    label: '计划准备',
                    children: (
                      <DevTimestamp
                        value={operationDetail.plan.preparedAt}
                        missing="计划准备时间未证明"
                      />
                    ),
                  },
                ]}
              />
            ) : null}
            {operationDetail.backup ? (
              <Descriptions
                size="small"
                column={1}
                bordered
                items={[
                  {
                    key: 'id',
                    label: '备份 ID',
                    children: operationDetail.backup.id,
                  },
                  {
                    key: 'size',
                    label: '备份大小',
                    children: formatBytes(operationDetail.backup.sizeBytes),
                  },
                  {
                    key: 'sha256',
                    label: '备份 SHA-256',
                    children: (
                      <Text code copyable>
                        {operationDetail.backup.sha256}
                      </Text>
                    ),
                  },
                  {
                    key: 'restore',
                    label: '隔离恢复',
                    children: operationDetail.backup.restoreVerified
                      ? `${operationDetail.backup.migrationBefore} → ${operationDetail.backup.migrationAfter}`
                      : '未证明',
                  },
                  {
                    key: 'data-scope',
                    label: '演练数据范围',
                    children: databaseMigrationDataScopeText(
                      operationDetail.backup
                    ),
                  },
                  {
                    key: 'verified-at',
                    label: '恢复验证完成',
                    children: (
                      <DevTimestamp
                        value={operationDetail.backup.verifiedAt}
                        missing="恢复验证时间未证明"
                      />
                    ),
                  },
                ]}
              />
            ) : null}
            {operationDetail.source ? (
              <Text type="secondary">
                migration 真源 {shortHash(operationDetail.source.fingerprint)}
                {' · '}commit {shortHash(operationDetail.source.commit)}
              </Text>
            ) : null}
            <List
              header="状态事件"
              dataSource={operationDetail.events || []}
              locale={{ emptyText: '暂无状态事件' }}
              renderItem={(event) => (
                <List.Item>
                  <Space direction="vertical" size={2}>
                    <Space wrap>
                      <StatusTag status={event.status} />
                      <DevTimestamp value={event.at} missing="事件时间未证明" />
                    </Space>
                    <Text>{event.message}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        ) : null}
      </Drawer>
    </div>
  )
}
