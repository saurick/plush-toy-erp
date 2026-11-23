import { lazy, Suspense, useEffect, useRef } from 'react'
import { Button, Space, Tag, Typography } from 'antd'
import AppModal from '@/common/components/modal/AppModal'
import DevTaskNav from '../../components/DevTaskNav.jsx'
import { WorkbenchNotice, WorkbenchSection, WorkbenchToolbar } from '../../components/WorkbenchPattern.jsx'
import { AssetsPanel } from './AssetsPanel.jsx'
import CustomerConfigExportPanel from './CustomerConfigExportPanel.jsx'
import { CustomerExtensionRegistry } from './CustomerExtensionRegistry.jsx'
import { CustomerPackageContents } from './CustomerPackageContents.jsx'
import { DiffPanel } from './DiffPanel.jsx'
import { ReviewEvidence } from './ReviewEvidence.jsx'
import { guardItemLabel, RegistryCheckItem, StatusTag } from './presentation.jsx'
import {
  CUSTOMER_CONFIG_REVIEW_TABS,
  DETAIL_EVIDENCE,
  DETAIL_EXPORT,
  DETAIL_PREVIEW,
  DETAIL_STRATEGY,
  REVIEW_EXTENSIONS,
  REVIEW_FIELDS,
  REVIEW_FLOW,
} from './navigation.mjs'

const { Text } = Typography
const CustomerStrategyReview = lazy(() => import('./CustomerStrategyReview.jsx'))
const CustomerApprovalPolicy = lazy(() => import('./CustomerApprovalPolicy.jsx'))
const detailTitles = {
  [DETAIL_PREVIEW]: '界面预览',
  [DETAIL_EVIDENCE]: '校验与来源',
  [DETAIL_STRATEGY]: '其他流程草案与审批规则',
}

function OtherProcessDrafts({ summary, registryChecks }) {
  const drafts = [
    ...summary.workflows.map((item) => ({ ...item, type: '工作流', scope: [`${item.nodeCount} 个节点`, item.ownerPoolLabels.join('、'), item.factBoundaryLabel].filter(Boolean).join(' · ') })),
    ...summary.businessFlows.map((item) => ({ ...item, type: '业务流转', scope: item.moduleRouteLabel })),
    ...summary.stateMachines.map((item) => ({ ...item, type: '状态机', scope: `${item.stateCountLabel} / ${item.transitionCountLabel}` })),
  ]
  return (
    <>
      <WorkbenchSection flat title="其他流程草案" description="仅供评审">
        {drafts.length ? (
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
        ) : <Text type="secondary">暂无其他流程草案</Text>}
      </WorkbenchSection>
      {registryChecks.length > 0 ? (
        <WorkbenchSection flat title="候选策略与命令声明">
          <div className="erp-dev-customer-formal-gates">
            {registryChecks.map((item) => <RegistryCheckItem item={item} key={item.key} />)}
          </div>
        </WorkbenchSection>
      ) : null}
      <Suspense fallback={<p role="status">正在读取通用审批规则</p>}>
        <CustomerApprovalPolicy />
      </Suspense>
    </>
  )
}

