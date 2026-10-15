import React from 'react'
import { Empty, Typography } from 'antd'
import { buildCiJobTimeline } from '../config/devCiWorkflow.mjs'
import { formatQualityGateDuration } from '../config/devQualityGates.mjs'
import DevTimestamp from './DevTimestamp.jsx'
import './dev-ci-workflow.css'

export default function DevCiJobTimeline({ jobs }) {
  const timeline = buildCiJobTimeline(jobs)
  return (
    <details className="erp-dev-ci-timeline">
      <summary>本次 Job 运行时间轴</summary>
      {!timeline.rows.length ? (
        <Empty description="本次尚无已结束且包含完整起止时间的 Job，时间轴等待实际记录" />
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            {timeline.rows.length} 个 Job · 已完成记录最大重叠 {timeline.peak}{' '}
            个 · 可见跨度 {formatQualityGateDuration(timeline.spanMs)}
            。缺少完整起止时间或尚未结束的
            {timeline.excludedCount} 个 Job
            未绘制；重试仅展示当前选定的最新尝试。
            排队耗时单列，依赖等待与资源锁等待不推算为排队区间。
          </Typography.Paragraph>
          <Typography.Paragraph>
            起点：
            <DevTimestamp value={timeline.origin} />
          </Typography.Paragraph>
          <div className="erp-dev-ci-timeline__scroll">
            <table aria-label="本次 CI Job 运行时间轴">
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">运行区间（相对起点）</th>
                  <th scope="col">排队耗时</th>
                </tr>
              </thead>
              <tbody>
                {timeline.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {row.name}
                      </a>
                    </th>
                    <td>
                      <div
                        className="erp-dev-ci-timeline__track"
                        role="img"
                        aria-label={`${row.name}：起点后 ${formatQualityGateDuration(row.offsetMs)} 开始，实际运行 ${formatQualityGateDuration(row.elapsedMs)}`}
                        title={`${row.startedAt} → ${row.finishedAt}`}
                      >
                        <span
                          className="erp-dev-ci-timeline__bar"
                          style={{
                            left: `${row.leftPercent}%`,
                            width: `${row.widthPercent}%`,
                          }}
                        />
                      </div>
                      <span className="erp-dev-ci-timeline__interval">
                        {formatQualityGateDuration(row.offsetMs)} →{' '}
                        {formatQualityGateDuration(
                          row.offsetMs + row.elapsedMs
                        )}
                      </span>
                    </td>
                    <td>{formatQualityGateDuration(row.queueMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </details>
  )
}
