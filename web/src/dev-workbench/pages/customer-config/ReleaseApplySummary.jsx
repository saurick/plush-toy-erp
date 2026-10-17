import { CopyOutlined } from '@ant-design/icons'
import { Alert, Button, Typography } from 'antd'
import DevTimestamp from '../../components/DevTimestamp.jsx'
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
      <Alert
        type="info"
        showIcon
        message="正在检查发布门禁"
        description="正在编译正式版运行时清单，并校验发布证据。"
      />
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
          description="正式版不能直接发布；先补齐下列发布证据，再重新检查。"
        />
        <DevTimestamp
          value={releaseState.result?.generatedAt}
          action="检查于"
          missing="检查时间未证明"
        />
        <div className="erp-dev-customer-release-missing">
          {missing.slice(0, 8).map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </div>
        <div className="erp-dev-customer-release-actions">
          <Button
            icon={<CopyOutlined aria-hidden="true" />}
            onClick={() =>
              copyText(releaseState.result?.evidenceDir || '', '已复制证据目录')
            }
          >
            复制证据目录
          </Button>
        </div>
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
      <Alert
        type="success"
        showIcon
        message="选定批次的发布门禁已通过"
        description="当前清单与所选证据批次符合发布条件，可以交接正式配置执行器；目标环境尚需执行与读回。"
      />
      <DevTimestamp
        value={result.generatedAt}
        action="检查于"
        missing="检查时间未证明"
      />
      <div className="erp-dev-customer-release-actions">
        <Button
          icon={<CopyOutlined aria-hidden="true" />}
          onClick={() => copyText(result.manifestPath || '', '已复制清单路径')}
        >
          复制清单路径
        </Button>
      </div>
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
          <Text type="secondary">配置版本</Text>
          <Text strong>{summary.revision || '-'}</Text>
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
    </div>
  )
}
