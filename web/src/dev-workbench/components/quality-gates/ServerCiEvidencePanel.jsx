import { useCallback, useRef, useState } from 'react'
import { Button, Space, Tag, Typography } from 'antd'
import Table from '@/common/components/table/AppTable'
import DevTimestamp from '../DevTimestamp.jsx'
import { WorkbenchNotice, WorkbenchSection } from '../WorkbenchPattern.jsx'
import { shortCommit } from '../../config/qualityGatePresentation.mjs'
import { formatQualityGateDuration } from '../../config/devQualityGates.mjs'
import { ServerJobGuideDrawer } from './ServerCiJobGuideDrawer.jsx'

const { Link, Text } = Typography
export const SERVER_CI_STATUS = { passed: '完整 CI 通过', docs_passed: '文档检查通过', running: 'CI 运行中', failed: 'CI 未通过', missing: '当前提交尚无 CI', unavailable: 'CI 读取失败' }

const HISTORY_TITLE = '历史流水线记录（GitLab）'
const HISTORY_BOUNDARY = '历史状态来自 GitLab；历史成功不能证明当前提交通过。'
const PIPELINE_RESULTS = {
  success: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  running: { label: '运行中', color: 'processing' },
  queued: { label: '等待运行', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
  skipped: { label: '已跳过', color: 'default' },
}
const HISTORY_COLUMNS = [
  {
    title: '流水线',
    dataIndex: 'id',
    width: 132,
    align: 'left',
    render: (id, run) => <Link href={run.url} target="_blank" rel="noopener noreferrer">#{id}</Link>,
  },
  { title: '提交版本', dataIndex: 'gitSha', width: 180, render: (sha) => <code>{shortCommit(sha)}</code> },
  {
    title: 'GitLab 状态',
    dataIndex: 'result',
    render: (result) => <Tag color={PIPELINE_RESULTS[result].color}>{PIPELINE_RESULTS[result].label}</Tag>,
  },
]

export function ServerCiEvidencePanel({ summary, showEmptyState = true, inlineHistory = false }) {
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
  const guideButton = (
    <Button size="small" aria-label="流程与原理" onClick={(event) => { guideTrigger.current = event.currentTarget; setSelectedJobName(''); setJobGuideOpen(true) }}>流程与原理</Button>
  )
  const allHistoryLink = <Link href="https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines?ref=main" target="_blank" rel="noopener noreferrer">查看全部历史流水线</Link>
  const historyUnavailable = evidence.historyStatus === 'unavailable'
  return (
    <section className="erp-dev-quality-server-evidence" aria-label="GitLab CI 质量证据">
      {evidence.pipeline ? (
        <WorkbenchSection flat title={inlineHistory ? '当前提交的 CI 结果' : undefined}>
          <Space wrap>
            <Text>CI 对应版本 <Text code>{shortCommit(evidence.gitSha)}</Text></Text>
            <Tag color={evidence.status === 'passed' ? 'success' : evidence.status === 'failed' ? 'error' : 'default'}>{SERVER_CI_STATUS[evidence.status] || 'CI 尚未证明'}</Tag>
            <Text>耗时 {formatQualityGateDuration(evidence.pipeline.durationMs)}</Text>
            {evidence.pipeline.finishedAt || evidence.pipeline.status === 'completed' ? (
              <DevTimestamp value={evidence.pipeline.finishedAt} missing="结束时间未记录" />
            ) : null}
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
          <Text type="secondary">{inlineHistory ? '' : 'CI 不覆盖未提交改动；'}覆盖率仅代表本次执行范围，部署与客户验收分别核对。</Text>
        </WorkbenchSection>
      ) : showEmptyState ? (
        <div role="status">
          <Text strong>{SERVER_CI_STATUS[evidence.status] || 'CI 尚未证明'}</Text>
          <div><Text type="secondary">{evidence.status === 'missing' ? '当前提交尚未产生执行结果，可查看历史流水线。' : '请刷新后重新核对；读取失败不代表没有流水线。'}</Text></div>
        </div>
      ) : null}
      {inlineHistory ? (
        <WorkbenchSection flat title={HISTORY_TITLE} description={HISTORY_BOUNDARY} tools={<>{allHistoryLink}{guideButton}</>}>
          {historyUnavailable ? (
            <WorkbenchNotice tone="warning" title="历史列表暂时读取失败" description="可在 GitLab 查看全部流水线。" />
          ) : evidence.history.length ? (
            <Table
              size="small"
              rowKey="id"
              columns={HISTORY_COLUMNS}
              dataSource={evidence.history}
              pagination={{ pageSize: 5, showSizeChanger: false, hideOnSinglePage: true }}
            />
          ) : <Text type="secondary">暂无历史流水线</Text>}
        </WorkbenchSection>
      ) : (
        <>
          {guideButton}
          <details className="erp-dev-disclosure">
            <summary>{HISTORY_TITLE}</summary>
            <Space direction="vertical">
              <Text type="secondary">{HISTORY_BOUNDARY}</Text>
              {historyUnavailable ? <Text type="warning">历史列表暂时读取失败，仍可进入 GitLab 查看。</Text> : null}
              {evidence.history.map((run) => <Link key={run.id} href={run.url} target="_blank" rel="noopener noreferrer">#{run.id} · {shortCommit(run.gitSha)} · {PIPELINE_RESULTS[run.result].label}</Link>)}
              {allHistoryLink}
            </Space>
          </details>
        </>
      )}
      <ServerJobGuideDrawer repository={summary.repository} evidence={evidence} open={jobGuideOpen} selectedJobName={selectedJobName} onSelect={setSelectedJobName} onShowAll={() => setSelectedJobName('')} onClose={() => setJobGuideOpen(false)} onAfterOpenChange={restoreGuideFocus} />
    </section>
  )
}
