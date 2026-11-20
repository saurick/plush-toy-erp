import { Alert, Typography } from 'antd'
import DevTimestamp from '../../components/DevTimestamp.jsx'
import { WorkbenchFacts, WorkbenchNotice } from '../../components/WorkbenchPattern.jsx'

const { Text } = Typography

export function DryRunSummary({ dryRunState }) {
  if (dryRunState.status === 'idle') return null

  if (dryRunState.status === 'running') {
    return <WorkbenchNotice tone="loading" title="试跑正在生成" />
  }

  if (dryRunState.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="试跑生成失败"
        description={dryRunState.error || '请查看 Vite 终端输出。'}
      />
    )
  }

  const result = dryRunState.result || {}
  const summary = result.summary || {}
  const actionCounts = summary.candidateCountsByAction
  const unresolvedCounts = summary.unresolvedCountsBySeverity
  const importStatus = typeof summary.canExecuteRealImport === 'boolean'
    ? (summary.canExecuteRealImport ? '报告标记可执行' : '不可执行')
    : '未证明'
  const facts = [
    { label: '来源行', value: summary.totalSources ?? '未证明' },
    { label: '候选创建', value: actionCounts ? (actionCounts.create ?? 0) : '未证明' },
    { label: '阻塞', value: <Text type={summary.blockerCount > 0 ? 'danger' : undefined}>{summary.blockerCount ?? '未证明'}</Text> },
    { label: '正式导入', value: importStatus },
  ]

  return (
    <div className="erp-dev-customer-dry-run-result">
      <WorkbenchNotice
        tone={dryRunState.historical ? 'info' : 'success'}
        title={dryRunState.historical ? '上次样本试跑报告' : '样本试跑报告已生成'}
        description="供样本匹配评审；配置生效和真实导入另行核验。"
      />
      <DevTimestamp
        value={result.generatedAt}
        action="生成于"
        missing="试跑生成时间未证明"
      />
      <WorkbenchFacts items={facts} aria-label="试跑结果" />
      <details className="erp-dev-disclosure erp-dev-customer-result-details">
        <summary>报告详情</summary>
        <div className="erp-dev-customer-dry-run-paths">
          <Text type="secondary">输出目录</Text>
          <Text code copyable={result.outputPath ? { text: result.outputPath, tooltips: ['复制输出目录', '已复制'] } : false}>{result.outputPath || '未生成'}</Text>
          <Text type="secondary">报告</Text>
          <Text code copyable={result.reportPath ? { text: result.reportPath, tooltips: ['复制报告路径', '已复制'] } : false}>{result.reportPath || '未生成'}</Text>
          <Text type="secondary">未决队列</Text>
          <Text>
            {unresolvedCounts
              ? `阻塞 ${unresolvedCounts.block ?? 0} / 延后 ${unresolvedCounts.defer ?? 0} / 复核 ${unresolvedCounts.review ?? 0}`
              : '未证明'}
          </Text>
        </div>
      </details>
    </div>
  )
}
