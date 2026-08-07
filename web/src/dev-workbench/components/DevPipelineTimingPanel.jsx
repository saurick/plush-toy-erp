import React from 'react'
import { Card, Empty, Space, Tag, Typography } from 'antd'

import {
  formatDeliveryDuration,
  shortGitSha,
  summarizePipelineTimings,
} from '../config/devDelivery.mjs'

const { Link, Text, Title } = Typography

function formatTimestamp(value) {
  const timestamp = Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return '时间未证明'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(timestamp))
}

export function DevTimingBars({ stages = [], totalDurationMs = 0, limit = 8 }) {
  const visibleStages = stages.slice(0, limit)
  if (visibleStages.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无环节耗时" />
  }
  const denominator = Math.max(
    totalDurationMs,
    ...visibleStages.map((stage) => stage.durationMs),
    1
  )
  return (
    <ol className="erp-dev-timing-bars">
      {visibleStages.map((stage) => {
        const percentage = Math.min(
          100,
          Math.max(2, Math.round((stage.durationMs / denominator) * 100))
        )
        return (
          <li key={stage.id} className="erp-dev-timing-bars__item">
            <div className="erp-dev-timing-bars__label">
              <span>
                <Text strong>{stage.name || stage.label}</Text>
                {stage.group ? (
                  <Text type="secondary"> · {stage.group}</Text>
                ) : null}
              </span>
              <Text>{formatDeliveryDuration(stage.durationMs)}</Text>
            </div>
            <div
              className="erp-dev-timing-bars__track"
              role="progressbar"
              aria-label={`${stage.name || stage.label}耗时占比`}
              aria-valuemin={0}
              aria-valuemax={denominator}
              aria-valuenow={stage.durationMs}
            >
              <span
                className={`erp-dev-timing-bars__fill erp-dev-timing-bars__fill--${stage.conclusion === 'failure' || stage.status === 'failed' ? 'failed' : 'normal'}`}
                style={{ width: `${String(percentage)}%` }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function DevPipelineTimingPanel({ timings }) {
  const summary = summarizePipelineTimings(timings)
  const latestRun = summary.latest

  return (
    <Card className="erp-dev-pipeline-timing" variant="borderless">
      <div className="erp-dev-pipeline-timing__head">
        <div>
          <Title level={2} id="dev-pipeline-timing-title">
            CI/CD 效能
          </Title>
          <Text type="secondary">
            GitHub Actions 原始 run、job 与 step 时间；不另建流水线真源。
          </Text>
        </div>
        <Text type="secondary">
          统计读取：{formatTimestamp(timings?.generatedAt)}
        </Text>
      </div>

      {!latestRun ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚无可计算的完整 CI/CD 运行"
        />
      ) : (
        <section aria-labelledby="dev-pipeline-timing-title">
          <div className="erp-dev-pipeline-timing__summary">
            <div>
              <Text type="secondary">最近完整运行</Text>
              <strong>{formatDeliveryDuration(latestRun.durationMs)}</strong>
              <Text>
                {latestRun.workflow === 'release' ? '正式发布' : '持续集成'} ·{' '}
                {shortGitSha(latestRun.gitSha)}
              </Text>
            </div>
            <div>
              <Text type="secondary">最近样本中位数</Text>
              <strong>{formatDeliveryDuration(summary.medianDurationMs)}</strong>
              <Text>{summary.sampleCount} 次完整运行样本</Text>
            </div>
            <div>
              <Text type="secondary">当前瓶颈</Text>
              <strong>{summary.bottleneck?.name || '尚未识别'}</strong>
              <Text>
                {formatDeliveryDuration(summary.bottleneck?.durationMs)}
              </Text>
            </div>
          </div>

          <div className="erp-dev-pipeline-timing__decision" role="status">
            <Tag color={latestRun.conclusion === 'success' ? 'success' : 'error'}>
              {latestRun.conclusion === 'success' ? '最近运行通过' : '最近运行未通过'}
            </Tag>
            <Text>{summary.optimizationHint}</Text>
            <Link href={latestRun.url} target="_blank" rel="noreferrer">
              查看 GitHub 运行
            </Link>
          </div>

          <DevTimingBars
            stages={summary.stages}
            totalDurationMs={latestRun.durationMs}
          />

          <details className="erp-dev-pipeline-timing__details">
            <summary>查看全部 job 与 step 时间</summary>
            <div className="erp-dev-pipeline-timing__jobs">
              {latestRun.jobs.map((job) => (
                <article key={job.id}>
                  <Space wrap>
                    <Text strong>{job.name}</Text>
                    <Tag color={job.conclusion === 'success' ? 'success' : 'error'}>
                      {job.conclusion || job.status}
                    </Tag>
                    <Text type="secondary">
                      {formatDeliveryDuration(job.durationMs)}
                    </Text>
                  </Space>
                  <DevTimingBars
                    stages={job.steps.map((step) => ({
                      ...step,
                      id: `${String(job.id)}:${String(step.number)}`,
                      label: step.name,
                    }))}
                    totalDurationMs={job.durationMs || latestRun.durationMs}
                    limit={100}
                  />
                </article>
              ))}
            </div>
          </details>
        </section>
      )}
    </Card>
  )
}
