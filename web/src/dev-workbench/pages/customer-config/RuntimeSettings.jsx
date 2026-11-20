import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { WorkbenchNotice, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { CompiledCatalogItem, StatusTag } from './presentation.jsx'

function summarizeModules(rows, overrideCount) {
  if (rows.length === 0) return '没有登记模块'
  if (overrideCount === 0 && rows.every((item) => item.state === 'enabled')) {
    return `${rows.length} 个模块均沿用产品默认（启用）`
  }
  const counts = new Map()
  for (const row of rows) counts.set(row.stateLabel, (counts.get(row.stateLabel) || 0) + 1)
  return [
    `共 ${rows.length} 个模块`,
    ...[...counts].map(([label, count]) => `${count} 个${label}`),
    overrideCount > 0 ? `${overrideCount} 项客户覆盖` : '无客户覆盖',
  ].join(' · ')
}

export function RuntimeSettings({ summary }) {
  const overrides = summary.moduleStates.filter((item) => item.overridden)
  const defaults = summary.moduleStates.filter((item) => !item.overridden)

  return (
    <>
      <WorkbenchSection
        flat
        title="模块运行设置"
        description={`工作区候选 · ${summarizeModules(summary.moduleStates, overrides.length)}`}
        className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      >
        {summary.moduleStateUnknownOverrideCount > 0 ? (
          <WorkbenchNotice
            tone="error"
            title={`${summary.moduleStateUnknownOverrideCount} 个未登记模块存在覆盖`}
            description="在「评审依据」核对配置包边界。"
          />
        ) : null}
        {summary.moduleStates.length > 0 ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="模块候选取值">
              <thead>
                <tr>
                  <th scope="col">模块</th><th scope="col">候选状态</th><th scope="col">来源</th>
                  {overrides.length > 0 ? <th scope="col">覆盖原因</th> : null}
                </tr>
              </thead>
              <tbody>
                {[...overrides, ...defaults].map((item) => (
                  <tr key={item.moduleKey}>
                    <th scope="row">{item.label}</th>
                    <td>{item.overridden ? <StatusTag status={item.stateLabel} /> : item.stateLabel}</td>
                    <td>{item.sourceLabel}</td>
                    {overrides.length > 0 ? <td>{item.overridden ? item.reason : '—'}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </WorkbenchSection>
      <WorkbenchSection
        flat
        title="打印默认方信息"
        description="实际打印读取有效配置和单据快照。"
        className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      >
        {summary.printTemplateDefaults.length > 0 ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="打印默认方信息">
              <thead>
                <tr><th scope="col">模板</th><th scope="col">候选抬头</th><th scope="col">状态</th><th scope="col">字段</th><th scope="col">使用边界</th></tr>
              </thead>
              <tbody>
                {summary.printTemplateDefaults.map((item) => (
                  <tr key={item.templateKey}>
                    <th scope="row">{item.templateLabel}</th>
                    <td>{item.buyerCompany || '未填写'}</td>
                    <td><StatusTag status={item.status} /></td>
                    <td>{item.partyDefaultKeysLabel || '默认方字段未声明'}</td>
                    <td>{item.supplierDefaultsAllowedLabel}；{item.guardrail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p>本包未声明打印默认方信息。</p>}
        <DevStaticGuidance title="编译范围" hint={`${summary.compiledCatalogSummary.length} 类`}>
          <div className="erp-dev-customer-tool-list">
            {summary.compiledCatalogSummary.map((item) => <CompiledCatalogItem item={item} key={item.key} />)}
          </div>
        </DevStaticGuidance>
      </WorkbenchSection>
    </>
  )
}
