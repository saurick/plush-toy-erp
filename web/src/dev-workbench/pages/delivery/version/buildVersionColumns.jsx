import { CloudDownloadOutlined, RollbackOutlined } from '@ant-design/icons'
import { Button, Space, Tag, Tooltip, Typography } from 'antd'
import { StatusTag } from './shared.jsx'
import DevDeliveryTimestamp from '../../../components/DevDeliveryTimestamp.jsx'
import {
  createDeliveryIdempotencyKey,
  deliveryVersionActionKind,
  formatDeliveryBytes,
  isDevInitialCustomerConfigActivationReady,
  shortGitSha,
} from '../../../config/devDelivery.mjs'

const { Text } = Typography

export function buildVersionColumns({
  actionKey,
  currentTargetRelease,
  currentTargetSha,
  hasOpenOperation,
  initializationReady,
  isMutationRunning,
  performAction,
  selectedTargetDefinition,
  selectedTargetKey,
  summaryFresh,
  target,
  targetPassed,
}) {
  return [
    {
      align: 'left',
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" code>
            {shortGitSha(record.gitSha)}
          </Text>
          <DevDeliveryTimestamp
            value={record.publishedAt}
            action="发布于"
            missing="发布时间未证明"
            className="erp-dev-version-published-at"
          />
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
              ? record.promotionEligible
                ? 'v2 · 7 项制品 · 可部署'
                : record.assets.includes('release-rehearsal.json')
                  ? 'v2 · 7 项制品 · 证据未闭合'
                  : 'v1 · 6 项制品 · 仅旧版回滚'
              : '制品不完整'}
          </Text>
        </Space>
      ),
    },
    {
      align: 'left',
      title: '制品与缓存',
      key: 'artifacts',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>
            {formatDeliveryBytes(record.artifactSummary.totalBytes)}
          </Text>
          <Text type="secondary">
            Server{' '}
            {formatDeliveryBytes(record.artifactSummary.serverImageBytes)}
            {' · '}Web{' '}
            {formatDeliveryBytes(record.artifactSummary.webImageBytes)}
          </Text>
          <Text type="secondary">
            BuildKit{' '}
            {record.buildPerformance
              ? `${(record.buildPerformance.cacheHitRateBasisPoints / 100).toFixed(1)}% 命中`
              : '命中率未证明'}
          </Text>
        </Space>
      ),
    },
    {
      align: 'left',
      title: selectedTargetDefinition.shortLabel,
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
      align: 'center',
      render: (_value, record) => {
        const actionKind = deliveryVersionActionKind(record)
        const initialCustomerConfigActivationReady =
          isDevInitialCustomerConfigActivationReady(target, actionKind)
        const targetActionReady =
          actionKind === 'initialize'
            ? initializationReady
            : targetPassed || initialCustomerConfigActivationReady
        const baseEligible =
          summaryFresh &&
          record.status === 'published' &&
          record.completeAssets === true &&
          record.gitSha !== currentTargetSha &&
          targetActionReady &&
          !hasOpenOperation &&
          !isMutationRunning
        const promotionEligible =
          baseEligible &&
          ['initialize', 'promote'].includes(actionKind) &&
          record.promotionEligible === true
        const rollbackEligible =
          baseEligible &&
          actionKind === 'rollback' &&
          currentTargetRelease?.status === 'published' &&
          currentTargetRelease?.completeAssets === true
        const promotionExplanation = isMutationRunning
          ? '已有写操作正在提交，请等待当前请求完成'
          : !summaryFresh
            ? '正在核对最新状态；上次结果只供查看，暂不能执行'
            : hasOpenOperation
              ? '已有未结束操作，请先完成或核对该操作'
              : !targetActionReady
                ? actionKind === 'initialize'
                  ? `${selectedTargetDefinition.shortLabel}首次部署预检未通过，先处理容量、基础镜像或资源冲突`
                  : `${selectedTargetDefinition.shortLabel}只读预检未通过，先处理容量或运行态阻断`
                : !record.completeAssets
                  ? '不可变发布制品不完整'
                  : !record.promotionEligible &&
                      ['initialize', 'promote'].includes(actionKind)
                    ? '旧 v1 六资产版本仅可读取和回滚，不能用于新部署'
                    : record.gitSha === currentTargetSha
                      ? `该 exact SHA 已在${selectedTargetDefinition.shortLabel}运行`
                      : actionKind === 'rollback'
                        ? `该版本是${selectedTargetDefinition.shortLabel}当前版本的 Git 祖先，应先检查回滚资格`
                        : actionKind === 'blocked'
                          ? record.actionReason === 'git_histories_diverged'
                            ? `该版本与${selectedTargetDefinition.shortLabel}当前版本的 Git 历史已分叉，禁止部署或回滚`
                            : record.actionReason ===
                                'target_identity_unavailable'
                              ? `${selectedTargetDefinition.shortLabel}当前 exact SHA 不可用，无法判断部署方向`
                              : 'Git 祖先关系不可证明，禁止猜测部署或回滚'
                          : ''
        return (
          <Space wrap>
            <Tooltip title={promotionEligible ? '' : promotionExplanation}>
              <Button
                icon={<CloudDownloadOutlined aria-hidden="true" />}
                disabled={!promotionEligible}
                loading={actionKey === `prepare:${record.gitSha}`}
                onClick={() =>
                  performAction(
                    `prepare:${record.gitSha}`,
                    'prepare-promotion',
                    {
                      gitSha: record.gitSha,
                      version: record.version,
                      target: selectedTargetKey,
                      idempotencyKey: createDeliveryIdempotencyKey('promote'),
                    }
                  )
                }
              >
                {actionKind === 'initialize' ? '准备首次部署' : '准备部署'}
              </Button>
            </Tooltip>
            <Tooltip
              title={
                rollbackEligible
                  ? '只准备资格检查；migration 或客户配置指纹不一致会阻断'
                  : currentTargetRelease
                    ? actionKind === 'promote'
                      ? `该版本不早于${selectedTargetDefinition.shortLabel}当前版本，应走部署流程`
                      : promotionExplanation
                    : `${selectedTargetDefinition.shortLabel}当前 SHA 没有完整不可变 manifest，不能普通回滚`
              }
            >
              <Button
                icon={<RollbackOutlined aria-hidden="true" />}
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
                      target: selectedTargetKey,
                      idempotencyKey: createDeliveryIdempotencyKey('rollback'),
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
}
