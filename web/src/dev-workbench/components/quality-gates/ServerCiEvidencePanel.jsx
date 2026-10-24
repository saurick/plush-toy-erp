import { useCallback, useRef, useState } from 'react'
import { Button, Space, Tag, Typography } from 'antd'
import DevTimestamp from '../DevTimestamp.jsx'
import { shortCommit } from '../../config/qualityGatePresentation.mjs'
import { formatQualityGateDuration } from '../../config/devQualityGates.mjs'
import { ServerJobGuideDrawer } from './ServerCiJobGuideDrawer.jsx'

const { Link, Text } = Typography
const STATUS = { passed: '完整 CI 通过', docs_passed: '文档检查通过', running: 'CI 运行中', failed: 'CI 未通过', missing: '当前提交尚无 CI', unavailable: 'CI 读取失败' }

export function ServerCiEvidencePanel({ summary }) {
  const evidence = summary?.serverEvidence
  const [jobGuideOpen, setJobGuideOpen] = useState(false)
  const [selectedJobName, setSelectedJobName] = useState('')
  const guideTrigger = useRef(null)
  const restoreGuideFocus = useCallback((open) => {
    if (!open) window.requestAnimationFrame(() => guideTrigger.current?.focus({ preventScroll: true }))
  }, [])
  if (!evidence) return null
  const { reports } = evidence
  const firstFailure = evidence.jobs?.find((job) => job.conclusion === 'failure')
  return (
    <section className="erp-dev-quality-server-evidence" aria-label="GitLab CI 质量证据">
      <Space wrap>
        <Text>CI 对应版本 <Text code>{shortCommit(evidence.gitSha)}</Text></Text>
        <Tag color={evidence.status === 'passed' ? 'success' : evidence.status === 'failed' ? 'error' : 'default'}>{STATUS[evidence.status] || 'CI 尚未证明'}</Tag>
        {evidence.pipeline ? <Text>耗时 {formatQualityGateDuration(evidence.pipeline.durationMs)}</Text> : null}
        <DevTimestamp value={evidence.pipeline?.finishedAt} missing="尚未完成" />
      </Space>
      <Space wrap>
        {evidence.pipeline?.url ? <Link href={evidence.pipeline.url} target="_blank" rel="noopener noreferrer">查看 GitLab 流水线 #{evidence.pipeline.id}</Link> : null}
        {firstFailure ? <Link href={firstFailure.url} target="_blank" rel="noopener noreferrer">查看失败 Job：{firstFailure.name}</Link> : null}
      </Space>
      <Space wrap aria-label="GitLab 测试报告摘要">
        {reports?.status === 'available' ? (
          <>
            <Text>测试 {reports.tests.count} 项 · 成功 {reports.tests.success} · 失败 {reports.tests.failed + reports.tests.error} · 跳过 {reports.tests.skipped}</Text>
            <Link href={reports.testsUrl} target="_blank" rel="noopener noreferrer">查看 GitLab 测试报告</Link>
          </>
        ) : <Text type="secondary">{reports?.status === 'unavailable' ? '测试报告暂时读取失败，请重新核对' : reports?.status === 'invalid' ? 'GitLab 测试报告解析异常，请查看流水线' : '本次流水线尚无原生测试报告；历史回执仍可查看'}</Text>}
      </Space>
      <Space wrap aria-label="GitLab 覆盖率摘要">
        {reports?.coverage?.length ? reports.coverage.map((item) => (
          <Space key={item.job}>
            <Text>{item.job === 'quality_web_checks' ? 'Web 行覆盖' : item.job === 'quality_server_test_build' ? 'Go 语句覆盖' : item.job} {item.percent}%</Text>
            <Link href={item.url} target="_blank" rel="noopener noreferrer">查看覆盖率 Job</Link>
            {item.artifactUrl ? <Link href={item.artifactUrl} target="_blank" rel="noopener noreferrer">查看覆盖率制品</Link> : <Text type="secondary">覆盖率制品已过期或尚未上传</Text>}
          </Space>
        )) : <Text type="secondary">本次流水线尚无覆盖率报告</Text>}
      </Space>
      <Text type="secondary">CI 在 GitLab Runner 上执行；部署验证按 demo、test、erp 的目标回执分别判定。覆盖率只统计本次运行范围，不代表全部业务已验收。</Text>
      <Button size="small" aria-label="流程与原理" onClick={(event) => { guideTrigger.current = event.currentTarget; setSelectedJobName(''); setJobGuideOpen(true) }}>流程与原理</Button>
      <details className="erp-dev-disclosure">
        <summary>历史流水线记录（GitLab）</summary>
        <Space direction="vertical">
          <Text type="secondary">以下为 GitLab 原生状态；完整门禁资格以当前提交的 CI 结论为准。</Text>
          {evidence.historyStatus === 'unavailable' ? <Text type="warning">历史列表暂时读取失败，仍可进入 GitLab 查看。</Text> : null}
          {evidence.history.map((run) => <Link key={run.id} href={run.url} target="_blank" rel="noopener noreferrer">#{run.id} · {shortCommit(run.gitSha)} · {({ success: '成功', failed: '失败', running: '运行中', queued: '等待运行', cancelled: '已取消', skipped: '已跳过' })[run.result]}</Link>)}
          <Link href="https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines?ref=main" target="_blank" rel="noopener noreferrer">查看全部历史流水线</Link>
        </Space>
      </details>
      <ServerJobGuideDrawer repository={summary.repository} evidence={evidence} open={jobGuideOpen} selectedJobName={selectedJobName} onSelect={setSelectedJobName} onShowAll={() => setSelectedJobName('')} onClose={() => setJobGuideOpen(false)} onAfterOpenChange={restoreGuideFocus} />
    </section>
  )
}
