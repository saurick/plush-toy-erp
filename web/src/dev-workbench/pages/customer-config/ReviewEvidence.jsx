import { Tag, Typography } from 'antd'
import { WorkbenchFacts, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { CustomerConfigFieldGuide } from './CustomerConfigFieldGuide.jsx'
import {
  CommandList,
  CompiledCatalogItem,
  guardItemLabel,
  ReviewChecklistItem,
  SourceReference,
  StatusTag,
  statusText,
} from './presentation.jsx'

const { Text } = Typography

export function ReviewEvidence({ consoleSummary, customerPackageSummary, menuSummary, fieldNumberingSummary, blockers }) {
  const counts = new Map()
  for (const check of consoleSummary.validationChecks) {
    counts.set(check.status, (counts.get(check.status) || 0) + 1)
  }
  const summary = [...counts].map(([status, count]) => `${statusText(status)} ${count} 项`).join(' · ')
  const validations = [
    ...consoleSummary.validationChecks.filter((item) => item.status === 'blocked'),
    ...consoleSummary.validationChecks.filter((item) => item.status !== 'blocked'),
  ]

  return (
    <>
      <WorkbenchSection
        flat
        title="配置校验"
        description={`当前工作区 · ${summary}`}
        className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      >
        {blockers}
        <div className="erp-dev-tool-table-wrap">
          <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="配置校验明细">
            <thead>
              <tr><th scope="col">校验项</th><th scope="col">级别</th><th scope="col">结果</th><th scope="col">依据</th></tr>
            </thead>
            <tbody>
              {validations.map((item) => (
                <tr key={item.key}>
                  <th scope="row">{item.label}</th>
                  <td>{item.level}</td>
                  <td>{item.status === 'passed' ? statusText(item.status) : <StatusTag status={item.status} />}</td>
                  <td>{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WorkbenchSection>
      <WorkbenchSection flat title="预检结果" className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-tool-table-wrap">
          <table className="erp-dev-tool-table erp-dev-customer-preflight-table" data-table-lines="appearance" aria-label="客户配置预检步骤">
            <thead><tr><th scope="col">核对项</th><th scope="col">结果</th></tr></thead>
            <tbody>
              {consoleSummary.preflightStages.map((item) => (
                <tr key={item.key}>
                  <th scope="row">{item.label}</th>
                  <td>
                    <StatusTag status={item.status} />
                    {item.status === 'blocked' && item.key !== 'schema-lint' ? <Text type="danger">{item.note}</Text> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WorkbenchSection>
      <WorkbenchSection flat title="人工评审清单" className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-review-list">
          {consoleSummary.reviewChecklist.map((item) => <ReviewChecklistItem item={item} key={item.key} />)}
        </div>
      </WorkbenchSection>
      <WorkbenchSection flat title="字段说明" className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <CustomerConfigFieldGuide
          packageSourcePath={customerPackageSummary.sourcePath}
          menuSourcePath={menuSummary.sourcePath}
        />
      </WorkbenchSection>
      <WorkbenchSection flat title="配置包边界明细" className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-package-guards">
        <div className="erp-dev-customer-guard-list">
          {customerPackageSummary.boundaries.map((item) => (
            <div className="erp-dev-customer-guard" key={item.key}>
              <Text>{guardItemLabel(item, '客户配置包边界')}</Text>
              <Tag color={item.ok ? 'green' : 'red'}>{item.ok ? item.expectedLabel : item.valueLabel}</Tag>
            </div>
          ))}
        </div>
      </WorkbenchSection>
      <WorkbenchSection flat title="编译范围与发布资格" className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <WorkbenchFacts
          items={consoleSummary.versionGates.map((gate) => ({
            key: gate.key,
            label: gate.label,
            value: gate.enabled ? '已开启' : '未开启',
          }))}
        />
        <div className="erp-dev-customer-tool-list">
          {customerPackageSummary.compiledCatalogSummary.map((item) => <CompiledCatalogItem key={item.key} item={item} />)}
        </div>
      </WorkbenchSection>
      {fieldNumberingSummary.boundaries.length > 0 ? (
        <WorkbenchSection flat title="页面配置保护规则" className="erp-dev-customer-panel erp-dev-customer-panel--wide">
          <div className="erp-dev-customer-guard-list">
            {fieldNumberingSummary.boundaries.map((item) => (
              <div className="erp-dev-customer-guard" key={item.key}>
                <Text>{guardItemLabel(item, '字段编号边界')}</Text>
                <Tag color={item.ok ? 'green' : 'red'}>{item.ok ? item.expectedLabel : item.valueLabel}</Tag>
              </div>
            ))}
          </div>
        </WorkbenchSection>
      ) : null}
      <WorkbenchSection flat title="预检命令与来源路径" className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <CommandList commands={consoleSummary.qaCommands} />
        <div className="erp-dev-customer-source-ref-list">
          {consoleSummary.sourceReferences.map((item) => <SourceReference item={item} key={item.key} />)}
        </div>
      </WorkbenchSection>
    </>
  )
}
