import { Card, Empty, Space, Tag, Typography } from 'antd'

import DevTimestamp from './DevTimestamp.jsx'
import { formatDevTimestamp, isDevTimestamp } from '../config/devTimestamp.mjs'
import {
  deliveryPipelinePresentation,
  deliveryPipelineRunModePresentation,
  deliveryTargetCachePresentation,
  findLatestTransferredPromotion,
  formatDeliveryBytes,
  formatDeliveryDuration,
  formatDeliveryPercent,
  summarizePipelineStatus,
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
  return isDevTimestamp(startedAt) && isDevTimestamp(finishedAt)
}

function formatTimestampRange(startedAt, finishedAt, { compact = false } = {}) {
  if (!hasTimestampRange(startedAt, finishedAt)) return '运行时间未证明'
  if (compact) {
    return `${formatClockTimestamp(startedAt)}–${formatClockTimestamp(finishedAt)}`
  }
  return `${formatDevTimestamp(startedAt)}–${formatDevTimestamp(finishedAt)}`
}

function isGitLabPipeline(run) {
  return run?.url?.startsWith('https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/')
}

export function DevTimingBars({
  stages = [],
  totalDurationMs = 0,
  limit = 8,
  showTimeRange = false,
  presentStage = deliveryPipelinePresentation,
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
        const stagePresentation = presentStage(stage.name || stage.label)
        const groupPresentation = stage.group ? presentStage(stage.group) : null
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
}) {
  const summary = summarizePipelineStatus(timings)
  const { latest: latestRun, latestFullRelease } = summary
  const [release = null] = versions
  const deploymentOperation = findLatestTransferredPromotion(operations)
  const targetCache = deliveryTargetCachePresentation(
    deploymentOperation?.metrics
  )

  return (
    <section aria-label="最近发布与部署">
      <Card
        size="small"
        className="erp-dev-pipeline-status-strip"
        title="最近发布与部署"
      >
        <div className="erp-dev-pipeline-status-strip__metrics">
          <div>
            <Text type="secondary">最近一次流水线</Text>
            <Space size={8} wrap>
              <Tag
                color={
                  !latestRun
                    ? 'default'
                    : latestRun.status !== 'completed'
                      ? 'processing'
                      : latestRun.conclusion === 'success'
                      ? 'success'
                      : 'error'
                }
              >
                {!latestRun
                  ? '尚无运行'
                  : latestRun.status === 'in_progress'
                    ? '运行中'
                    : latestRun.status === 'queued'
                      ? '等待运行'
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
                : '等待 CI 运行回执'}
            </Text>
            <DevTimestamp
              value={latestRun?.finishedAt}
              action="完成于"
              missing="完成时间未证明"
            />
          </div>
          <div>
            <Text type="secondary">最近一次制品发布</Text>
            <Text strong>
              {latestFullRelease
                ? formatDeliveryDuration(latestFullRelease.durationMs)
                : '未证明'}
            </Text>
            {latestFullRelease?.url ? (
              <Link href={latestFullRelease.url} target="_blank" rel="noopener noreferrer">
                {isGitLabPipeline(latestFullRelease) ? '查看 GitLab 发布记录' : '查看历史发布记录'}
              </Link>
            ) : (
              <Text type="secondary">
                尚未取得 GitLab 制品发布回执
              </Text>
            )}
            <DevTimestamp
              value={latestFullRelease?.finishedAt}
              action="完成于"
              missing="完成时间未证明"
            />
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
            <DevTimestamp
              value={release?.publishedAt}
              action="发布于"
              missing="发布时间未证明"
            />
          </div>
          <div>
            <Text type="secondary">最近一次目标部署</Text>
            <Text strong>
              {deploymentOperation
                ? formatDeliveryDuration(deploymentOperation.durationMs)
                : '暂无已证明的目标部署'}
            </Text>
            <Text type="secondary">
              {deploymentOperation
                ? `${targetCache.status} · 实传 ${formatDeliveryBytes(deploymentOperation.metrics.transferBytes)}`
                : '等待目标部署读回'}
            </Text>
            <DevTimestamp
              value={deploymentOperation?.updatedAt}
              action="完成于"
              missing="完成时间未证明"
            />
          </div>
        </div>
      </Card>
    </section>
  )
}

export default function DevPipelineTimingPanel({ timings }) {
  const latestRun = timings?.runs?.[0] || null
  if (isGitLabPipeline(latestRun)) {
    const failed = summarizePipelineStatus(timings).failureJob
    return (
      <Card className="erp-dev-pipeline-timing" variant="borderless">
        <Title level={2}>{latestRun.workflow === 'release' ? 'GitLab 发布流水线' : 'GitLab CI 流水线'}</Title>
        <Space wrap>
          <Text code>{latestRun.gitSha?.slice(0, 12)}</Text>
          <Tag color={latestRun.conclusion === 'success' ? 'success' : 'warning'}>{latestRun.status === 'in_progress' ? '运行中' : latestRun.status === 'queued' ? '等待运行' : latestRun.conclusion === 'success' ? '通过' : '尚未通过'}</Tag>
          <Text>总耗时 {formatDeliveryDuration(latestRun.durationMs)}</Text>
          <Link href={latestRun.url} target="_blank" rel="noopener noreferrer">在 GitLab 查看全部任务与日志</Link>
          {failed ? <Link href={failed.url} target="_blank" rel="noopener noreferrer">查看失败 Job：{failed.name}</Link> : null}
        </Space>
        <p>任务、日志和流水线耗时由 GitLab 提供。备份、迁移、部署读回及各环境历史仍在工作台的操作记录中查看。</p>
      </Card>
    )
  }

  return (
    <Card className="erp-dev-pipeline-timing" variant="borderless">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={latestRun ? '历史流水线的任务与日志在原始平台查看' : '尚无 GitLab 流水线记录'}
      >
        {latestRun?.url ? (
          <Link href={latestRun.url} target="_blank" rel="noopener noreferrer">
            查看历史流水线记录
          </Link>
        ) : null}
      </Empty>
    </Card>
  )
}
