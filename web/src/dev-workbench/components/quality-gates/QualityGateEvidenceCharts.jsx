import React from 'react'
import { Space, Tag, Typography } from 'antd'
import DevTimestamp from '../DevTimestamp.jsx'
import {
  buildQualityGateCoverageMatrix,
  buildQualityGateHistoryTrend,
  formatQualityGateDuration,
} from '../../config/devQualityGates.mjs'
import { COVERAGE_STATUS } from '../../config/qualityGatePresentation.mjs'

const { Text, Title } = Typography

export function QualityGateHistoryTrend({ operations, operation }) {
  const trend = buildQualityGateHistoryTrend(operations, operation)
  return (
    <section
      className="erp-dev-quality-history-trend"
      aria-labelledby="quality-history-trend-title"
    >
      <div className="erp-dev-quality-section-heading">
        <div>
          <Text id="quality-history-trend-title" strong>
            同环境通过耗时趋势
          </Text>
          <Text type="secondary">
            只比较相同 profile、环境指纹和 dirty / clean 状态的正式通过回执。
          </Text>
        </div>
        <Tag>{trend.sampleCount} 个可比样本</Tag>
      </div>
      {trend.enoughSamples ? (
        <ol className="erp-dev-quality-history-trend__list">
          {trend.samples.map((sample) => {
            const width = trend.maxDurationMs
              ? (sample.durationMs / trend.maxDurationMs) * 100
              : 0
            return (
              <li key={sample.id}>
                <DevTimestamp
                  value={sample.finishedAt}
                  action="完成于"
                  missing="完成时间未证明"
                />
                <span
                  className="erp-dev-quality-history-trend__track"
                  aria-hidden="true"
                >
                  <span
                    className="erp-dev-quality-history-trend__bar"
                    style={{ '--quality-history-width': `${width}%` }}
                  />
                </span>
                <Text strong>
                  {formatQualityGateDuration(sample.durationMs)}
                </Text>
              </li>
            )
          })}
        </ol>
      ) : (
        <Text type="secondary">
          至少需要 3
          个可比的正式通过回执才绘制趋势；当前不会用不同环境或工作区状态的数据补数。
        </Text>
      )}
    </section>
  )
}

export function QualityGateCoverageMatrix({ categories }) {
  const matrix = buildQualityGateCoverageMatrix(categories)
  if (matrix.gates.length === 0 || matrix.rows.length === 0) return null
  return (
    <section
      className="erp-dev-quality-coverage"
      aria-labelledby="quality-coverage-title"
    >
      <div className="erp-dev-quality-section-heading">
        <div>
          <Title id="quality-coverage-title" level={2}>
            风险 × 门禁覆盖矩阵
          </Title>
          <Text type="secondary">
            先横向比较每类风险的证据状态，再到下方查看原因与证据清单。
          </Text>
        </div>
      </div>
      <div className="erp-dev-quality-coverage__table-wrap">
        <table>
          <caption>当前筛选范围内的风险与门禁覆盖关系</caption>
          <thead>
            <tr>
              <th scope="col">风险</th>
              {matrix.gates.map((gate) => (
                <th scope="col" key={gate.key}>
                  {gate.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  <Space size={6} wrap>
                    <span>{row.label}</span>
                    {row.highRisk ? <Tag color="error">高风险</Tag> : null}
                  </Space>
                </th>
                {row.cells.map((cell) => {
                  const status =
                    COVERAGE_STATUS[cell.status] ||
                    COVERAGE_STATUS.not_applicable
                  return (
                    <td key={cell.gateKey}>
                      <span
                        className="erp-dev-quality-coverage__status"
                        data-tone={status.tone}
                      >
                        {status.label}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
