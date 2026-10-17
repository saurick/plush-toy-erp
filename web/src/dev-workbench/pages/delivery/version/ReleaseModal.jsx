import { Alert, Input, Modal, Space } from 'antd'
import { shortGitSha } from '../../../config/devDelivery.mjs'

export function ReleaseModal({
  actionKey,
  deliveryProviderName,
  releaseModalOpen,
  releaseVersion,
  repository,
  setReleaseModalOpen,
  submitRelease,
  summaryFresh,
}) {
  return (
    <Modal
      title="发布当前版本制品"
      open={releaseModalOpen}
      okText={`触发${deliveryProviderName}发布`}
      cancelText="取消"
      confirmLoading={actionKey === 'dispatch-release'}
      cancelButtonProps={{
        disabled: actionKey === 'dispatch-release',
      }}
      closable={actionKey !== 'dispatch-release'}
      maskClosable={actionKey !== 'dispatch-release'}
      keyboard={actionKey !== 'dispatch-release'}
      okButtonProps={{
        disabled:
          !summaryFresh ||
          !/^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u.test(
            releaseVersion
          ),
      }}
      onOk={submitRelease}
      onCancel={() => {
        if (actionKey !== 'dispatch-release') {
          setReleaseModalOpen(false)
        }
      }}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message={`候选 SHA：${shortGitSha(repository?.commit)}`}
          description={`${deliveryProviderName}复用该 SHA 已完成的普通 CI 证据，只构建一次制品；各部署目标均不参与构建。`}
        />
        <label htmlFor="dev-release-version">
          正式版本号（由发布目录自动生成）
        </label>
        <Input
          id="dev-release-version"
          aria-label="发布版本号"
          value={releaseVersion}
          maxLength={64}
          readOnly
        />
      </Space>
    </Modal>
  )
}
