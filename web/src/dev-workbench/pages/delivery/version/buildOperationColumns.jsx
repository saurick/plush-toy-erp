import { Space, Typography } from 'antd'
import {
  StatusTag,
  OperationIdempotencyText,
  issueDescription,
  operationActionLabel,
  deliveryTargetLabel,
  operationUpdateAction,
} from './shared.jsx'
import DevDeliveryTimestamp from '../../../components/DevDeliveryTimestamp.jsx'
import {
  deliveryOperationMessagePresentation,
  formatDeliveryDuration,
  shortGitSha,
} from '../../../config/devDelivery.mjs'

const { Text } = Typography

export function buildOperationColumns({ renderOperationActions }) {
  return [
    {
      title: '动作',
      key: 'action',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>
            {operationActionLabel(
              record.action,
              record.promotionMode,
              record.target
            )}
          </Text>
          <Text type="secondary" code>
            {record.id.slice(0, 8)}
          </Text>
        </Space>
      ),
    },
    {
      align: 'left',
      title: '目标',
      key: 'target',
      render: (_value, record) => deliveryTargetLabel(record.target),
    },
    {
      align: 'left',
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
      align: 'left',
      title: '状态',
      key: 'status',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <StatusTag status={record.status} />
          <OperationIdempotencyText operation={record} />
          {record.issues.length > 0 ? (
            <Text type="danger">{issueDescription(record.issues)}</Text>
          ) : (
            <Text
              type="secondary"
              title={
                deliveryOperationMessagePresentation(
                  record.events.at(-1)?.message
                ).title
              }
            >
              {
                deliveryOperationMessagePresentation(
                  record.events.at(-1)?.message
                ).label
              }
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '时间',
      key: 'time',
      width: 220,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <DevDeliveryTimestamp
            value={record.createdAt}
            action="开始于"
            missing="开始时间未证明"
            className="erp-dev-operation-history-time"
          />
          <DevDeliveryTimestamp
            value={record.updatedAt}
            action={operationUpdateAction(record)}
            missing="完成时间未证明"
            className="erp-dev-operation-history-time"
          />
        </Space>
      ),
    },
    {
      title: '耗时',
      key: 'duration',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{formatDeliveryDuration(record.durationMs)}</Text>
          <Text type="secondary">
            {record.stages.length > 0
              ? `${String(record.stages.length)} 个可见环节`
              : '暂无环节明细'}
          </Text>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'center',
      render: (_value, record) => renderOperationActions(record),
    },
  ]
}
