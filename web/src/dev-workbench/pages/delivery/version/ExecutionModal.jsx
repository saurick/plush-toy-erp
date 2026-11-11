import { Alert, Descriptions, Input, Space, Typography } from 'antd'
import Modal from '@/common/components/modal/AppModal'
import { formatDeliveryBytes } from '@/dev-workbench/config/devDelivery.mjs'
import { deliveryTargetLabel } from './shared.jsx'

const { Text } = Typography
const serviceNames = {
  postgres: 'PostgreSQL',
  jaeger: 'Jaeger',
  'attachment-store': 'SeaweedFS',
}
const configurationNames = {
  compose: '共用 Compose',
  targetCompose: '目标 Compose',
  postgresRoles: 'PostgreSQL 初始化脚本',
  jaegerConfig: 'Jaeger 配置',
}

function serviceItems(scope) {
  const items = scope.services.map(({ key, current, candidate }) => {
    const imageName = ({ image }) => image.split('@')[0]
    const imageChanged =
      current.image !== candidate.image ||
      current.contentId !== candidate.contentId
    const memoryChanged =
      key === 'jaeger' &&
      (current.memoryLimit !== candidate.memoryLimit ||
        current.memoryReservation !== candidate.memoryReservation)
    const currentName = imageName(current)
    const candidateName = imageName(candidate)
    const memory = ({ memoryLimit, memoryReservation }) =>
      `${formatDeliveryBytes(memoryLimit)} / ${formatDeliveryBytes(memoryReservation)}`
    return {
      key,
      label: serviceNames[key],
      children: (
        <>
          {currentName === candidateName
            ? currentName
            : `${currentName} → ${candidateName}`}
          {imageChanged && currentName === candidateName && '（镜像内容变化）'}
          {memoryChanged && (
            <div>
              内存上限 / 预留：{memory(current)} → {memory(candidate)}
            </div>
          )}
          {!imageChanged && !memoryChanged && '（固定项一致）'}
        </>
      ),
    }
  })
  if (scope.attachmentMode === 'external') {
    items.push({
      key: 'attachment-store',
      label: '附件存储',
      children: '使用外部服务，本次部署不变更',
    })
  }
  if (scope.configurationChanges.length > 0) {
    items.push({
      key: 'configuration',
      label: '配置文件变化',
      children: scope.configurationChanges
        .map((key) => configurationNames[key])
        .join('、'),
    })
  }
  return items
}

export function ExecutionModal({
  actionKey,
  confirmOperation,
  confirmationText,
  performAction,
  setConfirmOperation,
  setConfirmationText,
  summaryFresh,
}) {
  const upgrading =
    confirmOperation?.action === 'promote' &&
    confirmOperation.promotionMode !== 'initialize'
  const serviceScope = upgrading ? confirmOperation.serviceScope : null
  return (
    <Modal
      title={
        confirmOperation?.action === 'rollback'
          ? `确认代码回滚到 ${deliveryTargetLabel(confirmOperation?.target)}`
          : confirmOperation?.action === 'rebuild-database'
            ? '确认清空并重建 test 测试数据'
            : confirmOperation?.promotionMode === 'initialize'
              ? `确认首次部署到 ${deliveryTargetLabel(confirmOperation?.target)}`
              : `确认部署到 ${deliveryTargetLabel(confirmOperation?.target)}`
      }
      open={Boolean(confirmOperation)}
      okText={
        confirmOperation?.action === 'rollback'
          ? '开始回滚'
          : confirmOperation?.action === 'rebuild-database'
            ? '开始清空重建'
            : confirmOperation?.promotionMode === 'initialize'
              ? '开始首次部署'
              : '开始部署'
      }
      cancelText="取消"
      confirmLoading={actionKey === `execute:${confirmOperation?.id || ''}`}
      cancelButtonProps={{
        disabled: actionKey === `execute:${confirmOperation?.id || ''}`,
      }}
      closable={actionKey !== `execute:${confirmOperation?.id || ''}`}
      maskClosable={actionKey !== `execute:${confirmOperation?.id || ''}`}
      keyboard={actionKey !== `execute:${confirmOperation?.id || ''}`}
      okButtonProps={{
        danger: ['rollback', 'rebuild-database'].includes(
          confirmOperation?.action
        ),
        disabled:
          !summaryFresh ||
          !confirmOperation ||
          (upgrading && !serviceScope) ||
          confirmationText !== confirmOperation.confirmationRequired,
      }}
      onOk={async () => {
        if (!confirmOperation || (upgrading && !serviceScope)) return
        const succeeded = await performAction(
          `execute:${confirmOperation.id}`,
          confirmOperation.action === 'rollback'
            ? 'execute-rollback'
            : confirmOperation.action === 'rebuild-database'
              ? 'execute-database-rebuild'
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
        if (actionKey === `execute:${confirmOperation?.id || ''}`) {
          return
        }
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
              : confirmOperation?.action === 'rebuild-database'
                ? '该动作会清空并重建 test 测试数据'
                : `该动作会写入 ${deliveryTargetLabel(confirmOperation?.target)}`
          }
          description={
            confirmOperation?.action === 'rollback'
              ? '仅在 migration 序列和客户配置源指纹完全相同时允许；不自动 down migration 或恢复数据库。若结果未知，不会自动重试。'
              : confirmOperation?.action === 'rebuild-database'
                ? '执行器会先复核当前 exact SHA，创建并恢复检查新备份，保留旧物理数据代，再迁移并核对空业务基线。该动作不属于普通部署，结果未知时不会自动重试。'
                : '执行器会重新做即时预检、创建并恢复检查新备份、校验制品、串行迁移、启动和 smoke。若结果未知，不会自动重试。'
          }
        />
        {upgrading &&
          (serviceScope ? (
            <>
              <Descriptions
                size="small"
                column={1}
                bordered
                title="基础服务变更"
                items={serviceItems(serviceScope)}
              />
              <Text type="secondary">
                执行前会重新核对。Compose
                会应用目标配置，固定项一致时容器仍可能重建。
              </Text>
            </>
          ) : (
            <Text type="danger">
              这份计划未核对基础服务差异。请放弃计划，再重新准备部署。
            </Text>
          ))}
        {confirmOperation?.promotionMode === 'initialize' && (
          <Text>首次部署将创建 PostgreSQL、Jaeger 和受管附件存储。</Text>
        )}
        <Text>请完整输入以下确认文本：</Text>
        <Text copyable code>
          {confirmOperation?.confirmationRequired || ''}
        </Text>
        <Input
          autoFocus
          aria-label={
            confirmOperation?.action === 'rollback'
              ? '回滚确认文本'
              : confirmOperation?.action === 'rebuild-database'
                ? '清空并重建测试数据确认文本'
                : '部署确认文本'
          }
          value={confirmationText}
          placeholder="粘贴完整确认文本"
          maxLength={200}
          onChange={(event) => setConfirmationText(event.target.value)}
        />
      </Space>
    </Modal>
  )
}