export function CustomerConfigReview({
  route, disabled, onlyOverrides, onOnlyOverridesChange,
}) {
  const { overview, activeSection, activeDetail } = route
  const exportOpen = activeDetail === DETAIL_EXPORT
  const exportTrigger = useRef(null)
  const wasExportOpen = useRef(false)
  useEffect(() => {
    if (!exportOpen && wasExportOpen.current) exportTrigger.current?.focus({ preventScroll: true })
    wasExportOpen.current = exportOpen
  }, [exportOpen])
  const { customerPackageSummary, packageConsoleSummary, menuSummary } = overview
  const boundaryIssues = customerPackageSummary.boundaries.filter((item) => !item.ok)
  const reviewIssues = packageConsoleSummary.validationChecks.filter((item) =>
    item.status === 'blocked' && (boundaryIssues.length === 0 || !['no-code-sql-secret', 'runtime-loader'].includes(item.key))
  )
  const hasIssues = boundaryIssues.length + reviewIssues.length > 0
  const blockers = hasIssues ? (
    <WorkbenchNotice
      tone="error"
      title="先处理配置包问题"
      description={
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
      }
    />
  ) : null

  return (
    <div className="erp-dev-customer-panel-grid" data-dev-customer-view="配置核对">
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div hidden={exportOpen}>
          <WorkbenchToolbar
            className="erp-dev-customer-review-toolbar"
            tools={(
              <Space wrap>
                <Tag color={hasIssues ? 'error' : 'success'}>{hasIssues ? '包结构受阻' : '包结构检查通过'}</Tag>
                <Button disabled={disabled} onClick={() => route.selectDetail(DETAIL_EVIDENCE)}>校验与来源</Button>
                <Button
                  ref={exportTrigger}
                  disabled={disabled}
                  onClick={() => route.selectDetail(DETAIL_EXPORT)}
                >
                  查看配置声明
                </Button>
              </Space>
            )}
          >
            <DevTaskNav
              compact
              idPrefix="dev-customer-review"
              ariaLabel="配置核对内容"
              items={CUSTOMER_CONFIG_REVIEW_TABS}
              value={activeSection}
              onChange={route.selectSection}
              disabled={disabled}
            />
          </WorkbenchToolbar>
        </div>
        {blockers}
        {exportOpen ? (
          <CustomerConfigExportPanel
            overview={overview}
            onBack={() => route.selectDetail('')}
            disabled={disabled}
          />
        ) : (
          <section
            role="tabpanel"
            id={`dev-customer-review-panel-${activeSection}`}
            aria-labelledby={`dev-customer-review-tab-${activeSection}`}
            className="erp-dev-customer-review-content"
          >
            {activeSection === REVIEW_FIELDS ? (
              <DiffPanel
                overview={overview}
                disabled={disabled}
                onlyOverrides={onlyOverrides}
                onOnlyOverridesChange={onOnlyOverridesChange}
                onOpenPreview={() => route.selectDetail(DETAIL_PREVIEW)}
              />
            ) : null}
            {activeSection === REVIEW_FLOW ? (
              <Suspense fallback={<p role="status">正在载入客户包的流程定义</p>}>
                <CustomerStrategyReview
                  summary={customerPackageSummary}
                  disabled={disabled}
                  onOpenReference={() => route.selectDetail(DETAIL_STRATEGY)}
                />
              </Suspense>
            ) : null}
            {activeSection === REVIEW_EXTENSIONS ? (
              <CustomerExtensionRegistry summary={customerPackageSummary} disabled={disabled} />
            ) : null}
          </section>
        )}
      </section>

      <AppModal
        open={Boolean(activeDetail) && !exportOpen}
        title={detailTitles[activeDetail]}
        width={1080}
        rootClassName="erp-dev-tool-page erp-dev-customer-dialog"
        onCancel={() => route.selectDetail('')}
        footer={null}
        destroyOnHidden
      >
        {activeDetail === DETAIL_PREVIEW ? <AssetsPanel {...overview} /> : null}
        {activeDetail === DETAIL_EVIDENCE ? (
          <>
            <WorkbenchSection flat title="配置来源">
              <CustomerPackageContents area="config" summary={customerPackageSummary} menu={menuSummary} />
              <CustomerPackageContents area="display" summary={customerPackageSummary} menu={menuSummary} />
            </WorkbenchSection>
            <ReviewEvidence
              consoleSummary={packageConsoleSummary}
              customerPackageSummary={customerPackageSummary}
              menuSummary={menuSummary}
              fieldNumberingSummary={overview.fieldNumberingSummary}
              blockers={blockers}
            />
          </>
        ) : null}
        {activeDetail === DETAIL_STRATEGY ? (
          <OtherProcessDrafts summary={customerPackageSummary} registryChecks={packageConsoleSummary.registryChecks} />
        ) : null}
      </AppModal>
    </div>
  )
}
