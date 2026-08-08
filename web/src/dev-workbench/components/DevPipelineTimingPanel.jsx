import React from 'react'
import { Card, Empty, Space, Tag, Typography } from 'antd'

import {
  deliveryPipelinePresentation,
  deliveryPipelineRunModePresentation,
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

function formatJobDuration(job) {
  if (!job) return '未证明'
  if (['skipped', 'neutral'].includes(job.conclusion)) return '已复用'
  return formatDeliveryDuration(job.durationMs)
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
  const { latest: latestRun, analysisRun } = summary
  const [release = null] = versions
  const deploymentOperation = operations.find(
    (operation) =>
      operation.action === 'promote' && operation.status === 'passed'
  )
  const strictJob = summary.latestFullRelease?.jobs.find(
    (job) => job.name === 'Exact-SHA strict quality'
  )
  const publishJob = summary.latestFullRelease?.jobs.find(
    (job) => job.name === 'Publish immutable artifact set'
  )
  const transferShare =
    Number.isSafeInteger(deploymentOperation?.metrics?.transferDurationMs) &&
    deploymentOperation.durationMs > 0
      ? Math.min(
          100,
          Math.round(
            (deploymentOperation.metrics.transferDurationMs /
              deploymentOperation.durationMs) *
              100
          )
        )
      : null

  return (
    <Card className="erp-dev-pipeline-timing" variant="borderless">
      <div className="erp-dev-pipeline-timing__head">
        <div>
          <Title level={2} id="dev-pipeline-timing-title">
            CI/CD 效能
          </Title>
          <Text type="secondary">
            区分完整发布、持续集成与相同 SHA 复用；数据来自 GitHub 与部署回执。
          </Text>
        </div>
        <Text type="secondary">
          统计读取：{formatTimestamp(timings?.generatedAt)}
        </Text>
      </div>

      {!latestRun ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚无可计算的 CI/CD 运行"
        />
      ) : (
        <section aria-labelledby="dev-pipeline-timing-title">
          <div className="erp-dev-pipeline-timing__summary">
            <div>
              <Text type="secondary">最近动作</Text>
              <strong>{formatDeliveryDuration(latestRun.durationMs)}</strong>
              <Text>
                {deliveryPipelineRunModePresentation(summary.latestMode)} ·{' '}
                {shortGitSha(latestRun.gitSha)}
              </Text>
              <Text type="secondary">
                同类型中位数 {formatDeliveryDuration(summary.medianDurationMs)}{' '}
                · {summary.sampleCount} 次
              </Text>
            </div>
            <div>
              <Text type="secondary">最近完整发布</Text>
              <strong>
                {formatDeliveryDuration(summary.latestFullRelease?.durationMs)}
              </strong>
              <Text>
                严格门禁 {formatJobDuration(strictJob)} · 发布制品{' '}
                {formatJobDuration(publishJob)}
              </Text>
              <Text type="secondary">
                完整发布中位数{' '}
                {formatDeliveryDuration(summary.fullReleaseMedianDurationMs)} ·{' '}
                {summary.fullReleaseSampleCount} 次
              </Text>
            </div>
            <div>
              <Text type="secondary">构建缓存与制品</Text>
              <strong>
                {formatDeliveryPercent(
                  release?.buildPerformance?.cacheHitRateBasisPoints
                )}
              </strong>
              <Text>
                {release?.buildPerformance
                  ? `${release.buildPerformance.cacheHitCount} 命中 / ${release.buildPerformance.cacheMissCount} 未命中，共 ${release.buildPerformance.completedVertexCount} 个完成节点`
                  : '等待构建回执'}
              </Text>
              <Text type="secondary">
                总计 {formatDeliveryBytes(release?.artifactSummary?.totalBytes)}{' '}
                · Server{' '}
                {formatDeliveryBytes(
                  release?.artifactSummary?.serverImageBytes
                )}{' '}
                · Web{' '}
                {formatDeliveryBytes(release?.artifactSummary?.webImageBytes)}
              </Text>
            </div>
            <div>
              <Text type="secondary">最近部署与传输</Text>
              <strong>
                {formatDeliveryDuration(deploymentOperation?.durationMs)}
              </strong>
              <Text>
                传输{' '}
                {formatDeliveryBytes(
                  deploymentOperation?.metrics?.transferBytes
                )}{' '}
                ·{' '}
                {formatDeliveryDuration(
                  deploymentOperation?.metrics?.transferDurationMs
                )}
              </Text>
              <Text type="secondary">
                {formatDeliveryRate(
                  deploymentOperation?.metrics?.transferBytesPerSecond
                )}
                {transferShare === null
                  ? ''
                  : ` · 占总耗时 ${String(transferShare)}%`}
              </Text>
            </div>
          </div>

          <div className="erp-dev-pipeline-timing__decision" role="status">
            <Tag
              color={latestRun.conclusion === 'success' ? 'success' : 'error'}
            >
              {latestRun.conclusion === 'success'
                ? '最近动作通过'
                : '最近动作未通过'}
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
                : '最近动作没有失败步骤'}
            </Text>
            <Link href={latestRun.url} target="_blank" rel="noreferrer">
              查看 GitHub 运行
            </Link>
          </div>

          <details className="erp-dev-pipeline-timing__details">
            <summary>展开完整发布关键路径与全部环节</summary>
            <div className="erp-dev-pipeline-timing__critical-path">
              <Text strong>观测关键路径</Text>
              <Text>
                {formatDeliveryDuration(summary.criticalPath?.durationMs)} ·
                可见环节{' '}
                {formatDeliveryDuration(
                  summary.criticalPath?.coveredDurationMs
                )}{' '}
                · 调度/等待{' '}
                {formatDeliveryDuration(summary.criticalPath?.schedulingGapMs)}
              </Text>
              <Text type="secondary">
                {summary.criticalPath?.jobs
                  .map((job) => deliveryPipelinePresentation(job.name).label)
                  .join(' → ') || '尚未识别'}
              </Text>
            </div>
            <DevTimingBars
              stages={summary.stages}
              totalDurationMs={analysisRun?.durationMs}
            />
            <div className="erp-dev-pipeline-timing__jobs">
              {(analysisRun?.jobs || []).map((job) => {
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
                      totalDurationMs={job.durationMs || analysisRun.durationMs}
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
