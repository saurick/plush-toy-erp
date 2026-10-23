import { CopyOutlined } from '@ant-design/icons'
import { Alert, Button, Typography } from 'antd'
import DevTimestamp from '../../components/DevTimestamp.jsx'
import { StatusTag, copyText } from './presentation.jsx'

const { Text } = Typography

export function TestApplySummary({
  applyState,
  canApplyTestConfig,
  unavailableReason,
}) {
  if (applyState.status === 'idle') {
    if (!canApplyTestConfig) {
      return (
        <Alert
          type="warning"
          showIcon
          message="当前配置包不可应用"
          description={
            unavailableReason ||
            '当前配置包只供预览；完成正式评审前不会发布或激活。'
          }
        />
      )
    }
    return null
  }

  if (applyState.status === 'running') {
    return (
      <Alert
        type="info"
        showIcon
        message="正在应用测试配置"
        description={applyState.step || '正在准备运行时清单。'}
      />
    )
  }

  if (applyState.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="测试配置应用失败"
        description={applyState.error || '请确认本地后端、管理员登录态和权限。'}
      />
    )
  }

  const result = applyState.result || {}
  const manifestSummary = result.manifestSummary || {}
  const session = result.effectiveSession || {}
  const publish = result.publish || {}
  const applied = result.applied || {}

  return (
    <div className="erp-dev-customer-test-apply-result">
      <Alert
        type="success"
        showIcon
        message="测试配置已应用"
        description="本地后端已读回目标配置版本；测试服和正式服未执行此操作。"
      />
      <div className="erp-dev-customer-test-apply-actions">
        <Button
          icon={<CopyOutlined aria-hidden="true" />}
          onClick={() => copyText(result.manifestPath || '')}
        >
          复制清单路径
        </Button>
        <Button
          icon={<CopyOutlined aria-hidden="true" />}
          onClick={() => copyText(manifestSummary.revision || '')}
        >
          复制配置版本 / Revision
        </Button>
      </div>
      <details className="erp-dev-disclosure erp-dev-customer-result-details">
        <summary>查看执行步骤与身份核对</summary>
        <div className="erp-dev-customer-test-apply-steps">
          {result.steps?.map((step) => (
            <article
              className="erp-dev-customer-test-apply-step"
              key={step.key}
            >
              <Text type="secondary">{step.label}</Text>
              <StatusTag status={step.status} />
              <Text>{step.note}</Text>
            </article>
          ))}
        </div>
      </details>
      <div className="erp-dev-customer-test-apply-facts">
        <div>
          <Text type="secondary">配置版本</Text>
          <Text strong>{manifestSummary.revision || '-'}</Text>
        </div>
        <div>
          <Text type="secondary">页面投影</Text>
          <Text strong>{manifestSummary.pageCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">角色画像</Text>
          <Text strong>{manifestSummary.roleProfileCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">责任池</Text>
          <Text strong>{manifestSummary.workPoolCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">模块状态</Text>
          <Text strong>{manifestSummary.moduleStateCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">清单生成</Text>
          <DevTimestamp
            value={result.manifestGeneratedAt}
            missing="清单生成时间未证明"
          />
        </div>
        <div>
          <Text type="secondary">测试版本发布</Text>
          <DevTimestamp
            value={publish.published_at}
            unit="unix-seconds"
            missing="发布时间未证明"
          />
        </div>
        <div>
          <Text type="secondary">测试版本激活</Text>
          <DevTimestamp
            value={applied.activated_at}
            unit="unix-seconds"
            missing="激活时间未证明"
          />
        </div>
      </div>
      <div className="erp-dev-customer-test-apply-session">
        <Text type="secondary">当前有效配置投影</Text>
        <Text>
          {session.source || '-'} / {session.configRevision || '-'}
        </Text>
      </div>
    </div>
  )
}
