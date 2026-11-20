import { Typography } from 'antd'
import { WorkbenchFacts, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { StatusTag, statusText } from './presentation.jsx'

const { Text } = Typography

function CandidateValues({ rows, label }) {
  return (
    <div className="erp-dev-tool-table-wrap">
      <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">配置项</th>
            <th scope="col">产品默认</th>
            <th scope="col">客户候选</th>
            <th scope="col">来源</th>
            <th scope="col">影响或原因</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.key}>
              <th scope="row">{item.label}</th>
              <td>{item.defaultLabel}</td>
              <td>{item.candidateLabel}</td>
              <td>{item.sourceLabel}</td>
              <td>{item.impact}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DiffPanel({ consoleSummary, customerPackageSummary }) {
  const { moduleStates, moduleStateOverrideCount, moduleStateUnknownOverrideCount, fieldVisibilityReview } = customerPackageSummary
  const fieldsOverridden = fieldVisibilityReview.filter((item) => item.overridden).length
  const fieldRows = [
    ...moduleStates.map((item) => ({
      key: item.moduleKey,
      label: item.label,
      defaultLabel: item.defaultStateLabel,
      candidateLabel: item.stateLabel,
      sourceLabel: item.sourceLabel,
      overridden: item.overridden,
      impact: item.overridden ? item.reason : '模块运行范围',
    })),
    ...fieldVisibilityReview,
  ]
  const overrides = fieldRows.filter((item) => item.overridden)
  const defaults = fieldRows.filter((item) => !item.overridden)
  const coverage = overrides.length
    ? `模块覆盖 ${moduleStateOverrideCount} / ${moduleStates.length} · 列表与导出字段覆盖 ${fieldsOverridden} / ${fieldVisibilityReview.length}`
    : `${moduleStates.length} 个登记模块和 ${fieldVisibilityReview.length} 列字段无客户覆盖`

  return (
    <div className="erp-dev-customer-panel-grid" data-dev-customer-view="差异预览">
      <WorkbenchSection
        flat
        title="产品默认与候选配置"
        description={`工作区候选 · ${coverage}。线上取值须另行读回。`}
        className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      >
        {moduleStateUnknownOverrideCount > 0 ? (
          <Text type="danger">{moduleStateUnknownOverrideCount} 个未登记模块存在覆盖，请先核对配置包边界。</Text>
        ) : null}
        <CandidateValues rows={[...overrides, ...defaults]} label="模块与列表字段候选取值" />
        <Text type="secondary">模块开关受后端权限约束；字段只影响登记列表和 CSV。</Text>
      </WorkbenchSection>
      <WorkbenchSection flat title="各类配置影响" className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-tool-table-wrap">
          <table
            className="erp-dev-tool-table erp-dev-customer-diff-table"
            data-table-lines="appearance"
            aria-label="客户配置变化对比"
          >
            <thead>
              <tr>
                <th scope="col">配置项</th>
                <th scope="col">产品默认 / 现有实现</th>
                <th scope="col">工作区候选包</th>
                <th scope="col">影响</th>
              </tr>
            </thead>
            <tbody>
              {consoleSummary.diffItems.map((item) => (
                <tr key={item.key}>
                  <th scope="row">
                    <span>{item.type}</span>
                    {statusText(item.status) !== item.type ? <StatusTag status={item.status} /> : null}
                  </th>
                  <td>{item.current}</td>
                  <td>{item.incoming}</td>
                  <td>{item.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <WorkbenchFacts
          aria-label="候选包的运行与发布开关"
          items={consoleSummary.versionGates.map((gate) => ({ key: gate.key, label: gate.label, value: gate.enabled ? '已开启' : '未开启' }))}
        />
      </WorkbenchSection>
    </div>
  )
}
