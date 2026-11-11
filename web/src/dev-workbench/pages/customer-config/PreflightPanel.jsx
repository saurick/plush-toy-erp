import { lazy, Suspense, useRef, useState } from 'react'
import { Tag, Typography } from 'antd'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import DevTaskNav from '../../components/DevTaskNav.jsx'
import { WorkbenchNotice, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { CustomerExtensionRegistry } from './CustomerExtensionRegistry.jsx'
import { CustomerPackageDiagram } from './CustomerPackageDiagram.jsx'
import { guardItemLabel, StatusTag, RegistryCheckItem } from './presentation.jsx'
import { ReviewEvidence } from './ReviewEvidence.jsx'
import { RuntimeSettings } from './RuntimeSettings.jsx'

import {
  PREFLIGHT_SECTION_OPTIONS,
  PREFLIGHT_SECTION_PACKAGE,
  PREFLIGHT_SECTION_RUNTIME,
  PREFLIGHT_SECTION_FLOW,
  PREFLIGHT_SECTION_EXTENSIONS,
  PREFLIGHT_SECTION_EVIDENCE,
} from './navigation.mjs'

const { Text } = Typography
const CustomerStrategyReview = lazy(() => import('./CustomerStrategyReview.jsx'))
const CustomerApprovalPolicy = lazy(() => import('./CustomerApprovalPolicy.jsx'))

function OtherProcessDrafts({ summary }) {
  const drafts = [
    ...summary.workflows.map((item) => ({ ...item, type: '工作流', scope: [`${item.nodeCount} 个节点`, item.ownerPoolLabels.join('、'), item.factBoundaryLabel].filter(Boolean).join(' · ') })),
    ...summary.businessFlows.map((item) => ({ ...item, type: '业务流转', scope: item.moduleRouteLabel })),
    ...summary.stateMachines.map((item) => ({ ...item, type: '状态机', scope: `${item.stateCountLabel} / ${item.transitionCountLabel}` })),
  ]
  if (!drafts.length) return null

  return (
    <DevStaticGuidance title="其他流程草案" hint="仅供评审">
      <div className="erp-dev-tool-table-wrap">
        <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="其他流程草案">
          <thead><tr><th scope="col">声明</th><th scope="col">范围</th><th scope="col">边界</th></tr></thead>
          <tbody>
            {drafts.map((item) => (
              <tr key={`${item.type}:${item.key}`}>
                <th scope="row">{item.label}<br /><Text type="secondary">{item.type}</Text></th>
                <td>{item.scope}</td>
                <td>{item.status !== 'preview_only' ? <StatusTag status={item.status} /> : null}{item.guardrail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DevStaticGuidance>
  )
}

export function PreflightPanel({
  consoleSummary,
  customerPackageSummary,
  menuSummary,
  fieldNumberingSummary,
  activeSection,
  onSectionChange,
}) {
  const [packageArea, setPackageArea] = useState(null)
  const sectionNav = useRef(null)
  const openSection = (section) => {
    const index = PREFLIGHT_SECTION_OPTIONS.findIndex((item) => item.value === section)
    sectionNav.current?.querySelectorAll('[role="tab"]')[index]?.focus()
    onSectionChange(section)
  }
  const boundaryIssues = customerPackageSummary.boundaries.filter(
    (item) => !item.ok
  )
  const reviewIssues = consoleSummary.validationChecks.filter((item) =>
    item.status === 'blocked' && (boundaryIssues.length === 0 || !['no-code-sql-secret', 'runtime-loader'].includes(item.key))
  )
  const hasIssues = boundaryIssues.length + reviewIssues.length > 0
  const blockers = hasIssues ? (
    <WorkbenchNotice
      tone="error"
      title="先处理配置包问题"
      description={
        <>
          <ul className="erp-dev-customer-boundary-issues">
            {boundaryIssues.map((item) => (
              <li key={item.key}>
                <strong>{guardItemLabel(item, '客户配置包边界')}</strong>
                {'：'}{item.valueLabel}
                {item.expectedLabel ? `；要求：${item.expectedLabel}` : ''}
              </li>
          ))}
            {reviewIssues.map((item) => (
              <li key={item.key}><strong>{item.label}：</strong>{item.note}</li>
            ))}
          </ul>
          <Text>处理后再继续试跑或发布检查。</Text>
        </>
      }
    />
  ) : null
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="包预检"
    >
      <section ref={sectionNav} className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-section-nav">
        <DevTaskNav
          compact
          ariaLabel="配置预检任务"
          items={PREFLIGHT_SECTION_OPTIONS}
          value={activeSection}
          onChange={onSectionChange}
        />
      </section>
      {activeSection === PREFLIGHT_SECTION_PACKAGE ? (
        <WorkbenchSection
          flat
          className="erp-dev-customer-panel erp-dev-customer-panel--wide"
          title="客户包结构"
          description="目标环境未核验"
          tools={!hasIssues ? <Tag color="success">包结构检查通过</Tag> : null}
        >
          {blockers}
          <CustomerPackageDiagram
            area={packageArea}
            summary={customerPackageSummary}
            menu={menuSummary}
            numbering={fieldNumberingSummary}
            onSelectArea={setPackageArea}
            onOpenSection={openSection}
          />
        </WorkbenchSection>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_RUNTIME ? (
        <RuntimeSettings summary={customerPackageSummary} />
      ) : null}
      {activeSection === PREFLIGHT_SECTION_FLOW ? (
        <>
          <Suspense fallback={<section className="erp-dev-customer-panel erp-dev-customer-panel--wide" role="status">正在载入客户包的流程定义</section>}>
            <CustomerStrategyReview key={customerPackageSummary.customerKey} summary={customerPackageSummary} />
          </Suspense>
          <WorkbenchSection flat className="erp-dev-customer-panel erp-dev-customer-panel--wide">
            <OtherProcessDrafts summary={customerPackageSummary} />
            {consoleSummary.registryChecks.length > 0 ? (
              <DevStaticGuidance title="查看候选策略与命令声明">
                <div className="erp-dev-customer-formal-gates">
                  {consoleSummary.registryChecks.map((item) => (
                    <RegistryCheckItem item={item} key={item.key} />
                  ))}
                </div>
              </DevStaticGuidance>
            ) : null}
            <DevStaticGuidance title="产品通用审批规则">
              <Suspense fallback={<Text type="secondary" role="status">正在读取通用审批规则</Text>}>
                <CustomerApprovalPolicy />
              </Suspense>
            </DevStaticGuidance>
          </WorkbenchSection>
        </>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_EXTENSIONS ? (
        <CustomerExtensionRegistry summary={customerPackageSummary} />
      ) : null}
      {activeSection === PREFLIGHT_SECTION_EVIDENCE ? (
        <ReviewEvidence
          consoleSummary={consoleSummary}
          customerPackageSummary={customerPackageSummary}
          menuSummary={menuSummary}
          blockers={blockers}
        />
      ) : null}
    </div>
  )
}
