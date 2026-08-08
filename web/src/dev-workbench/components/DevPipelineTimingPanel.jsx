import React from 'react'
import { Card, Empty, Space, Tag, Typography } from 'antd'

import {
  deliveryPipelinePresentation,
  deliveryStatusPresentation,
  formatDeliveryBytes,
  formatDeliveryDuration,
  formatDeliveryPercent,
  formatDeliveryRate,
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
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无环节耗时" />
    )
  }
  const denominator = Math.max(
    totalDurationMs,
    ...visibleStages.map((stage) => stage.durationMs),
    1
  )
  return (
    <ol className="erp-dev-timing-bars">
      {visibleStages.map((stage) => {
        const stagePresentation = deliveryPipelinePresentation(
          stage.name || stage.label
        )
        const groupPresentation = stage.group
          ? deliveryPipelinePresentation(stage.group)
          : null
        const percentage = Math.min(
          100,
          Math.max(2, Math.round((stage.durationMs / denominator) * 100))
        )
        return (
          <li key={stage.id} className="erp-dev-timing-bars__item">
            <div className="erp-dev-timing-bars__label">
              <span
                title={
                  groupPresentation
                    ? `${stagePresentation.title}；所属任务：${groupPresentation.title}`
                    : stagePresentation.title
                }
              >
                <Text strong>{stagePresentation.label}</Text>
                {groupPresentation ? (
                  <Text type="secondary"> · {groupPresentation.label}</Text>
                ) : null}
              </span>
              <Text>{formatDeliveryDuration(stage.durationMs)}</Text>
            </div>
            <div
              className="erp-dev-timing-bars__track"
              role="progressbar"
              aria-label={`${stagePresentation.label}耗时占比`}
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

export default function DevPipelineTimingPanel({
  timings,
  versions = [],
  operations = [],
}) {
  const summary = summarizePipelineTimings(timings)
  const latestRun = summary.latest
  const release = versions[0] || null
  const transferOperation = operations.find(
    (operation) =>
      operation.action === 'promote' &&
      operation.status === 'passed' &&
      Number.isSafeInteger(operation.metrics?.transferBytesPerSecond)
  )

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
              <Text type="secondary">同类运行中位数</Text>
              <strong>
                {formatDeliveryDuration(summary.medianDurationMs)}
              </strong>
              <Text>{summary.sampleCount} 次同类完整运行</Text>
            </div>
            <div>
              <Text type="secondary">观测关键路径</Text>
              <strong>
                {formatDeliveryDuration(summary.criticalPath?.durationMs)}
              </strong>
              <Text
                title={summary.criticalPath?.jobs
                  .map((job) => job.name)
                  .join(' → ')}
              >
                {summary.criticalPath?.jobs
                  .map((job) => deliveryPipelinePresentation(job.name).label)
                  .join(' → ') || '尚未识别'}
              </Text>
              <Text type="secondary">
                可见环节{' '}
                {formatDeliveryDuration(
                  summary.criticalPath?.coveredDurationMs
                )}{' '}
                · 调度/等待{' '}
                {formatDeliveryDuration(summary.criticalPath?.schedulingGapMs)}
              </Text>
            </div>
            <div>
              <Text type="secondary">最长环节</Text>
              <strong
                title={
                  summary.bottleneck
                    ? deliveryPipelinePresentation(summary.bottleneck.name)
                        .title
                    : '尚未识别'
                }
              >
                {summary.bottleneck
                  ? deliveryPipelinePresentation(summary.bottleneck.name).label
                  : '尚未识别'}
              </strong>
              <Text>
                {formatDeliveryDuration(summary.bottleneck?.durationMs)}
              </Text>
            </div>
            <div>
              <Text type="secondary">最新发布 BuildKit 命中</Text>
              <strong>
                {formatDeliveryPercent(
                  release?.buildPerformance?.cacheHitRateBasisPoints
                )}
              </strong>
              <Text>
                {release?.buildPerformance
                  ? `${release.buildPerformance.cacheHitCount}/${release.buildPerformance.completedVertexCount} 个完成节点`
                  : '等待新版发布回执'}
              </Text>
            </div>
            <div>
              <Text type="secondary">最新不可变制品</Text>
              <strong>
                {formatDeliveryBytes(release?.artifactSummary?.totalBytes)}
              </strong>
              <Text>
                {release
                  ? `${release.version} · ${shortGitSha(release.gitSha)}`
                  : '版本未证明'}
              </Text>
            </div>
            <div>
              <Text type="secondary">最近部署传输</Text>
              <strong>
                {formatDeliveryRate(
                  transferOperation?.metrics?.transferBytesPerSecond
                )}
              </strong>
              <Text>
                {formatDeliveryBytes(transferOperation?.metrics?.transferBytes)}{' '}
                ·{' '}
                {formatDeliveryDuration(
                  transferOperation?.metrics?.transferDurationMs
                )}
              </Text>
            </div>
          </div>

          <div className="erp-dev-pipeline-timing__decision" role="status">
            <Tag
              color={latestRun.conclusion === 'success' ? 'success' : 'error'}
            >
              {latestRun.conclusion === 'success'
                ? '最近运行通过'
                : '最近运行未通过'}
            </Tag>
            <Text>{summary.optimizationHint}</Text>
            <Text
              type={summary.failureReason ? 'danger' : 'secondary'}
              title={
                summary.failureReason
                  ? `${summary.failureReason.job} / ${summary.failureReason.step}`
                  : undefined
              }
            >
              {summary.failureReason
                ? `失败原因：${deliveryPipelinePresentation(summary.failureReason.job).label} / ${deliveryPipelinePresentation(summary.failureReason.step).label}`
                : '失败原因：最近运行无失败步骤'}
            </Text>
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
              {latestRun.jobs.map((job) => {
                const jobName = deliveryPipelinePresentation(job.name)
                const jobStatus = deliveryStatusPresentation(
                  job.conclusion || job.status
                )
                return (
                  <article key={job.id}>
                    <Space wrap>
                      <Text strong title={jobName.title}>
                        {jobName.label}
                      </Text>
                      <Tag color={jobStatus.color}>{jobStatus.label}</Tag>
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
                )
              })}
            </div>
          </details>
        </section>
      )}
    </Card>
  )
}
