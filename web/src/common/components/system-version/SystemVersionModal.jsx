import React from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Modal,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  formatBuildCode,
  formatReleaseVersion,
} from '@/common/runtime/buildIdentity.mjs'

const { Paragraph, Text } = Typography

function alertType(tone) {
  if (tone === 'success') return 'success'
  if (tone === 'error') return 'error'
  if (tone === 'warning') return 'warning'
  return 'info'
}

export default function SystemVersionModal({ buildIdentity, onClose, open }) {
  const { loading, retry, server, status, supportText, web } = buildIdentity
  const items = [
    {
      key: 'system-version',
      label: '系统版本',
      children: (
        <Text strong data-testid="system-version-value">
          {status.systemVersion}
        </Text>
      ),
    },
    {
      key: 'web-build',
      label: '网页构建',
      children: (
        <Space size={8} wrap>
          <span>{formatReleaseVersion(web.releaseVersion)}</span>
          <Text code copyable={web.gitSHA ? { text: web.gitSHA } : false}>
            {formatBuildCode(web)}
          </Text>
        </Space>
      ),
    },
    {
      key: 'server-build',
      label: '服务构建',
      children: server ? (
        <Space size={8} wrap>
          <span>{formatReleaseVersion(server.releaseVersion)}</span>
          <Text code copyable={server.gitSHA ? { text: server.gitSHA } : false}>
            {formatBuildCode(server)}
          </Text>
        </Space>
      ) : (
        <Text type="secondary">暂未读取</Text>
      ),
    },
    {
      key: 'status',
      label: '核对状态',
      children: (
        <Tag color={status.tone} data-testid="system-version-status">
          {status.label}
        </Tag>
      ),
    },
  ]

  return (
    <Modal
      destroyOnHidden
      open={open}
      title="系统信息"
      onCancel={onClose}
      width={560}
      footer={[
        status.key === 'unavailable' ? (
          <Button key="retry" loading={loading} onClick={retry}>
            重新核对
          </Button>
        ) : null,
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>,
      ].filter(Boolean)}
    >
      <div data-testid="system-version-modal">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            showIcon
            type={alertType(status.tone)}
            message={status.label}
            description={status.description}
          />
          <Descriptions bordered size="small" column={1} items={items} />
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            反馈问题时可复制完整排查信息：
            <Text
              copyable={{ text: supportText }}
              data-testid="system-version-copy"
            >
              复制版本信息
            </Text>
          </Paragraph>
        </Space>
      </div>
    </Modal>
  )
}
