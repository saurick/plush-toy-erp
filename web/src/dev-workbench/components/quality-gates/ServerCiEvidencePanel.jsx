import React, { useCallback, useRef, useState } from 'react'
import { InfoCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { Button, Space, Tag, Typography } from 'antd'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import DevTimestamp from '../DevTimestamp.jsx'
import {
  DEFAULT_SERVER_VIEW,
  DEV_QUALITY_GATE_SERVER_VIEWS,
  buildQualityGateServerTiming,
  formatQualityGateDuration,
} from '../../config/devQualityGates.mjs'
import {
  shortCommit,
  SERVER_EVIDENCE_STATUS,
  SERVER_JOB_STATUS,
  SERVER_PIPELINE_JOB_STATUS,
  SERVER_JOB_ROLE,
  SERVER_VIEW_OPTIONS,
  SERVER_VIEW_HELP,
} from '../../config/qualityGatePresentation.mjs'
import { ServerJobPerformance } from './ServerCiPerformance.jsx'
import { ServerCiHistory } from './ServerCiHistory.jsx'
import { ServerJobGuideDrawer } from './ServerCiJobGuideDrawer.jsx'
import { ServerCiPipelineFlow } from './ServerCiPipelineFlow.jsx'

const { Link, Text, Title } = Typography

function ServerJobTimingRows({ jobs }) {
  return (
    <ol className="erp-dev-quality-server-evidence__job-list">
      {jobs.map((job) => (
        <li key={job.id} className="erp-dev-quality-server-evidence__job-row">
          <div className="erp-dev-quality-server-evidence__job-identity">
            <Space size={6} wrap>
              <Link href={job.url} target="_blank" rel="noreferrer">
                <Text
                  code
                  className="erp-dev-quality-server-evidence__job-name"
                  type={job.conclusion === 'failure' ? 'danger' : undefined}
                >
                  {job.name}
                </Text>
              </Link>
              <Tag color={SERVER_JOB_ROLE[job.role]?.color || 'default'}>
                {SERVER_JOB_ROLE[job.role]?.label || '执行'}
              </Tag>
              {job.attemptCount > 1 ? (
                <Tag color="warning">重试 {job.attemptCount - 1} 次</Tag>
              ) : null}
            </Space>
            <Text type="secondary">
              {SERVER_JOB_STATUS[job.conclusion] ||
                SERVER_PIPELINE_JOB_STATUS[job.flowStatus] ||
                '状态未证明'}
            </Text>
          </div>
          <div
            className="erp-dev-quality-server-evidence__job-track"
            aria-hidden="true"
          >
            <span
              style={{
                '--quality-server-job-width': `${job.relativePercent || 0}%`,
              }}
            />
          </div>
          <div className="erp-dev-quality-server-evidence__job-times">
            <Text type="secondary">
              运行{' '}
              {job.durationMs === null
                ? '尚未完成'
                : formatQualityGateDuration(job.durationMs)}
            </Text>
            <Text type="secondary">
              等待 {formatQualityGateDuration(job.queueMs)}
            </Text>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ServerCurrentPipelineView({ evidence, timing, onOpenJobGuide }) {
  const highlightedJobs = timing.jobs.slice(0, 3)
  const remainingJobs = timing.jobs.slice(3)
  return (
    <div className="erp-dev-quality-server-view" data-server-view="pipeline">
      <ServerCiPipelineFlow
        evidence={evidence}
        timing={timing}
        onOpenJobGuide={onOpenJobGuide}
      />
      {timing.jobs.length ? (
        <section
          className="erp-dev-quality-server-evidence__timing"
          aria-labelledby="gitlab-job-timing-title"
        >
          <div className="erp-dev-quality-server-evidence__timing-heading">
            <Text id="gitlab-job-timing-title" strong>
              当前最慢 Job
            </Text>
            <Text type="secondary">条长相对本次最长 Job，不是总耗时占比</Text>
          </div>
          <ServerJobTimingRows jobs={highlightedJobs} />
          {remainingJobs.length ? (
            <details className="erp-dev-quality-server-evidence__jobs">
              <summary>展开其余 {remainingJobs.length} 个 Job</summary>
              <ServerJobTimingRows jobs={remainingJobs} />
            </details>
          ) : null}
          <Text type="secondary">
            并行 Job 的耗时不能累加为总耗时；执行与排队分别判断。
          </Text>
        </section>
      ) : null}
      {evidence.notProven?.length ? (
        <Text type="secondary">
          尚未证明：{evidence.notProven.join('、')}。
        </Text>
      ) : null}
    </div>
  )
}

export function ServerCiEvidencePanel({
  summary,
  serverView,
  onServerViewChange,
}) {
  const evidence = summary?.serverEvidence
  const [jobGuideOpen, setJobGuideOpen] = useState(false)
  const [selectedJobName, setSelectedJobName] = useState('')
  const jobGuideTriggerRef = useRef(null)
  const openJobGuide = useCallback((jobName, trigger) => {
    jobGuideTriggerRef.current = trigger
    setSelectedJobName(jobName)
    setJobGuideOpen(true)
  }, [])
  const restoreJobGuideFocus = useCallback((open) => {
    if (open) return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const trigger = jobGuideTriggerRef.current
        if (trigger?.isConnected) trigger.focus({ preventScroll: true })
        jobGuideTriggerRef.current = null
      })
    })
  }, [])
  if (!evidence) return null
  const status =
    SERVER_EVIDENCE_STATUS[evidence.status] ||
    SERVER_EVIDENCE_STATUS.unavailable
  const timing = buildQualityGateServerTiming(evidence)
  const selectedServerView = DEV_QUALITY_GATE_SERVER_VIEWS.includes(serverView)
    ? serverView
    : DEFAULT_SERVER_VIEW
  return (
    <section
      className="erp-dev-quality-server-evidence"
      aria-label="GitLab CI 质量证据"
    >
      <div className="erp-dev-quality-section-heading">
        <div className="erp-dev-quality-server-evidence__heading-copy">
          <Title level={2}>GitLab CI 门禁</Title>
          <Text type="secondary">
            正式主路径 · 当前提交的验证范围、实际 Job、聚合回执与 CI Gate
          </Text>
        </div>
        <Space wrap size={6}>
          <Tag color="blue">正式主路径</Tag>
          <Tag color={evidence.status === 'unavailable' ? 'error' : 'success'}>
            {evidence.status === 'unavailable'
              ? 'GitLab 读取失败'
              : 'GitLab 读取正常'}
          </Tag>
          <Tag color={status.color}>{status.label}</Tag>
        </Space>
      </div>
      <div className="erp-dev-quality-server-evidence__facts">
        <div>
          <Text type="secondary">证据读取</Text>
          <Text
            strong
            type={evidence.status === 'unavailable' ? 'danger' : undefined}
          >
            {evidence.status === 'unavailable'
              ? 'GitLab API 失败'
              : 'GitLab API 正常'}
          </Text>
        </div>
        <div>
          <Text type="secondary">绑定提交</Text>
          <Text code>{shortCommit(evidence.gitSha)}</Text>
        </div>
        <div>
          <Text type="secondary">流水线</Text>
          {evidence.pipeline?.url ? (
            <Link href={evidence.pipeline.url} target="_blank" rel="noreferrer">
              #{evidence.pipeline.id}
            </Link>
          ) : (
            <Text>
              {evidence.status === 'missing'
                ? '当前提交未触发 CI'
                : evidence.status === 'unavailable'
                  ? '读取失败'
                  : '尚未证明'}
            </Text>
          )}
        </div>
        <div>
          <Text type="secondary">服务器总耗时</Text>
          <Text strong>{formatQualityGateDuration(timing.wallClockMs)}</Text>
        </div>
        <div>
          <Text type="secondary">排队耗时</Text>
          <Text strong>{formatQualityGateDuration(timing.queueMs)}</Text>
        </div>
        <div>
          <Text type="secondary">最长执行 Job</Text>
          <Text strong>
            {timing.longestExecutionJob
              ? `${timing.longestExecutionJob.name} · ${formatQualityGateDuration(
                  timing.longestExecutionJob.durationMs
                )}`
              : '尚未形成'}
          </Text>
        </div>
        <div>
          <Text type="secondary">完成时间</Text>
          <DevTimestamp
            value={evidence.pipeline?.finishedAt}
            missing="尚未完成"
          />
        </div>
      </div>
      <Text>{evidence.message}</Text>
      <div className="erp-dev-quality-server-evidence__view-switch">
        <SlidingTabList
          aria-label="服务器门禁详情"
          options={SERVER_VIEW_OPTIONS}
          value={selectedServerView}
          onChange={(nextView) => {
            if (DEV_QUALITY_GATE_SERVER_VIEWS.includes(nextView)) {
              onServerViewChange(nextView)
            }
          }}
        />
        <Text type="secondary">{SERVER_VIEW_HELP[selectedServerView]}</Text>
        <Button
          aria-label="流程与原理"
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={(event) => openJobGuide('', event.currentTarget)}
        >
          流程与原理
        </Button>
        {evidence.jobGuides.length ? (
          <Button
            size="small"
            className="erp-dev-quality-server-evidence__view-switch-guide"
            icon={<QuestionCircleOutlined />}
            onClick={(event) => openJobGuide('', event.currentTarget)}
          >
            Job 说明
          </Button>
        ) : null}
      </div>
      {selectedServerView === 'pipeline' ? (
        <ServerCurrentPipelineView
          evidence={evidence}
          timing={timing}
          onOpenJobGuide={openJobGuide}
        />
      ) : null}
      {selectedServerView === 'performance' ? (
        <div
          className="erp-dev-quality-server-view"
          data-server-view="performance"
        >
          <ServerJobPerformance evidence={evidence} />
        </div>
      ) : null}
      {selectedServerView === 'history' ? (
        <div className="erp-dev-quality-server-view" data-server-view="history">
          <ServerCiHistory
            evidence={evidence}
            currentCommit={summary?.repository?.commit || ''}
          />
        </div>
      ) : null}
      <ServerJobGuideDrawer
        repository={summary.repository}
        evidence={evidence}
        timing={timing}
        open={jobGuideOpen}
        selectedJobName={selectedJobName}
        onSelect={setSelectedJobName}
        onShowAll={() => setSelectedJobName('')}
        onClose={() => setJobGuideOpen(false)}
        onAfterOpenChange={restoreJobGuideFocus}
      />
    </section>
  )
}
