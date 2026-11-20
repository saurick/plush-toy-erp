import { Button, Card, Space, Typography } from 'antd'
import { StatusTag, operationActionLabel } from './shared.jsx'
import DevTimestamp from '../../../components/DevTimestamp.jsx'
import { formatDeliveryDuration } from '../../../config/devDelivery.mjs'

const { Text } = Typography

export function CurrentDeliveryOperations({ operations, compact, openOperationDetail, renderOperationActions }) {
  if (operations.length === 0) return null
  const content = operations.map((operation) => (
    <article key={operation.id} className="erp-dev-version-current-operation__item" aria-label={`当前操作 ${operation.version}`}>
      <Space wrap size={[8, 4]}>
        <StatusTag status={operation.status} />
        <Text strong>{operationActionLabel(operation.action, operation.promotionMode, operation.target)}</Text>
        <Text>{operation.version}</Text>
      </Space>
      {!compact ? (
        <Space wrap size={[16, 4]}>
          <DevTimestamp className="erp-dev-current-operation-time" value={operation.updatedAt} action={operation.status === 'ready' ? '准备完成于' : '更新于'} />
          <Text type="secondary">{operation.status === 'ready' ? '准备耗时' : '已记录耗时'} {formatDeliveryDuration(operation.durationMs)}</Text>
        </Space>
      ) : null}
      <div className="erp-dev-version-current-operation__actions">
        {compact ? (
          <Button onClick={(event) => openOperationDetail(operation, event.currentTarget)}>查看详情</Button>
        ) : renderOperationActions(operation)}
      </div>
    </article>
  ))
  if (compact) return <div className="erp-dev-version-current-operation erp-dev-version-current-operation--compact" role="status">{content}</div>
  return <Card title={operations.every((operation) => operation.status === 'ready') ? '待确认计划' : '当前操作'} className="erp-dev-version-table-card erp-dev-version-current-operation"><div className="erp-dev-version-current-operation__list">{content}</div></Card>
}
