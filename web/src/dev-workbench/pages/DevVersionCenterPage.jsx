import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_DELIVERY_SOURCE_PATH,
  createDeliveryIdempotencyKey,
  createDevDeliveryClient,
  defaultReleaseVersion,
  deliveryStatusPresentation,
  deliveryVersionActionKind,
  formatDeliveryBytes,
  shortGitSha,
} from '../config/devDelivery.mjs'

const { Paragraph, Text, Title } = Typography

function StatusTag({ status }) {
  const presentation = deliveryStatusPresentation(status)
  return <Tag color={presentation.color}>{presentation.label}</Tag>
}

function issueDescription(issues = []) {
  if (!Array.isArray(issues) || issues.length === 0) return ''
  return issues.map((issue) => issue.message).join('；')
}

export default function DevVersionCenterPage() {
  const client = useMemo(() => createDevDeliveryClient(), [])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionKey, setActionKey] = useState('')
  const [loadError, setLoadError] = useState('')
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [releaseVersion, setReleaseVersion] = useState(
    defaultReleaseVersion()
  )
  const [confirmOperation, setConfirmOperation] = useState(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [operationDetail, setOperationDetail] = useState(null)
  const [operationDetailLoading, setOperationDetailLoading] =
    useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setSummary(await client.summary())
    } catch (error) {
      setLoadError(error?.message || '版本中心状态读取失败')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    refresh()
  }, [refresh])

  const performAction = useCallback(
    async (key, action, payload) => {
      setActionKey(key)
      try {
        await client.action(action, payload)
        message.success(
          action === 'dispatch-release'
            ? 'GitHub 发布任务已登记'
            : action === 'prepare-promotion'
              ? '部署准备结果已登记'
              : action === 'prepare-rollback'
                ? '回滚资格结果已登记'
              : '部署执行器已启动，请按 operation 跟踪'
        )
        await refresh()
        return true
      } catch (error) {
        message.error(error?.message || '操作未完成')
        await refresh()
        return false
      } finally {
        setActionKey('')
      }
    },
    [client, refresh]
  )

  const repository = summary?.repository
  const target = summary?.target
  const versions = summary?.versions || []
  const operations = summary?.operations || []
  const currentTargetSha = target?.remote?.runtime?.serverSha || ''
  const currentTargetRelease = versions.find(
    (version) => version.gitSha === currentTargetSha
  )
  const targetPassed = target?.status === 'passed'
  const canDispatch = Boolean(repository && !repository.dirty)

  const submitRelease = async () => {
    if (!repository) return
    const succeeded = await performAction(
      'dispatch-release',
      'dispatch-release',
      {
        gitSha: repository.commit,
        version: releaseVersion.trim(),
        idempotencyKey: createDeliveryIdempotencyKey('release'),
      }
    )
    if (succeeded) setReleaseModalOpen(false)
  }

  const openOperationDetail = async (operation) => {
    setOperationDetail(operation)
    setOperationDetailLoading(true)
    try {
      setOperationDetail(await client.operation(operation.id))
    } catch (error) {
      message.error(error?.message || 'Operation 详情读取失败')
    } finally {
      setOperationDetailLoading(false)
    }
  }

  const versionColumns = [
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" code>
            {shortGitSha(record.gitSha)}
          </Text>
        </Space>
      ),
    },
    {
      title: '发布状态',
      dataIndex: 'status',
      key: 'status',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <StatusTag status={value} />
          <Text type="secondary">
            {record.completeAssets
              ? `${record.assets.length} 项制品齐全`
              : '制品不完整'}
          </Text>
        </Space>
      ),
    },
    {
      title: '133',
      key: 'target',
      render: (_value, record) =>
        record.gitSha === currentTargetSha ? (
          <Tag color="success">当前运行</Tag>
        ) : (
          <Text type="secondary">未部署</Text>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'right',
      render: (_value, record) => {
        const actionKind = deliveryVersionActionKind(
          record,
          currentTargetRelease
        )
        const baseEligible =
          record.status === 'published' &&
          record.completeAssets === true &&
          record.gitSha !== currentTargetSha &&
          targetPassed
        const promotionEligible =
          baseEligible && actionKind === 'promote'
        const rollbackEligible =
          baseEligible &&
          actionKind === 'rollback' &&
          currentTargetRelease?.status === 'published' &&
          currentTargetRelease?.completeAssets === true
        const promotionExplanation = !targetPassed
          ? '133 只读预检未通过，先处理容量或运行态阻断'
          : !record.completeAssets
            ? '不可变发布制品不完整'
            : record.gitSha === currentTargetSha
              ? '该 exact SHA 已在 133 运行'
              : actionKind === 'rollback'
                ? '该版本早于 133 当前版本，应先检查回滚资格'
                : actionKind === 'blocked'
                  ? '版本发布时间顺序不可证明，禁止猜测部署或回滚'
                  : ''
        return (
          <Space wrap>
            <Tooltip
              title={promotionEligible ? '' : promotionExplanation}
            >
              <Button
                icon={<CloudDownloadOutlined />}
                disabled={!promotionEligible}
                loading={actionKey === `prepare:${record.gitSha}`}
                onClick={() =>
                  performAction(
                    `prepare:${record.gitSha}`,
                    'prepare-promotion',
                    {
                      gitSha: record.gitSha,
                      version: record.version,
                      target: 'test-133',
                      idempotencyKey:
                        createDeliveryIdempotencyKey('promote'),
                    }
                  )
                }
              >
                准备部署
              </Button>
            </Tooltip>
            <Tooltip
              title={
                rollbackEligible
                  ? '只准备资格检查；migration 或客户配置指纹不一致会阻断'
                  : currentTargetRelease
                    ? actionKind === 'promote'
                      ? '该版本不早于 133 当前版本，应走部署'
                      : promotionExplanation
                    : '133 当前 SHA 没有完整不可变 manifest，不能普通回滚'
              }
            >
              <Button
                icon={<RollbackOutlined />}
                disabled={!rollbackEligible}
                loading={actionKey === `rollback:${record.gitSha}`}
                onClick={() =>
                  performAction(
                    `rollback:${record.gitSha}`,
                    'prepare-rollback',
                    {
                      fromGitSha: currentTargetRelease.gitSha,
                      fromVersion: currentTargetRelease.version,
                      toGitSha: record.gitSha,
                      toVersion: record.version,
                      target: 'test-133',
                      idempotencyKey:
                        createDeliveryIdempotencyKey('rollback'),
                    }
                  )
                }
              >
                检查回滚
              </Button>
            </Tooltip>
          </Space>
        )
      },
    },
  ]

  const operationColumns = [
    {
      title: '动作',
      key: 'action',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>
            {record.action === 'release'
              ? '发布制品'
              : record.action === 'promote'
                ? '部署 133'
                : '回滚'}
          </Text>
          <Text type="secondary" code>
            {record.id.slice(0, 8)}
          </Text>
        </Space>
      ),
    },
    {
      title: '版本身份',
      key: 'identity',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.version}</Text>
          <Text type="secondary" code>
            {shortGitSha(record.gitSha)}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <StatusTag status={record.status} />
          {record.issues.length > 0 ? (
            <Text type="danger">{issueDescription(record.issues)}</Text>
          ) : (
            <Text type="secondary">
              {record.events.at(-1)?.message || '等待状态'}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'right',
      render: (_value, record) => {
        const executable =
          record.status === 'ready' &&
          ['promote', 'rollback'].includes(record.action)
        return (
          <Space wrap>
            <Button onClick={() => openOperationDetail(record)}>
              查看详情
            </Button>
            {executable ? (
              <Button
                type="primary"
                danger={record.action === 'rollback'}
                icon={
                  record.action === 'rollback' ? (
                    <RollbackOutlined />
                  ) : (
                    <DeploymentUnitOutlined />
                  )
                }
                onClick={() => {
                  setConfirmOperation(record)
                  setConfirmationText('')
                }}
              >
                {record.action === 'rollback'
                  ? '确认回滚'
                  : '确认部署'}
              </Button>
            ) : (
              <Text type="secondary">
                {record.terminal ? '终态不可重试' : '等待状态更新'}
              </Text>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-version-page">
      <DevPageNav sourcePath={DEV_DELIVERY_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <DeploymentUnitOutlined aria-hidden="true" />
          </span>
          <Title level={1} className="erp-dev-hub-title">
            版本发布与部署中心
          </Title>
          <Paragraph className="erp-dev-hub-summary">
            以 exact SHA 选择不可变版本，只部署到固定 test-133。每次动作有独立
            operation；失败、阻断或结果未证明后不会自动重试。
          </Paragraph>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={refresh}
          >
            刷新状态
          </Button>
          <Tooltip
            title={
              canDispatch
                ? ''
                : '当前工作树不干净或仓库身份不可用，不能创建 exact-SHA 发布'
            }
          >
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              disabled={!canDispatch}
              onClick={() => setReleaseModalOpen(true)}
            >
              发布当前 SHA
            </Button>
          </Tooltip>
        </Space>
      </header>

      <main className="erp-dev-hub-shell erp-dev-version-shell">
        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="版本中心不可用"
            description={loadError}
          />
        ) : null}
        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="部分状态未能证明"
            description={issueDescription(summary.issues)}
          />
        ) : null}
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="固定边界"
          description="GitHub 负责 CI 与不可变制品；本地 Bridge 只接受固定动作；133 不构建、不接受浏览器传入的命令、目录、仓库或 SSH 目标。"
        />

        <section className="erp-dev-version-summary" aria-label="发布状态摘要">
          <Card title="本地候选">
            <Space direction="vertical" size={8}>
              <Text code>{shortGitSha(repository?.commit)}</Text>
              {repository ? (
                <Tag color={repository.dirty ? 'warning' : 'success'}>
                  {repository.dirty ? '工作树有改动' : '工作树干净'}
                </Tag>
              ) : (
                <Tag color="error">身份未证明</Tag>
              )}
              <Text type="secondary">
                只有 clean HEAD 才能触发 exact-SHA 发布。
              </Text>
            </Space>
          </Card>
          <Card title="GitHub 不可变版本">
            <Space direction="vertical" size={8}>
              <Text strong>{versions[0]?.version || '尚无可用版本'}</Text>
              <Text code>{shortGitSha(versions[0]?.gitSha)}</Text>
              <Text type="secondary">
                {versions[0]?.completeAssets
                  ? '发布制品齐全'
                  : '等待完整 release assets'}
              </Text>
            </Space>
          </Card>
          <Card title="test-133">
            <Space direction="vertical" size={8}>
              <Text code>{shortGitSha(currentTargetSha)}</Text>
              <Tag color={targetPassed ? 'success' : 'warning'}>
                {targetPassed ? '只读预检通过' : '只读预检阻断'}
              </Tag>
              <Text type="secondary">
                可用空间{' '}
                {formatDeliveryBytes(
                  target?.remote?.capacity?.availableBytes
                )}
                {' / '}最低要求{' '}
                {formatDeliveryBytes(
                  target?.remote?.capacity?.minimumAvailableBytes
                )}
              </Text>
            </Space>
          </Card>
        </section>

        <Card title="可部署版本" className="erp-dev-version-table-card">
          <Table
            rowKey="gitSha"
            columns={versionColumns}
            dataSource={versions}
            loading={loading}
            pagination={false}
            locale={{
              emptyText: (
                <Empty description="尚无完整 GitHub 不可变发布版本" />
              ),
            }}
            scroll={{ x: 760 }}
          />
        </Card>

        <Card title="Operation 记录" className="erp-dev-version-table-card">
          <Table
            rowKey="id"
            columns={operationColumns}
            dataSource={operations}
            loading={loading}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            locale={{
              emptyText: <Empty description="尚无发布或部署操作" />,
            }}
            scroll={{ x: 760 }}
          />
        </Card>
      </main>

      <Modal
        title="发布当前 exact SHA"
        open={releaseModalOpen}
        okText="触发 GitHub 发布"
        cancelText="取消"
        confirmLoading={actionKey === 'dispatch-release'}
        okButtonProps={{
          disabled:
            !/^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u.test(
              releaseVersion.trim()
            ),
        }}
        onOk={submitRelease}
        onCancel={() => setReleaseModalOpen(false)}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`候选 SHA：${shortGitSha(repository?.commit)}`}
            description="GitHub 对该 SHA 只执行一次 strict，构建一次制品；133 不参与构建。"
          />
          <label htmlFor="dev-release-version">版本号</label>
          <Input
            id="dev-release-version"
            autoFocus
            value={releaseVersion}
            maxLength={64}
            onChange={(event) => setReleaseVersion(event.target.value)}
          />
        </Space>
      </Modal>

      <Drawer
        title="Operation 详情"
        open={Boolean(operationDetail)}
        width={640}
        onClose={() => setOperationDetail(null)}
        destroyOnHidden
      >
        {operationDetail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <StatusTag status={operationDetail.status} />
              <Text strong>{operationDetail.version}</Text>
              <Text code>{shortGitSha(operationDetail.gitSha)}</Text>
            </Space>
            <Text type="secondary" copyable>
              {operationDetail.id}
            </Text>
            {operationDetail.issues.length > 0 ? (
              <Alert
                type="error"
                showIcon
                message="已记录问题"
                description={issueDescription(operationDetail.issues)}
              />
            ) : null}
            <List
              loading={operationDetailLoading}
              header="最近 100 条状态事件（按需读取）"
              dataSource={operationDetail.events}
              locale={{ emptyText: '暂无状态事件' }}
              renderItem={(event) => (
                <List.Item>
                  <Space direction="vertical" size={4}>
                    <Space wrap>
                      <StatusTag status={event.status} />
                      <Text type="secondary">{event.at}</Text>
                    </Space>
                    <Text>{event.message}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title={
          confirmOperation?.action === 'rollback'
            ? '确认代码回滚到 test-133'
            : '确认部署到 test-133'
        }
        open={Boolean(confirmOperation)}
        okText={
          confirmOperation?.action === 'rollback'
            ? '开始回滚'
            : '开始部署'
        }
        cancelText="取消"
        confirmLoading={
          actionKey === `execute:${confirmOperation?.id || ''}`
        }
        okButtonProps={{
          danger: true,
          disabled:
            !confirmOperation ||
            confirmationText !== confirmOperation.confirmationRequired,
        }}
        onOk={async () => {
          if (!confirmOperation) return
          const succeeded = await performAction(
            `execute:${confirmOperation.id}`,
            confirmOperation.action === 'rollback'
              ? 'execute-rollback'
              : 'execute-promotion',
            {
              operationId: confirmOperation.id,
              confirmation: confirmationText,
            }
          )
          if (succeeded) {
            setConfirmOperation(null)
            setConfirmationText('')
          }
        }}
        onCancel={() => {
          setConfirmOperation(null)
          setConfirmationText('')
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={
              confirmOperation?.action === 'rollback'
                ? '该动作只回滚代码和镜像'
                : '该动作会写入 133 测试服务器'
            }
            description={
              confirmOperation?.action === 'rollback'
                ? '仅在 migration 序列和客户配置源指纹完全相同时允许；不自动 down migration 或恢复数据库。若结果未知，不会自动重试。'
                : '执行器会重新做即时预检、创建并恢复检查新备份、校验制品、串行迁移、启动和 smoke。若结果未知，不会自动重试。'
            }
          />
          <Text>请完整输入以下确认文本：</Text>
          <Text copyable code>
            {confirmOperation?.confirmationRequired || ''}
          </Text>
          <Input
            autoFocus
            value={confirmationText}
            placeholder="粘贴完整确认文本"
            maxLength={200}
            onChange={(event) => setConfirmationText(event.target.value)}
          />
        </Space>
      </Modal>
    </div>
  )
}
