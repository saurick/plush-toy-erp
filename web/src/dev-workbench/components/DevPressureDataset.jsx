import React, { useState } from 'react'
import { Select, Typography } from 'antd'
import {
  comparePressureScale,
  formatPressureNumber as format,
  pressureMainLevel,
  pressureScaleLabel,
} from '../config/devPressure.mjs'

const { Title } = Typography
const percentage = (value) =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${format(value, 1)}%` : '—'

export default function DevPressureDataset({ report, reports }) {
  const [baselineID, setBaselineID] = useState('')
  const data = report.dataset
  const candidates = reports.filter((item) => item.id !== report.id)
  const baseline = candidates.find(({ id }) => id === baselineID)
  const comparison = baseline ? comparePressureScale(report, baseline) : null
  if (!data) {
    return (
      <p className="erp-dev-pressure-note">
        该报告未记录数据规模，不能用于规模对比。
      </p>
    )
  }
  const main = pressureMainLevel(report)
  const maximum = Math.max(
    1,
    main?.operations.successfulRps || 0,
    baseline?.main?.operations.successfulRps || 0
  )
  return (
    <section
      className="erp-dev-pressure-section"
      aria-label="数据规模与同条件对比"
    >
      <Title level={3}>数据规模 · {pressureScaleLabel(data.dataScale)}</Title>
      <div className="erp-dev-tool-table-wrap">
        <table className="erp-dev-tool-table" aria-label="历史背景与当轮订单池">
          <thead>
            <tr>
              <th>数据范围</th>
              <th>订单</th>
              <th>普通 / 复杂</th>
              <th>订单明细</th>
              <th>预计用料来源</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['历史背景', data.history],
              ['当轮订单池', data.working],
            ].map(([label, counts]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{format(counts.orders)}</td>
                <td>
                  {format(counts.ordinaryOrders)} /{' '}
                  {format(counts.complexOrders)}
                </td>
                <td>{format(counts.orderItems)}</td>
                <td>{format(counts.demandSources)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="erp-dev-pressure-note">
        普通单 {format(data.complexity.ordinary.lines)} 行 ×{' '}
        {format(data.complexity.ordinary.bomParts)} 个 BOM 部位；复杂单{' '}
        {format(data.complexity.complex.lines)} 行 ×{' '}
        {format(data.complexity.complex.bomParts)} 个 BOM 部位。
        历史背景已生成采购单 {format(data.history.purchaseOrders)} 张、采购明细{' '}
        {format(data.history.purchaseItems)} 条；计时流程只消耗当轮订单池。
      </p>
      <details>
        <summary>背景状态、查询数据与存储占用</summary>
        <p>
          未提交 {format(data.history.states.PREVIEW)}，待老板审批{' '}
          {format(data.history.states.SUBMITTED)}，待财务审批{' '}
          {format(data.history.states.BOSS_APPROVED)}，审批完成{' '}
          {format(data.history.states.APPROVED)}。
        </p>
        <div className="erp-dev-tool-table-wrap">
          <table
            className="erp-dev-tool-table"
            aria-label="查询背景计划与实际数量"
          >
            <thead>
              <tr>
                <th>查询背景</th>
                <th>计划下限</th>
                <th>造数后实际</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries({
                workflowTasks: '协同任务',
                productionFacts: '生产草稿',
                financeFacts: '财务草稿',
                attachments: '附件',
              }).map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{format(data.reads.target[key])}</td>
                  <td>{format(data.reads.actual[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          业务负载前：数据库{' '}
          {format(
            data.storage.databaseBytes === null
              ? null
              : data.storage.databaseBytes / 1048576,
            1
          )}{' '}
          MiB；订单、用料与采购表（含索引）
          {format(
            data.storage.businessTableBytes === null
              ? null
              : data.storage.businessTableBytes / 1048576,
            1
          )}{' '}
          MiB。
        </p>
      </details>
      <div className="erp-dev-pressure-report-select">
        <label htmlFor="dev-pressure-comparison">比较基准报告</label>
        <Select
          id="dev-pressure-comparison"
          aria-label="比较基准报告"
          allowClear
          value={baseline?.id}
          onChange={(value) => setBaselineID(value || '')}
          options={candidates.map((item) => ({
            value: item.id,
            label: `${pressureScaleLabel(item.dataScale)} · ${item.profile === 'quick' ? '短档' : '容量'} · ${item.id}`,
          }))}
          placeholder="选择另一数据规模的运行"
        />
      </div>
      {!comparison || comparison.reason ? (
        <p className="erp-dev-pressure-note">
          {comparison?.reason ||
            '同一源码、负载和环境下，选择另一规模的已通过报告，查看吞吐及各 API 延迟变化。'}
        </p>
      ) : (
        <>
          <p>
            从{pressureScaleLabel(baseline.dataScale)}（
            {format(baseline.historyOrders)} 张历史单）到
            {pressureScaleLabel(data.dataScale)}（{format(data.history.orders)}{' '}
            张历史单），主段混合操作吞吐变化 {percentage(comparison.throughput)}
            。
          </p>
          <div
            className="erp-dev-pressure-bars"
            role="img"
            aria-label="两种数据规模的混合操作吞吐比较"
          >
            {[
              [
                pressureScaleLabel(baseline.dataScale),
                baseline.main.operations.successfulRps,
              ],
              [
                pressureScaleLabel(data.dataScale),
                main.operations.successfulRps,
              ],
            ].map(([label, value]) => (
              <div className="erp-dev-pressure-bar-line" key={label}>
                <span>{label}</span>
                <div className="erp-dev-pressure-track">
                  <span
                    className="erp-dev-pressure-bar erp-dev-pressure-bar--operations"
                    style={{ width: `${(value / maximum) * 100}%` }}
                  />
                </div>
                <b>{format(value, 2)} 次/秒</b>
              </div>
            ))}
          </div>
          <div className="erp-dev-tool-table-wrap">
            <table
              className="erp-dev-tool-table erp-dev-pressure-methods"
              aria-label="不同数据规模的 API 延迟变化"
            >
              <thead>
                <tr>
                  <th>API 方法</th>
                  <th>p95 基准 → 当前</th>
                  <th>p95 变化</th>
                  <th>p99 基准 → 当前</th>
                  <th>p99 变化</th>
                </tr>
              </thead>
              <tbody>
                {comparison.methods.map((method) => (
                  <tr key={method.name}>
                    <th scope="row">
                      <code>{method.name}</code>
                    </th>
                    <td>
                      {format(method.beforeP95, 1)} →{' '}
                      {format(method.afterP95, 1)} ms
                    </td>
                    <td>{percentage(method.p95)}</td>
                    <td>
                      {format(method.beforeP99, 1)} →{' '}
                      {format(method.afterP99, 1)} ms
                    </td>
                    <td>{percentage(method.p99)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="erp-dev-pressure-note">
            吞吐下降、延迟上升值得复查；短档与少量样本存在波动。宿主机上其他任务会影响读数，正式容量判断需在稳定资源条件下复测。
          </p>
        </>
      )}
    </section>
  )
}
