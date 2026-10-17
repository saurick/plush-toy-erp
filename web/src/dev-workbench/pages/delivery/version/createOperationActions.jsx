import {
  DeploymentUnitOutlined,
  ReloadOutlined,
  RollbackOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { Button, Space, Tooltip, Typography } from 'antd'
import {
  createDeliveryIdempotencyKey,
  deliveryRetryPresentation,
} from '../../../config/devDelivery.mjs'

const { Text } = Typography

export function createOperationActions({
  actionKey,
  hasOpenOperation,
  isMutationRunning,
  openOperationDetail,
  performAction,
  setConfirmOperation,
  setConfirmationText,
  summaryFresh,
}) {
  return (record) => {
    const { status, action, retry, promotionMode, id } = record
    const readyToExecute =
      status === 'ready' &&
      ['promote', 'rollback', 'rebuild-database'].includes(action)
    const executable = summaryFresh && readyToExecute
    const retryable = retry?.allowed === true
    const retryEligible =
      summaryFresh && retryable && !isMutationRunning && !hasOpenOperation
    return (
      <Space wrap>
        <Button
          onClick={(event) => openOperationDetail(record, event.currentTarget)}
        >
          查看详情
        </Button>
        {executable ? (
          <Button
            type="primary"
            danger={['rollback', 'rebuild-database'].includes(action)}
            disabled={isMutationRunning}
            icon={
              action === 'rollback' ? (
                <RollbackOutlined aria-hidden="true" />
              ) : action === 'rebuild-database' ? (
                <ToolOutlined aria-hidden="true" />
              ) : (
                <DeploymentUnitOutlined aria-hidden="true" />
              )
            }
            onClick={() => {
              setConfirmOperation(record)
              setConfirmationText('')
            }}
          >
            {action === 'rollback'
              ? '确认回滚'
              : action === 'rebuild-database'
                ? '确认清空重建'
                : promotionMode === 'initialize'
                  ? '确认首次部署'
                  : '确认部署'}
          </Button>
        ) : retryable ? (
          <Tooltip
            title={
              retryEligible
                ? '沿用原动作、固定目标、Exact-SHA、版本和发布输入，创建有关联的新尝试'
                : hasOpenOperation
                  ? '已有未结束的 operation，请先完成或核对该操作'
                  : !summaryFresh
                    ? '等待最新状态核对'
                    : '已有写操作正在提交'
            }
          >
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              disabled={!retryEligible}
              loading={actionKey === `retry:${id}`}
              onClick={() =>
                performAction(`retry:${id}`, 'retry-operation', {
                  operationId: id,
                  idempotencyKey: createDeliveryIdempotencyKey('retry'),
                })
              }
            >
              再次尝试
            </Button>
          </Tooltip>
        ) : (
          <Text type="secondary">
            {readyToExecute && !summaryFresh
              ? '等待最新状态核对'
              : deliveryRetryPresentation(retry)}
          </Text>
        )}
      </Space>
    )
  }
}
