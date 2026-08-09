import React from 'react'
import { Button, Card, Empty, Space, Tag, Typography } from 'antd'

import DevDeliveryTimestamp from './DevDeliveryTimestamp.jsx'
import {
  deliveryPipelinePresentation,
  deliveryPipelineRunModePresentation,
  deliveryStatusPresentation,
  deliveryTargetCachePresentation,
  findLatestTransferredPromotion,
  formatDeliveryBytes,
  formatDeliveryDuration,
  formatDeliveryPercent,
  formatDeliveryRate,
  formatDeliveryTimestamp,
  shortGitSha,
  summarizePipelineTimings,
} from '../config/devDelivery.mjs'

const { Link, Text, Title } = Typography

function formatClockTimestamp(value) {
  const timestamp = Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return '时间未证明'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

function hasTimestampRange(startedAt, finishedAt) {
  return (
    Number.isFinite(Date.parse(startedAt || '')) &&
    Number.isFinite(Date.parse(finishedAt || ''))
  )
}

function formatTimestampRange(startedAt, finishedAt, { compact = false } = {}) {
  if (!hasTimestampRange(startedAt, finishedAt)) return '运行时间未证明'
  if (compact) {
    return `${formatClockTimestamp(startedAt)}–${formatClockTimestamp(finishedAt)}`
  }
  return `${formatDeliveryTimestamp(startedAt)}–${formatDeliveryTimestamp(finishedAt)}`
}

function formatJobDuration(job) {
  if (!job) return '未证明'
  if (['skipped', 'neutral'].includes(job.conclusion)) return '已复用'
  return formatDeliveryDuration(job.durationMs)
}

export function DevTimingBars({
  stages = [],
  totalDurationMs = 0,
  limit = 8,
  showTimeRange = false,
}) {
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
        const timingTitle = hasTimestampRange(stage.startedAt, stage.finishedAt)
          ? `；运行时间：${formatTimestampRange(stage.startedAt, stage.finishedAt)}`
          : ''
        return (
          <li key={stage.id} className="erp-dev-timing-bars__item">
            <div className="erp-dev-timing-bars__label">
              <span
                title={
                  groupPresentation
                    ? `${stagePresentation.title}；所属任务：${groupPresentation.title}${timingTitle}`
                    : `${stagePresentation.title}${timingTitle}`
                }
              >
                <Text strong>{stagePresentation.label}</Text>
                {groupPresentation ? (
                  <Text type="secondary"> · {groupPresentation.label}</Text>
                ) : null}
              </span>
              <span className="erp-dev-timing-bars__meta">
                {showTimeRange ? (
                  <Text type="secondary">
                    {formatTimestampRange(stage.startedAt, stage.finishedAt, {
                      compact: true,
                    })}
                  </Text>
                ) : null}
                <Text>{formatDeliveryDuration(stage.durationMs)}</Text>
              </span>
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

export function DevPipelineStatusStrip({
  timings,
  versions = [],
  operations = [],
  onOpenDetails,
}) {
  const summary = summarizePipelineTimings(timings)
  const { latest: latestRun, latestFullRelease } = summary
  const [release = null] = versions
  const deploymentOperation = findLatestTransferredPromotion(operations)
  const targetCache = deliveryTargetCachePresentation(
    deploymentOperation?.metrics
  )
  const strictJob = latestFullRelease?.jobs.find(
    (job) => job.name === 'Exact-SHA strict quality'
  )
  const publishJob = latestFullRelease?.jobs.find(
    (job) => job.name === 'Publish immutable artifact set'
  )

  return (
    <section aria-label="交付状态速览">
      <Card
        size="small"
        className="erp-dev-pipeline-status-strip"
        title="交付状态速览"
        extra={
          typeof onOpenDetails === 'function' ? (
            <Button type="link" onClick={onOpenDetails}>
              查看完整效能
            </Button>
          ) : null
        }
      >
        <div className="erp-dev-pipeline-status-strip__metrics">
          <div>
            <Text type="secondary">最近 CI/CD</Text>
            <Space size={8} wrap>
              <Tag
                color={
                  !latestRun
                    ? 'default'
                    : latestRun.conclusion === 'success'
                      ? 'success'
                      : 'error'
                }
              >
                {!latestRun
                  ? '尚无运行'
                  : latestRun.conclusion === 'success'
                    ? '已通过'
                    : '未通过'}
              </Tag>
              <Text strong>
                {latestRun
                  ? formatDeliveryDuration(latestRun.durationMs)
                  : '未证明'}
              </Text>
            </Space>
            <Text type="secondary">
              {latestRun
                ? deliveryPipelineRunModePresentation(summary.latestMode)
                : '等待 GitHub 运行回执'}
            </Text>
            <DevDeliveryTimestamp value={latestRun?.finishedAt} />
          </div>
          <div>
            <Text type="secondary">最近完整发布</Text>
            <Text strong>
              {latestFullRelease
                ? formatDeliveryDuration(latestFullRelease.durationMs)
                : '未证明'}
            </Text>
            <Text type="secondary">
              严格门禁 {formatJobDuration(strictJob)} · 发布制品{' '}
              {formatJobDuration(publishJob)}
            </Text>
            <DevDeliveryTimestamp value={latestFullRelease?.finishedAt} />
          </div>
          <div>
            <Text type="secondary">构建缓存</Text>
            <Text strong>
              {formatDeliveryPercent(
                release?.buildPerformance?.cacheHitRateBasisPoints
              )}
            </Text>
            <Text type="secondary">
              制品总计{' '}
              {formatDeliveryBytes(release?.artifactSummary?.totalBytes)}
            </Text>
            <DevDeliveryTimestamp
              value={release?.publishedAt}
              action="发布于"
              missing="发布时间未证明"
            />
          </div>
          <div>
            <Text type="secondary">最近真实部署</Text>
            <Text strong>
              {deploymentOperation
                ? formatDeliveryDuration(deploymentOperation.durationMs)
                : '尚无真实部署'}
            </Text>
            <Text type="secondary">
              {deploymentOperation
                ? `${targetCache.status} · 实传 ${formatDeliveryBytes(deploymentOperation.metrics.transferBytes)}`
                : '等待包含制品传输的部署回执'}
            </Text>
            <DevDeliveryTimestamp value={deploymentOperation?.updatedAt} />
          </div>
        </div>
      </Card>
    </section>
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
  const deploymentOperation = findLatestTransferredPromotion(operations)
  const targetCache = deliveryTargetCachePresentation(
    deploymentOperation?.metrics
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
  const analysisJobs = analysisRun?.jobs || []
  const [expandedJobIds, setExpandedJobIds] = React.useState([])

  React.useEffect(() => {
    setExpandedJobIds([])
  }, [analysisRun?.id])

  const expandedJobIdSet = new Set(expandedJobIds)
  const expandedJobCount = analysisJobs.filter((job) =>
    expandedJobIdSet.has(job.id)
  ).length
  const allJobsExpanded =
    analysisJobs.length > 0 && expandedJobCount === analysisJobs.length

  const setJobExpanded = (jobId, open) => {
    setExpandedJobIds((current) => {
      const currentlyOpen = current.includes(jobId)
      if (currentlyOpen === open) return current
      return open
        ? [...current, jobId]
        : current.filter((currentJobId) => currentJobId !== jobId)
    })
  }

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
          统计读取：{formatDeliveryTimestamp(timings?.generatedAt)}
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
              <DevDeliveryTimestamp value={latestRun.finishedAt} />
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
                {['skipped', 'neutral'].includes(strictJob?.conclusion)
                  ? 'CI strict 回执已可信复用；Release 未重复执行门禁'
                  : `完整发布中位数 ${formatDeliveryDuration(summary.fullReleaseMedianDurationMs)} · ${String(summary.fullReleaseSampleCount)} 次`}
              </Text>
              <DevDeliveryTimestamp
                value={summary.latestFullRelease?.finishedAt}
              />
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
              <DevDeliveryTimestamp
                value={release?.publishedAt}
                action="发布于"
                missing="发布时间未证明"
              />
            </div>
            <div>
              <Text type="secondary">最近真实部署与传输</Text>
              <strong>
                {deploymentOperation
                  ? formatDeliveryDuration(deploymentOperation.durationMs)
                  : '尚无真实部署'}
              </strong>
              <Text>
                {deploymentOperation
                  ? `${targetCache.status} · 实传 ${formatDeliveryBytes(deploymentOperation.metrics.transferBytes)} · ${formatDeliveryDuration(deploymentOperation.metrics.transferDurationMs)}`
                  : '等待包含制品传输的部署回执'}
              </Text>
              <Text type="secondary">
                {deploymentOperation
                  ? deploymentOperation.metrics.targetCacheHit
                    ? `避免传输 ${formatDeliveryBytes(deploymentOperation.metrics.avoidedTransferBytes)} · 估算节省 ${formatDeliveryDuration(deploymentOperation.metrics.avoidedTransferDurationMs)} · ${deploymentOperation.metrics.dockerLoadSkipped ? '已跳过 Docker load' : '仍执行 Docker load'}`
                    : `${formatDeliveryRate(deploymentOperation.metrics.transferBytesPerSecond)}${transferShare === null ? '' : ` · 占总耗时 ${String(transferShare)}%`}`
                  : '相同 SHA 复用不计为目标写入'}
              </Text>
              <DevDeliveryTimestamp value={deploymentOperation?.updatedAt} />
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

          <div className="erp-dev-pipeline-timing__analysis">
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
            <div className="erp-dev-pipeline-timing__slowest-heading">
              <Text strong>耗时最长环节</Text>
              <Text type="secondary">按单环节耗时排序，最多显示 8 项</Text>
            </div>
            <DevTimingBars
              stages={summary.stages}
              totalDurationMs={analysisRun?.durationMs}
            />
          </div>

          {analysisJobs.length > 0 ? (
            <details className="erp-dev-pipeline-timing__details">
              <summary>
                查看全部 job / step（{String(analysisJobs.length)} 个 job）
              </summary>
              <div className="erp-dev-pipeline-timing__jobs-toolbar">
                <Text type="secondary">
                  各 job 默认收起；可逐项查看步骤时间，或统一展开。
                </Text>
                <Space wrap>
                  <Button
                    onClick={() =>
                      setExpandedJobIds(analysisJobs.map((job) => job.id))
                    }
                    disabled={allJobsExpanded}
                  >
                    全部展开
                  </Button>
                  <Button
                    onClick={() => setExpandedJobIds([])}
                    disabled={expandedJobCount === 0}
                  >
                    全部收起
                  </Button>
                </Space>
              </div>
              <div className="erp-dev-pipeline-timing__jobs">
                {analysisJobs.map((job) => {
                  const jobName = deliveryPipelinePresentation(job.name)
                  const jobStatus = deliveryStatusPresentation(
                    job.conclusion || job.status
                  )
                  return (
                    <details
                      key={job.id}
                      open={expandedJobIdSet.has(job.id)}
                      onToggle={(event) =>
                        setJobExpanded(job.id, event.currentTarget.open)
                      }
                    >
                      <summary>
                        <Text strong title={jobName.title}>
                          {jobName.label}
                        </Text>
                        <Tag color={jobStatus.color}>{jobStatus.label}</Tag>
                        <Text type="secondary">
                          {formatDeliveryDuration(job.durationMs)}
                        </Text>
                        <Text type="secondary">
                          {formatTimestampRange(job.startedAt, job.finishedAt)}
                        </Text>
                      </summary>
                      <div className="erp-dev-pipeline-timing__job-steps">
                        <DevTimingBars
                          stages={job.steps.map((step) => ({
                            ...step,
                            id: `${String(job.id)}:${String(step.number)}`,
                            label: step.name,
                          }))}
                          totalDurationMs={
                            job.durationMs || analysisRun.durationMs
                          }
                          limit={100}
                          showTimeRange
                        />
                      </div>
                    </details>
                  )
                })}
              </div>
            </details>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="该次运行未返回 job / step 时间"
            />
          )}
        </section>
      )}
    </Card>
  )
}
