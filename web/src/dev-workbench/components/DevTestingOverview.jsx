import React, { useMemo } from 'react'
import { Alert, Button, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Link, useLocation } from 'react-router-dom'
import DevTimestamp from './DevTimestamp.jsx'
import {
  buildDevTestingOverviewLink,
  buildDevTestingOverviewMethods,
  buildDevTestingOverviewReports,
} from '../config/devTestingOverview.mjs'
import { getDevTestingCoverageStatusMeta } from '../config/devTesting.mjs'
import { DEV_BUSINESS_CHAIN_AUDIT_ROUTE, DEV_DATA_PREPARATION_ROUTE } from '../config/devRoutes.mjs'
import '../styles/dev-testing-overview.css'

const STATUS_COLORS = { success: 'success', primary: 'processing', warning: 'warning', danger: 'error' }

export default function DevTestingOverview({ source, state, snapshotState, loading, onReload }) {
  const { search } = useLocation()
  const methods = useMemo(() => buildDevTestingOverviewMethods(source), [source])
  const reports = buildDevTestingOverviewReports(state)
  const overviewSearch = new URLSearchParams(search)
  overviewSearch.set('view', 'overview')
  const link = (item) => (
    <Link
      key={item.label}
      to={buildDevTestingOverviewLink(item, overviewSearch)}
      state={item.to === DEV_BUSINESS_CHAIN_AUDIT_ROUTE ? { testingReturnSearch: overviewSearch.toString() } : undefined}
    >
      {item.label}
    </Link>
  )

  return (
    <div className="erp-dev-testing-overview">
      <section className="erp-dev-testing-overview__reports" aria-label="已有测试报告" aria-busy={loading}>
        <div className="erp-dev-testing-overview__heading">
          <h2>本执行端报告</h2>
          <div className="erp-dev-testing-overview__links">
            {link({ label: '链路实测报告', to: DEV_BUSINESS_CHAIN_AUDIT_ROUTE })}
            {link({ label: '压力报告', view: 'pressure' })}
            <Button icon={<ReloadOutlined aria-hidden="true" />} loading={loading} onClick={onReload}>重新读取</Button>
          </div>
        </div>
        <div className="erp-dev-testing-overview__report-grid">
          {reports.map((item) => {
            const meta = getDevTestingCoverageStatusMeta(item.status)
            return (
              <Link
                key={item.value}
                to={buildDevTestingOverviewLink({ view: 'coverage', query: { coverage: item.value, reportSource: '', coverageDomain: '' } }, overviewSearch)}
              >
                <strong>{item.label}</strong>
                <Tag color={loading ? undefined : STATUS_COLORS[meta.tone]}>
                  {item.status === null ? '查看独立结果' : loading ? '读取中…' : state?.status === 'failed' ? '读取失败' : meta.label.split(' / ')[0]}
                </Tag>
              </Link>
            )
          })}
        </div>
        <div className="erp-dev-testing-overview__report-context">
          <span>
            当前工作区的本地执行结果
            {state?.report ? <> · <DevTimestamp value={state.report.generatedAt} /></> : null}
            {!loading && state?.status === 'missing' ? ' · 尚未生成报告，可进入代码覆盖采集基线。' : null}
            {!loading && state?.status === 'stale' ? ' · 报告已过期，仅供追溯。' : null}
          </span>
          {snapshotState?.report ? link({ label: '查看历史隔离报告', view: 'coverage', query: { reportSource: 'snapshot' } }) : null}
        </div>
        {!loading && state?.status === 'failed' ? (
          <Alert type="error" showIcon message="测试报告读取失败" description="测试入口仍可使用；请重新读取或进入测试报告查看详情。" />
        ) : null}
      </section>

      <section className="erp-dev-testing-overview__methods" aria-label="测试维度与入口">
        <div className="erp-dev-testing-overview__heading">
          <h2>测试维度与入口</h2>
          <div className="erp-dev-testing-overview__links">
            {link({ label: '按改动选验证范围', view: 'guide', query: { guide: 'tiers' } })}
            {link({ label: '增长、并发与事务', view: 'guide', query: { guide: 'growth' } })}
            <Link to={DEV_DATA_PREPARATION_ROUTE}>准备测试数据</Link>
          </div>
        </div>
        {methods.length ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="测试维度与入口">
              <thead><tr><th scope="col">测试维度</th><th scope="col">主要验证</th><th scope="col">执行入口</th><th scope="col">报告与证据</th></tr></thead>
              <tbody>
                {methods.map((method) => (
                  <tr key={method.label}>
                    <th scope="row">{method.label}</th>
                    <td>{method.scope}</td>
                    <td>
                      <div className="erp-dev-testing-overview__links">{method.execute?.map(link)}</div>
                      {method.executionNote ? <span className="erp-dev-testing-overview__note">{method.executionNote}</span> : null}
                      {!method.execute ? <span>{method.entry}</span> : null}
                    </td>
                    <td>
                      <div className="erp-dev-testing-overview__links">{method.reports?.map(link)}</div>
                      {method.reportNote ? <span className="erp-dev-testing-overview__note">{method.reportNote}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Alert type="warning" showIcon message="测试维度暂不可读，请从测试指引查看正式策略。" />}
      </section>
    </div>
  )
}
