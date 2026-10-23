import React from 'react'
import { Empty, Space, Tag, Typography } from 'antd'
import DevCiJobTimeline from '../DevCiJobTimeline.jsx'
import {
  buildQualityGateServerPerformance,
  formatQualityGateDuration,
} from '../../config/devQualityGates.mjs'
import {
  SERVER_JOB_ROLE,
  SERVER_JOB_ATTENTION,
  serverHistoryJobStatusLabel,
} from '../../config/qualityGatePresentation.mjs'

const { Link, Text, Title } = Typography

function ServerJobPerformanceTable({ rows, label }) {
  return (
    <div className="erp-dev-quality-server-performance__table-wrap">
      <table
        className="erp-dev-quality-server-performance__table"
        data-table-lines="appearance"
        aria-label={label}
      >
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col">最新运行</th>
            <th scope="col">中位 / 近似 P95</th>
            <th scope="col">中位 / 近似 P95 等待</th>
            <th scope="col">样本</th>
            <th scope="col">判断</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const attention =
              SERVER_JOB_ATTENTION[row.attention] ||
              SERVER_JOB_ATTENTION.healthy
            return (
              <tr key={row.name} data-attention={row.attention}>
                <td data-label="Job">
                  <Space size={6} wrap>
                    <Link
                      href={row.latestJobUrl || row.latestPipelineUrl}
                      rel="noreferrer"
                    >
                      <Text code>{row.name}</Text>
                    </Link>
                    <Tag color={SERVER_JOB_ROLE[row.role]?.color || 'default'}>
                      {SERVER_JOB_ROLE[row.role]?.label || '执行'}
                    </Tag>
                  </Space>
                </td>
                <td data-label="最新运行">
                  <Text
                    type={
                      row.latestConclusion === 'failure' ? 'danger' : undefined
                    }
                  >
                    {serverHistoryJobStatusLabel({
                      conclusion: row.latestConclusion,
                      status: row.latestStatus,
                    })}{' '}
                    · {formatQualityGateDuration(row.latestDurationMs)}
                  </Text>
                </td>
                <td data-label="中位 / 近似 P95">
                  <Text>
                    {formatQualityGateDuration(row.medianDurationMs)} /{' '}
                    {row.p95DurationMs === null
                      ? '样本不足'
                      : formatQualityGateDuration(row.p95DurationMs)}
                  </Text>
                </td>
                <td data-label="中位 / 近似 P95 等待">
                  <Text>
                    {formatQualityGateDuration(row.medianQueueMs)} /{' '}
                    {row.p95QueueMs === null
                      ? '样本不足'
                      : formatQualityGateDuration(row.p95QueueMs)}
                  </Text>
                </td>
                <td data-label="样本">
                  <Space size={4} wrap>
                    <Tag>{row.sampleCount} 次</Tag>
                    {row.retryCount ? (
                      <Tag color="warning">重试 {row.retryCount}</Tag>
                    ) : null}
                    {row.failureCount ? (
                      <Tag color="error">失败 {row.failureCount}</Tag>
                    ) : null}
                  </Space>
                </td>
                <td data-label="判断">
                  <Tag color={attention.color}>{attention.label}</Tag>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ServerJobPerformance({ evidence }) {
  const performance = buildQualityGateServerPerformance(evidence)
  if (!performance.rows.length) {
    return (
      <>
        <DevCiJobTimeline jobs={evidence.jobs} />
        <Empty description="最近普通 push CI 尚无可比较的 Job 数据" />
      </>
    )
  }
  const highlightedNames = new Set(
    performance.rows
      .filter((row) => row.attention !== 'healthy')
      .map((row) => row.name)
  )
  for (const row of performance.rows
    .filter((candidate) => candidate.role === 'execution')
    .slice(0, 3)) {
    highlightedNames.add(row.name)
  }
  const highlighted = performance.rows.filter((row) =>
    highlightedNames.has(row.name)
  )
  const remaining = performance.rows.filter(
    (row) => !highlightedNames.has(row.name)
  )
  return (
    <section
      className="erp-dev-quality-server-performance"
      aria-labelledby="gitlab-job-performance-title"
    >
      <div className="erp-dev-quality-server-performance__heading">
        <div>
          <Title level={3} id="gitlab-job-performance-title">
            历史 Job 性能
          </Title>
          <Text type="secondary">
            最近普通 push CI 的逐 Job 运行、等待与重试；执行 Job 使用 90 / 120
            秒复核线，是否拆分仍看多次样本与边界，汇总 Job 单独判断。
          </Text>
        </div>
        <Space size={6} wrap>
          <Tag>{performance.historyCount} 次 CI</Tag>
          <Tag>{performance.executionCount} 个执行 Job</Tag>
          {performance.criticalCount ? (
            <Tag color="error">红线 {performance.criticalCount}</Tag>
          ) : null}
          {performance.reviewCount ? (
            <Tag color="warning">黄线 {performance.reviewCount}</Tag>
          ) : null}
          {performance.queueAttentionCount ? (
            <Tag color="processing">
              等待偏长 {performance.queueAttentionCount}
            </Tag>
          ) : null}
          {performance.unstableCount ? (
            <Tag color="warning">失败/重试 {performance.unstableCount}</Tag>
          ) : null}
        </Space>
      </div>
      <DevCiJobTimeline jobs={evidence.jobs} />
      <ServerJobPerformanceTable
        rows={highlighted}
        label="需要关注的历史 Job 性能"
      />
      {remaining.length ? (
        <details className="erp-dev-disclosure erp-dev-quality-server-performance__remaining">
          <summary>展开其余 {remaining.length} 个 Job</summary>
          <ServerJobPerformanceTable
            rows={remaining}
            label="其余历史 Job 性能"
          />
        </details>
      ) : null}
    </section>
  )
}
