import { useState } from 'react'
import { CopyOutlined, FileTextOutlined } from '@ant-design/icons'
import { Alert, Button, Typography } from 'antd'
import DevTimestamp from '../../components/DevTimestamp.jsx'
import { copyText } from './presentation.jsx'

const { Text } = Typography

export function buildDryRunReportPreviewLines(result = {}) {
  const summary = result.summary || {}
  const actionCounts = summary.candidateCountsByAction || {}
  const unresolvedCounts = summary.unresolvedCountsBySeverity || {}

  if (!result.reportPreview && !result.reportPath) {
    return []
  }

  return [
    '试跑报告摘要',
    `来源行：${summary.totalSources ?? '-'}`,
    `候选创建：${actionCounts.create || 0}`,
    `阻塞项：${summary.blockerCount ?? 0}`,
    `正式导入：${summary.canExecuteRealImport ? '可执行' : '不可执行'}`,
    `未决队列：阻塞 ${unresolvedCounts.block || 0} / 延后 ${
      unresolvedCounts.defer || 0
    } / 复核 ${unresolvedCounts.review || 0}`,
    '边界：只生成证据，不写业务数据库，不代表正式导入批准。',
    `原始报告：${result.reportPath || '未生成'}`,
  ]
}

export function DryRunSummary({ dryRunState }) {
  const [showReportPreview, setShowReportPreview] = useState(false)

  if (dryRunState.status === 'idle') return null

  if (dryRunState.status === 'running') {
    return (
      <Alert
        type="info"
        showIcon
        message="试跑正在生成"
        description="正在读取固定样本快照与现有数据模型样本，完成后会回显报告路径和阻塞数量。"
      />
    )
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
  const actionCounts = summary.candidateCountsByAction || {}
  const unresolvedCounts = summary.unresolvedCountsBySeverity || {}
  const reportPreviewLines = buildDryRunReportPreviewLines(result)
  const hasReportPreview = reportPreviewLines.length > 0

  return (
    <div className="erp-dev-customer-dry-run-result">
      <Alert
        type="success"
        showIcon
        message={
          dryRunState.historical ? '上次样本试跑报告' : '样本试跑报告已生成'
        }
        description="报告用于样本匹配评审；不代表配置生效或真实导入获批。"
      />
      <DevTimestamp
        value={result.generatedAt}
        action="生成于"
        missing="试跑生成时间未证明"
      />
      <div className="erp-dev-customer-dry-run-actions">
        <Button
          icon={<CopyOutlined aria-hidden="true" />}
          onClick={() => copyText(result.outputPath || '')}
        >
          复制输出目录
        </Button>
        <Button
          icon={<CopyOutlined aria-hidden="true" />}
          onClick={() => copyText(result.reportPath || '')}
        >
          复制报告路径
        </Button>
        <Button
          icon={<FileTextOutlined aria-hidden="true" />}
          disabled={!hasReportPreview}
          onClick={() => setShowReportPreview((visible) => !visible)}
        >
          {showReportPreview ? '收起报告摘要' : '查看报告摘要'}
        </Button>
      </div>
      <div className="erp-dev-customer-dry-run-metrics">
        <div>
          <Text type="secondary">来源行</Text>
          <Text strong>{summary.totalSources}</Text>
        </div>
        <div>
          <Text type="secondary">候选创建</Text>
          <Text strong>{actionCounts.create || 0}</Text>
        </div>
        <div>
          <Text type="secondary">阻塞</Text>
          <Text strong>{summary.blockerCount}</Text>
        </div>
        <div>
          <Text type="secondary">正式导入</Text>
          <Text strong>
            {summary.canExecuteRealImport ? '可执行' : '不可执行'}
          </Text>
        </div>
      </div>
      <details className="erp-dev-customer-result-details">
        <summary>报告文件与未决项</summary>
        <div className="erp-dev-customer-dry-run-paths">
          <Text type="secondary">输出目录</Text>
          <Text code>{result.outputPath}</Text>
          <Text type="secondary">报告</Text>
          <Text code>{result.reportPath}</Text>
          <Text type="secondary">未决队列</Text>
          <Text>
            block {unresolvedCounts.block || 0} / defer{' '}
            {unresolvedCounts.defer || 0} / review{' '}
            {unresolvedCounts.review || 0}
          </Text>
        </div>
      </details>
      {showReportPreview && hasReportPreview ? (
        <pre className="erp-dev-customer-dry-run-report">
          {reportPreviewLines.join('\n')}
        </pre>
      ) : null}
    </div>
  )
}
