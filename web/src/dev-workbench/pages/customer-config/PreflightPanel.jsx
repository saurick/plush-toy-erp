import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Alert, Space, Tag, Typography } from 'antd'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import DevTaskNav from '../../components/DevTaskNav.jsx'
import {
  guardItemLabel,
  StatusTag,
  ReviewChecklistItem,
  SourceReference,
  CommandBlock,
  CommandList,
  ImportAssetScopeItem,
  RegistryCheckItem,
  CompiledCatalogItem,
  AssetTile,
} from './presentation.jsx'

import {
  PREFLIGHT_SECTION_OPTIONS,
  PREFLIGHT_SECTION_PACKAGE,
  PREFLIGHT_SECTION_RUNTIME,
  PREFLIGHT_SECTION_FLOW,
  PREFLIGHT_SECTION_EVIDENCE,
} from './navigation.mjs'

const { Paragraph, Text } = Typography

export function PreflightPanel({
  consoleSummary,
  customerPackageSummary,
  activeSection,
  onSectionChange,
}) {
  const boundaryIssueCount = customerPackageSummary.boundaries.filter(
    (item) => !item.ok
  ).length
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="包预检"
    >
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-section-nav">
        <DevTaskNav
          compact
          ariaLabel="配置预检任务"
          items={PREFLIGHT_SECTION_OPTIONS}
          value={activeSection}
          onChange={onSectionChange}
        />
      </section>
      {activeSection === PREFLIGHT_SECTION_PACKAGE ? (
        <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-package-checks">
          <div className="erp-dev-customer-panel__head">
            <CheckCircleOutlined aria-hidden="true" />
            <Text strong>配置包检查</Text>
          </div>
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="客户配置预检步骤">
              <thead>
                <tr>
                  <th scope="col">核对项</th>
                  <th scope="col">结果</th>
                </tr>
              </thead>
              <tbody>
                {consoleSummary.preflightStages.map((item) => (
                  <tr key={item.key}>
                    <th scope="row">{item.label}</th>
                    <td>
                      <StatusTag status={item.status} />
                      {item.status === 'blocked' && item.key !== 'schema-lint' ? (
                        <Text type="danger">{item.note}</Text>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {boundaryIssueCount > 0 ? (
            <Alert
              type="error"
              showIcon
              message={`配置包存在 ${boundaryIssueCount} 项边界问题`}
              description="展开“配置范围与依据”查看具体项，处理后再继续试跑或发布检查。"
            />
          ) : null}
          <DevStaticGuidance title="配置范围与依据">
            <Text strong>操作范围</Text>
            <dl className="erp-dev-customer-preflight-notes">
              {consoleSummary.preflightStages.map((item) => (
                <div key={item.key}>
                  <dt>{item.label}</dt>
                  <dd>{item.key === 'schema-lint' ? '校验结构与配置边界' : item.note}</dd>
                </div>
              ))}
            </dl>
            <Text strong>配置包边界</Text>
            <div className="erp-dev-customer-package-guards">
              <div className="erp-dev-customer-guard-list">
                {customerPackageSummary.boundaries.map((item) => (
                  <div className="erp-dev-customer-guard" key={item.key}>
                    <Text>{guardItemLabel(item, '客户配置包边界')}</Text>
                    <Tag color={item.ok ? 'green' : 'red'}>
                      {item.ok ? item.expectedLabel : item.valueLabel}
                    </Tag>
                  </div>
                ))}
              </div>
              <CommandBlock command={customerPackageSummary.qaCommand} />
            </div>
            <Text strong>客户包资产范围</Text>
            <div className="erp-dev-customer-asset-grid">
              {consoleSummary.assetSummary.map((item) => (
                <AssetTile item={item} key={item.key} />
              ))}
            </div>
            <Text strong>客户包对象</Text>
            <Alert
              type="info"
              showIcon
              message="只读取已登记配置对象，不提供原始包上传，不接收任意代码、SQL 或业务事实"
              description="本页预检已登记配置与声明；流程、策略和命令草案只供预览。当前没有运行时扩展能力，新增扩展须先完成专项评审。"
            />
            <div className="erp-dev-customer-db-targets">
              {consoleSummary.packageAssetScope.map((item) => (
                <ImportAssetScopeItem item={item} key={item.key} />
              ))}
            </div>
          </DevStaticGuidance>
        </section>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_RUNTIME ? (
        <>
          <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-panel--module-states">
            <div className="erp-dev-customer-panel__head">
              <DeploymentUnitOutlined aria-hidden="true" />
              <Text strong>模块运行设置</Text>
            </div>
            <Text type="secondary">
              登记模块默认启用；只读或关闭需说明原因。这里预览候选设置。
            </Text>
            <div className="erp-dev-customer-tool-list">
              {customerPackageSummary.moduleStates.map((item) => (
                <article className="erp-dev-customer-tool" key={item.moduleKey}>
                  <div className="erp-dev-customer-tool__head">
                    <Space wrap>
                      <Text strong>{item.label}</Text>
                      <Tag>{item.sourceLabel}</Tag>
                      {item.overridden ? <Tag>已覆盖</Tag> : null}
                    </Space>
                    <StatusTag status={item.stateLabel} />
                  </div>
                  <Paragraph>{item.reason}</Paragraph>
                </article>
              ))}
            </div>
          </section>
          <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-panel--print-template-defaults">
            <div className="erp-dev-customer-panel__head">
              <FileTextOutlined aria-hidden="true" />
              <Text strong>打印默认方信息</Text>
            </div>
            <Text type="secondary">
              预览采购合同与加工合同的甲方默认字段；实际打印读取有效配置和单据快照。
            </Text>
            <div className="erp-dev-customer-tool-list">
              {customerPackageSummary.printTemplateDefaults.map((item) => (
                <article
                  className="erp-dev-customer-tool"
                  key={item.templateKey}
                >
                  <div className="erp-dev-customer-tool__head">
                    <Space wrap>
                      <Text strong>{item.templateLabel}</Text>
                      <Tag>{item.defaultFieldCountLabel}</Tag>
                      <Tag>{item.supplierDefaultsAllowedLabel}</Tag>
                    </Space>
                    <StatusTag status={item.status} />
                  </div>
                  <Text type="secondary">
                    {item.partyDefaultKeysLabel || '默认方字段未声明'}
                  </Text>
                  <Paragraph>{item.guardrail}</Paragraph>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_EVIDENCE ? (
        <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
          <div className="erp-dev-customer-panel__head">
            <SafetyCertificateOutlined aria-hidden="true" />
            <Text strong>人工评审清单</Text>
          </div>
          <div className="erp-dev-customer-review-list">
            {consoleSummary.reviewChecklist.map((item) => (
              <ReviewChecklistItem item={item} key={item.key} />
            ))}
          </div>
        </section>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_EVIDENCE ? (
        <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
          <div className="erp-dev-customer-panel__head">
            <SafetyCertificateOutlined aria-hidden="true" />
            <Text strong>校验结果</Text>
          </div>
          <div className="erp-dev-customer-tool-list">
            {consoleSummary.validationChecks.map((check) => (
              <article className="erp-dev-customer-tool" key={check.key}>
                <div className="erp-dev-customer-tool__head">
                  <Space wrap>
                    <Text strong>{check.label}</Text>
                    <Tag>{check.level}</Tag>
                  </Space>
                  <StatusTag status={check.status} />
                </div>
                <Paragraph>{check.note}</Paragraph>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_RUNTIME ? (
        <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
          <div className="erp-dev-customer-panel__head">
            <DeploymentUnitOutlined aria-hidden="true" />
            <Text strong>编译范围</Text>
          </div>
          <div className="erp-dev-customer-tool-list">
            {customerPackageSummary.compiledCatalogSummary.map((item) => (
              <CompiledCatalogItem item={item} key={item.key} />
            ))}
          </div>
        </section>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_FLOW ? (
        <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
          <div className="erp-dev-customer-panel__head">
            <SafetyCertificateOutlined aria-hidden="true" />
            <Text strong>策略声明与扩展边界</Text>
          </div>
          <div className="erp-dev-customer-formal-gates">
            {consoleSummary.registryChecks.map((item) => (
              <RegistryCheckItem item={item} key={item.key} />
            ))}
          </div>
        </section>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_FLOW ? (
        <>
          <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
            <div className="erp-dev-customer-panel__head">
              <DeploymentUnitOutlined aria-hidden="true" />
              <Text strong>工作流预览</Text>
            </div>
            <div className="erp-dev-customer-tool-list">
              {customerPackageSummary.workflows.map((workflow) => (
                <article className="erp-dev-customer-tool" key={workflow.key}>
                  <div className="erp-dev-customer-tool__head">
                    <Text strong>{workflow.label}</Text>
                    <StatusTag status={workflow.status} />
                  </div>
                  <Space wrap>
                    <Tag>{workflow.nodeCount} 个节点</Tag>
                    <Tag>{workflow.factBoundaryLabel}</Tag>
                    {(workflow.ownerPoolLabels || []).map((poolLabel) => (
                      <Tag key={poolLabel}>{poolLabel}</Tag>
                    ))}
                  </Space>
                  <Paragraph>{workflow.guardrail}</Paragraph>
                </article>
              ))}
            </div>
          </section>
          <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
            <div className="erp-dev-customer-panel__head">
              <ApartmentOutlined aria-hidden="true" />
              <Text strong>业务流转</Text>
            </div>
            <div className="erp-dev-customer-field-list">
              {customerPackageSummary.businessFlows.map((flow) => (
                <article className="erp-dev-customer-field" key={flow.key}>
                  <div className="erp-dev-customer-field__head">
                    <Text strong>{flow.label}</Text>
                    <StatusTag status={flow.status} />
                  </div>
                  <Text className="erp-dev-customer-field__key">
                    {flow.flowKeyLabel} / {flow.moduleRouteLabel}
                  </Text>
                  <Paragraph>{flow.guardrail}</Paragraph>
                </article>
              ))}
            </div>
          </section>
          <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
            <div className="erp-dev-customer-panel__head">
              <CodeOutlined aria-hidden="true" />
              <Text strong>状态机与策略</Text>
            </div>
            <div className="erp-dev-customer-numbering-list">
              {customerPackageSummary.stateMachines.map((item) => (
                <article className="erp-dev-customer-numbering" key={item.key}>
                  <div>
                    <Text strong>{item.label}</Text>
                    <Text type="secondary">
                      {item.stateCountLabel} / {item.transitionCountLabel}
                    </Text>
                  </div>
                  <StatusTag status={item.status} />
                  <Paragraph>{item.guardrail}</Paragraph>
                </article>
              ))}
              {customerPackageSummary.processPolicies.map((item) => (
                <article className="erp-dev-customer-numbering" key={item.key}>
                  <div>
                    <Text strong>{item.label}</Text>
                    <Text type="secondary">
                      {item.kindLabel} / {item.ruleCountLabel}
                    </Text>
                    {(item.ruleItems || []).length > 0 ? (
                      <div className="erp-dev-customer-policy-rule-list">
                        {item.ruleItems.map((rule) => (
                          <div
                            className="erp-dev-customer-policy-rule"
                            key={rule.key}
                          >
                            <Text>{rule.triggerLabel}</Text>
                            <Text type="secondary">{rule.resultLabel}</Text>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <StatusTag status={item.status} />
                  <Paragraph>{item.guardrail}</Paragraph>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
      {activeSection === PREFLIGHT_SECTION_EVIDENCE ? (
        <>
          <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
            <div className="erp-dev-customer-panel__head">
              <CopyOutlined aria-hidden="true" />
              <Text strong>预检命令</Text>
            </div>
            <CommandList commands={consoleSummary.qaCommands} />
          </section>
          <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
            <div className="erp-dev-customer-panel__head">
              <CodeOutlined aria-hidden="true" />
              <Text strong>来源路径</Text>
            </div>
            <div className="erp-dev-customer-source-ref-list">
              {consoleSummary.sourceReferences.map((item) => (
                <SourceReference item={item} key={item.key} />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
