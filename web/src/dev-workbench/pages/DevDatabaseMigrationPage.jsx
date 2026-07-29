import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_DATABASE_MIGRATION_SOURCE_PATH,
  createDatabaseMigrationIdempotencyKey,
  createDevDatabaseMigrationClient,
  databaseMigrationStatusPresentation,
  formatDatabaseMigrationTimestamp,
  isDatabaseMigrationOperationPolling,
  selectActiveDatabaseMigrationOperation,
} from '../config/devDatabaseMigration.mjs'

const { Paragraph, Text, Title } = Typography
const OPERATION_POLL_INTERVAL_MS = 1500

function StatusTag({ status }) {
  const presentation = databaseMigrationStatusPresentation(status)
  return <Tag color={presentation.color}>{presentation.label}</Tag>
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

function operationStepStatus(operation, step) {
  if (!operation) return 'wait'
  const failed = ['failed', 'blocked', 'not_proven'].includes(operation.status)
  const ranks = {
    preparing: 0,
    ready: 3,
    applying: 3,
    restarting: 4,
    passed: 5,
    failed: 3,
    blocked: 0,
    not_proven: 3,
  }
  const rank = ranks[operation.status] ?? 0
  if (failed && step === Math.min(rank, 4)) return 'error'
  if (step < rank || operation.status === 'passed') return 'finish'
  if (
    (operation.status === 'preparing' && step <= 2) ||
    (operation.status === 'applying' && step === 3) ||
    (operation.status === 'restarting' && step === 4)
  ) {
    return 'process'
  }
  return 'wait'
}

export default function DevDatabaseMigrationPage() {
  const client = useMemo(() => createDevDatabaseMigrationClient(), [])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionKey, setActionKey] = useState('')
  const [confirmationOperation, setConfirmationOperation] = useState(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [operationDetail, setOperationDetail] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setSummary(await client.summary())
    } catch (error) {
      setLoadError(error?.message || '数据库迁移状态读取失败')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    refresh()
  }, [refresh])

  const operations = summary?.operations || []
  const activeOperation = selectActiveDatabaseMigrationOperation(operations)
  const pollingOperation = operations.find((operation) =>
    isDatabaseMigrationOperationPolling(operation.status)
  )

  useEffect(() => {
    if (!pollingOperation) return undefined
    let cancelled = false
    const timer = window.setInterval(async () => {
      try {
        const operation = await client.operation(pollingOperation.id)
        if (cancelled) return
        setSummary((current) =>
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
          window.clearInterval(timer)
          refresh()
        }
      } catch (error) {
        if (!cancelled) {
          message.error(error?.message || '迁移操作状态读取失败')
        }
      }
    }, OPERATION_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [client, pollingOperation, refresh])

  const performAction = async (key, action) => {
    setActionKey(key)
    try {
      const operation = await client.act(action)
      setSummary((current) =>
        current
          ? {
              ...current,
              operations: upsertOperation(current.operations || [], operation),
            }
          : current
      )
      message.success(
        action.action === 'prepare'
          ? '已开始检查、计划与备份恢复验证'
          : action.action === 'restart'
            ? '已开始重启本地后端'
            : '已接受确认，开始升级数据库'
      )
      return operation
    } catch (error) {
      message.error(error?.message || '数据库迁移操作提交失败')
      return null
    } finally {
      setActionKey('')
    }
  }

  const target = summary?.target
  const runtime = summary?.runtime
  const runtimeState = runtimePresentation(runtime)
  const pendingFiles = target?.pendingFiles
  const isLatest = pendingFiles === 0
  const hasRunningOperation = operations.some((operation) =>
    ['preparing', 'applying', 'restarting'].includes(operation.status)
  )
  const readyOperation =
    activeOperation?.status === 'ready' ? activeOperation : null
  const canPrepare =
    summary?.status === 'success' &&
    target?.key === 'shared-dev' &&
    Number.isSafeInteger(pendingFiles) &&
    pendingFiles > 0 &&
    !hasRunningOperation &&
    !readyOperation
  const canRestart =
    summary?.status === 'success' &&
    isLatest &&
    !runtime?.available &&
    !hasRunningOperation

  const columns = [
    {
      title: '时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 176,
      render: (value) => formatDatabaseMigrationTimestamp(value),
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
      render: (value) => <StatusTag status={value} />,
    },
    {
      title: '结果',
      dataIndex: 'message',
      key: 'message',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{value}</Text>
          {record.issues.length > 0 ? (
            <Text type="danger">{issueText(record.issues)}</Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      align: 'right',
      width: 180,
      render: (_value, record) => (
        <Space>
          <Button onClick={() => setOperationDetail(record)}>查看</Button>
          {record.status === 'ready' ? (
            <Button
              type="primary"
              danger
              onClick={() => {
                setConfirmationOperation(record)
                setConfirmationText('')
              }}
            >
              确认升级
            </Button>
          ) : null}
        </Space>
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
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={refresh}>
            刷新状态
          </Button>
          <Tooltip
            title={
              canPrepare
                ? ''
                : isLatest
                  ? '数据库已是最新版本'
                  : readyOperation
                    ? '已有准备完成的不可变计划，请确认或刷新状态'
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
              检查并准备
            </Button>
          </Tooltip>
        </Space>
      </header>

      <main className="erp-dev-hub-shell erp-dev-database-migration-shell">
        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="数据库迁移页不可用"
            description={loadError}
          />
        ) : null}
        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="当前状态被阻断"
            description={issueText(summary.issues)}
          />
        ) : null}
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="固定安全边界"
          description="仅允许本机 DEV 页面和登记的 shared-dev；浏览器不能提交数据库地址、账号、SQL、命令、路径或生产目标。准备与执行分开，中断后只记录结果待核对，禁止自动重试。"
        />

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
          <Card title="本地后端">
            <Space direction="vertical" size={8}>
              <Tag color={runtimeState.color}>{runtimeState.label}</Tag>
              <Text type="secondary">
                health {runtime?.health?.httpCode || '—'} · ready{' '}
                {runtime?.ready?.httpCode || '—'}
              </Text>
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
                重启后端
              </Button>
            </Space>
          </Card>
          <Card title="执行策略">
            <Space direction="vertical" size={8}>
              <Tag color="blue">一次准备 · 一次执行</Tag>
              <Text>只绑定 migration / schema 真源与目标身份</Text>
              <Text type="secondary">
                无关文档或页面变化不会让已准备计划反复重建。
              </Text>
            </Space>
          </Card>
        </section>

        <Card
          title="本次升级路径"
          extra={
            activeOperation ? (
              <StatusTag status={activeOperation.status} />
            ) : null
          }
        >
          <Steps
            responsive
            items={[
              {
                title: '检查目标',
                description: '固定 shared-dev 与 migration 状态',
                status: operationStepStatus(activeOperation, 0),
              },
              {
                title: '不可变计划',
                description: 'dry-run 与事务回滚预演',
                status: operationStepStatus(activeOperation, 1),
              },
              {
                title: '备份恢复',
                description: '真实 dump、隔离恢复与升级验证',
                status: operationStepStatus(activeOperation, 2),
              },
              {
                title: '明确确认',
                description: '只消费当前计划一次',
                status: operationStepStatus(activeOperation, 3),
              },
              {
                title: '读回重启',
                description: 'pending=0、health 与 ready',
                status: operationStepStatus(activeOperation, 4),
              },
            ]}
          />
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
                description="无需再次 plan、备份或 apply；如果本地后端未运行，只使用上方“重启后端”。"
              />
            </div>
          ) : null}
        </Card>

        <Card
          title="Operation 记录"
          extra={<HistoryOutlined aria-hidden="true" />}
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={operations}
            loading={loading}
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
        okButtonProps={{
          danger: true,
          disabled:
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
            description="执行前会再次核对 migration / schema 指纹、目标身份与 pending revisions；不一致时直接阻断。若提交结果未知，不会自动重试。"
          />
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="升级范围">
              {confirmationOperation?.target?.currentVersion} →{' '}
              {confirmationOperation?.target?.latestVersion}
            </Descriptions.Item>
            <Descriptions.Item label="备份">
              {confirmationOperation?.backup?.id || '未证明'}
            </Descriptions.Item>
            <Descriptions.Item label="恢复验证">
              {confirmationOperation?.backup?.restoreVerified
                ? '已通过'
                : '未证明'}
            </Descriptions.Item>
          </Descriptions>
          <Text>请完整输入以下确认文本：</Text>
          <Text copyable code>
            {confirmationOperation?.confirmationPrompt || ''}
          </Text>
          <Input
            autoFocus
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
              <StatusTag status={operationDetail.status} />
              <Text code copyable>
                {operationDetail.id}
              </Text>
            </Space>
            <Paragraph>{operationDetail.message}</Paragraph>
            {operationDetail.issues.length > 0 ? (
              <Alert
                type="error"
                showIcon
                message="已记录问题"
                description={issueText(operationDetail.issues)}
              />
            ) : null}
            {operationDetail.backup ? (
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="备份 ID">
                  {operationDetail.backup.id}
                </Descriptions.Item>
                <Descriptions.Item label="备份大小">
                  {formatBytes(operationDetail.backup.sizeBytes)}
                </Descriptions.Item>
                <Descriptions.Item label="备份 SHA-256">
                  <Text code copyable>
                    {operationDetail.backup.sha256}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="隔离恢复">
                  {operationDetail.backup.restoreVerified
                    ? `${operationDetail.backup.migrationBefore} → ${operationDetail.backup.migrationAfter}`
                    : '未证明'}
                </Descriptions.Item>
              </Descriptions>
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
                      <Text type="secondary">
                        {formatDatabaseMigrationTimestamp(event.at)}
                      </Text>
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
