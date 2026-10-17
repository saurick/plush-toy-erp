import { Alert, Descriptions, Input, Modal, Space, Typography } from 'antd'

const { Text } = Typography

export function MigrationConfirmation({
  actionKey,
  confirmationOperation,
  confirmationText,
  performAction,
  readOnly,
  setConfirmationOperation,
  setConfirmationText,
  summaryFresh,
}) {
  return (
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
      maskClosable={actionKey !== `execute:${confirmationOperation?.id || ''}`}
      keyboard={actionKey !== `execute:${confirmationOperation?.id || ''}`}
      okButtonProps={{
        danger: true,
        disabled:
          !summaryFresh ||
          readOnly ||
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
  )
}
