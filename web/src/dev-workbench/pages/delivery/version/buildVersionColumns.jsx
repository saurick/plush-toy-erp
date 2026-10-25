import { CloudDownloadOutlined, RollbackOutlined } from '@ant-design/icons'
import { Button, Space, Tag, Tooltip, Typography } from 'antd'
import { StatusTag } from './shared.jsx'
import DevTimestamp from '../../../components/DevTimestamp.jsx'
import { RETENTION_STATES } from '../../../config/devRetention.mjs'
import {
  createDeliveryIdempotencyKey,
  deliveryVersionActionKind,
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
        <div className="erp-dev-version-identity">
          <Space wrap size={6}>
            <Typography.Link href={record.url} target="_blank" rel="noopener noreferrer" strong>{value}</Typography.Link>
            <Text type="secondary" code>{shortGitSha(record.gitSha)}</Text>
          </Space>
          <details className="erp-dev-disclosure erp-dev-delivery-inline-details">
            <summary>保留与可用性说明</summary>
            <Text type="secondary">
              {record.retention?.state === 'cleaned' ? '制品文件已清理，版本和部署记录保留' : record.completeAssets
                ? record.assets.includes('release-rehearsal.json')
                  ? '制品齐全；部署仍需通过目标预检与演练核验'
                  : '历史制品仅用于回滚'
                : '制品不完整'}
            </Text>
            {record.retention?.reasons?.map((reason) => <Text key={reason}>{reason}</Text>)}
            {record.retention?.cleanedAt ? <DevTimestamp value={record.retention.cleanedAt} action="清理于" /> : null}
          </details>
        </div>
      ),
    },
    {
      title: '制品状态',
      dataIndex: 'status',
      key: 'status',
      render: (value, record) => record.retention && ['cleaned', 'cleaning', 'protected'].includes(record.retention.state) ? (
        <Tag color={RETENTION_STATES[record.retention.state].color}>{RETENTION_STATES[record.retention.state].label}</Tag>
      ) : value !== 'published' ? <StatusTag status={value} /> : (
        <Tag color={record.promotionEligible ? 'success' : 'warning'}>
          {record.completeAssets
            ? record.promotionEligible
              ? '保留中 · 制品齐全'
              : record.assets.includes('release-rehearsal.json')
                ? '演练证据待补齐'
                : '仅可回滚'
            : '制品不完整'}
        </Tag>
      ),
    },
    {
      align: 'left',
      title: selectedTargetDefinition.shortLabel,
      key: 'target',
      render: (_value, record) =>
        !currentTargetSha && !initializationReady ? (
          <Text type="secondary">运行版本未确认</Text>
        ) : record.gitSha === currentTargetSha ? (
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
        if (['cleaned', 'cleaning'].includes(record.retention?.state)) return <Text type="secondary">文件已清理，记录可查</Text>
        const actionKind = deliveryVersionActionKind(record)
        if (record.gitSha === currentTargetSha) return null
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
            {actionKind !== 'rollback' ? (
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
            ) : (
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
            )}
          </Space>
        )
      },
    },
  ]
}
