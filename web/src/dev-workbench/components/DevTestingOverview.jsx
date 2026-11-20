import React from 'react'
import { Alert, Button, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import DevTimestamp from './DevTimestamp.jsx'
import {
  buildDevTestingOverviewReports,
} from '../config/devTestingOverview.mjs'
import { getDevTestingCoverageStatusMeta } from '../config/devTesting.mjs'
import '../styles/dev-testing-overview.css'

const STATUS_COLORS = { success: 'success', primary: 'processing', warning: 'warning', danger: 'error' }

export default function DevTestingOverview({ state, snapshotState, loading, onReload }) {
  const reports = buildDevTestingOverviewReports(state)
  const showReportContext = Boolean(state?.report || snapshotState?.report || (!loading && ['missing', 'stale'].includes(state?.status)))

  return (
    <div className="erp-dev-testing-overview">
      <section className="erp-dev-testing-overview__reports" aria-label="已有测试报告" aria-busy={loading}>
        <div className="erp-dev-testing-overview__heading">
          <h2>{import.meta.env.PLUSH_STANDALONE_WORKBENCH ? '服务器报告' : '已有报告'}</h2>
          <div className="erp-dev-testing-overview__links">
            <Button icon={<ReloadOutlined aria-hidden="true" />} loading={loading} onClick={onReload}>重新读取</Button>
          </div>
        </div>
        <table data-table-lines="appearance" className="erp-dev-tool-table erp-dev-testing-simple-table" aria-label="已有报告状态">
          <thead><tr><th scope="col">报告</th><th scope="col">状态</th></tr></thead>
          <tbody>{reports.map((item) => {
            const meta = getDevTestingCoverageStatusMeta(item.status)
            return (
              <tr key={item.value}>
                <th scope="row">{item.label}</th>
                <td><Tag color={loading ? undefined : STATUS_COLORS[meta.tone]}>{item.status === null ? '单独核对' : loading ? '读取中…' : state?.status === 'failed' ? '读取失败' : meta.label.split(' / ')[0]}</Tag></td>
              </tr>
            )
          })}
          </tbody>
        </table>
        {showReportContext ? (
          <div className="erp-dev-testing-overview__report-context">
            {state?.report ? <span>生成于 <DevTimestamp value={state.report.generatedAt} /></span> : null}
            {!loading && state?.status === 'missing' ? <span>{import.meta.env.PLUSH_STANDALONE_WORKBENCH ? '此执行端没有该报告；CI 报告见服务器验证。' : '尚未生成报告，可进入代码覆盖采集基线。'}</span> : null}
            {!loading && state?.status === 'stale' ? <span>报告已过期，仅供追溯。</span> : null}
            {snapshotState?.report ? <span>有历史隔离报告</span> : null}
          </div>
        ) : null}
        {!loading && state?.status === 'failed' ? (
          <Alert type="error" showIcon message="测试报告读取失败" description="测试入口仍可使用；请重新读取或进入覆盖报告查看详情。" />
        ) : null}
      </section>

    </div>
  )
}
