import { CopyOutlined } from '@ant-design/icons'
import { Alert, Button, Typography } from 'antd'
import DevTimestamp from '../../components/DevTimestamp.jsx'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { WorkbenchNotice } from '../../components/WorkbenchPattern.jsx'
import { copyText } from './presentation.jsx'

const { Text } = Typography

export function ReleaseApplySummary({ releaseState, releaseBatch }) {
  if (releaseState.status === 'idle') return null
  if (releaseState.status === 'historical') {
    return (
      <div className="erp-dev-customer-release-result">
        <Text type="secondary">
          所选批次有历史检查记录，请重新检查当前工作区。
        </Text>
        <DevTimestamp
          value={releaseState.result?.generatedAt}
          action="上次检查于"
          missing="历史检查时间未证明"
        />
      </div>
    )
  }

  if (releaseState.status === 'checking') {
    return (
      <WorkbenchNotice tone="loading" title="正在检查发布门禁" description="编译候选清单，校验选定批次的证据。" />
    )
  }

  if (releaseState.status === 'blocked') {
    const missing = releaseState.result?.missing || []
    return (
      <div className="erp-dev-customer-release-result">
        <Alert
          type="warning"
          showIcon
          message="发布门禁未通过"
          description="处理阻断原因后重新检查。"
        />
        <DevTimestamp
          value={releaseState.result?.generatedAt}
          action="检查于"
          missing="检查时间未证明"
        />
        {missing.length > 0 ? (
          <div className="erp-dev-customer-release-missing">
            {missing.map((item) => <Text key={item}>{item}</Text>)}
          </div>
        ) : null}
        {releaseState.result?.evidenceDir ? (
          <div className="erp-dev-customer-release-actions">
            <Button
              icon={<CopyOutlined aria-hidden="true" />}
              onClick={() => copyText(releaseState.result.evidenceDir, '已复制证据目录')}
            >
              复制证据目录
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  if (releaseState.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="发布门禁检查失败"
        description={releaseState.error || '请确认开发服务和证据批次。'}
      />
    )
  }

  const result = releaseState.result || {}
  const summary = result.summary || {}

  return (
    <div className="erp-dev-customer-release-result">
      <WorkbenchNotice
        tone="success"
        title="选定批次的发布门禁已通过"
        description="可以交接执行器；目标配置仍待执行与读回。"
      />
      <DevTimestamp
        value={result.generatedAt}
        action="检查于"
        missing="检查时间未证明"
      />
      <Text>候选配置版本：{summary.revision || '未证明'}</Text>
      <DevStaticGuidance title="发布证据详情">
        <div className="erp-dev-customer-release-facts">
          <div>
            <Text type="secondary">发布批次</Text>
            <Text strong>{result.releaseBatch || releaseBatch || '-'}</Text>
          </div>
          <div>
            <Text type="secondary">证据目录</Text>
            <Text strong>{result.evidenceDir || '-'}</Text>
          </div>
          <div>
            <Text type="secondary">页面投影</Text>
            <Text strong>{summary.pageCount ?? '-'}</Text>
          </div>
          <div>
            <Text type="secondary">模块状态</Text>
            <Text strong>{summary.moduleStateCount ?? '-'}</Text>
          </div>
        </div>
        {result.manifestPath ? (
          <div className="erp-dev-customer-release-actions">
            <Button
              icon={<CopyOutlined aria-hidden="true" />}
              onClick={() => copyText(result.manifestPath, '已复制清单路径')}
            >
              复制清单路径
            </Button>
          </div>
        ) : null}
      </DevStaticGuidance>
    </div>
  )
}
