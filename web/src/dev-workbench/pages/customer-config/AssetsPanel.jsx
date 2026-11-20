import { Fragment, useState } from 'react'
import { Button, Checkbox, Space, Tag, Typography } from 'antd'
import { getBusinessModule } from '@/erp/config/businessModules.mjs'
import { navigationItemRegistry } from '@/erp/config/seedData.mjs'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { WorkbenchNotice, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { guardItemLabel, StatusTag } from './presentation.jsx'

const { Paragraph, Text, Title } = Typography
const wide = 'erp-dev-customer-panel erp-dev-customer-panel--wide'

function MenuPreviewItem({ itemKey, showKey }) {
  const key = String(itemKey || '').trim()
  const item = getBusinessModule(key) || navigationItemRegistry[key]
  return (
    <li className="erp-dev-customer-menu-item">
      <span>{item?.label || '未识别菜单项'}</span>
      {showKey ? <code>{key}</code> : null}
    </li>
  )
}

function PrintFieldEvidence({ template }) {
  return (
    <section className="erp-dev-customer-tool" aria-label={`${template.title}字段依据`}>
      <Text strong>{template.title} · 字段依据</Text>
      <ul>
        {template.fieldTruth.map((truth) => <li key={truth}>{truth}</li>)}
      </ul>
      <div className="erp-dev-customer-tool-list">
        {template.fieldRequirementItems.map((requirement) => (
          <div className="erp-dev-customer-asset" key={`${template.key}-${requirement.label}`}>
            <Space wrap>
              <Text strong>{requirement.label}</Text>
              <Tag>{requirement.requirementKeyLabel}</Tag>
            </Space>
            <Text type="secondary">{requirement.sourceLabel}</Text>
            <Paragraph>{requirement.boundary}</Paragraph>
          </div>
        ))}
      </div>
    </section>
  )
}

export function AssetsPanel({ menuSummary, fieldNumberingSummary, printTemplateSummary }) {
  const [showMenuKeys, setShowMenuKeys] = useState(false)
  const [templateKey, setTemplateKey] = useState('')
  const { templates } = printTemplateSummary
  const { fieldCandidates, numberingRules, boundaries } = fieldNumberingSummary
  const boundaryIssues = boundaries.filter((item) => !item.ok)

  return (
    <div className="erp-dev-customer-panel-grid" data-dev-customer-view="菜单字段">
      <section className={`${wide} erp-dev-customer-panel--brand`}>
        <div className="erp-dev-customer-brand-mark">{menuSummary.brand.brandMark || '客'}</div>
        <div>
          <Title level={2}>{menuSummary.brand.companyName}</Title>
          <Paragraph>{menuSummary.brand.systemName}</Paragraph>
          <Space wrap>
            <StatusTag status={menuSummary.runtimeStatus} />
            <Tag>{menuSummary.sourceLabel || '来源已登记'}</Tag>
          </Space>
        </div>
      </section>
      {boundaryIssues.length > 0 ? (
        <section className={wide}>
          <WorkbenchNotice
            tone="error"
            title="页面配置不符合保护规则"
            description={
              <ul className="erp-dev-customer-boundary-issues">
                {boundaryIssues.map((item) => (
                  <li key={item.key}>
                    {guardItemLabel(item, '字段编号边界')}：{item.valueLabel}
                    {item.expectedLabel ? `；要求：${item.expectedLabel}` : ''}
                  </li>
                ))}
              </ul>
            }
          />
        </section>
      ) : null}
      <WorkbenchSection
        flat
        title="菜单分组"
        description={`${menuSummary.sections.length} 个分组 · ${menuSummary.itemCount} 个菜单项`}
        tools={menuSummary.sections.length > 0 ? (
          <Checkbox checked={showMenuKeys} onChange={(event) => setShowMenuKeys(event.target.checked)}>
            显示菜单标识
          </Checkbox>
        ) : null}
        className={wide}
      >
        {menuSummary.sections.length > 0 ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="菜单分组与页面">
              <thead><tr><th scope="col">分组</th><th scope="col">页面</th></tr></thead>
              <tbody>
                {menuSummary.sections.map((section) => (
                  <tr key={section.title}>
                    <th scope="row">{section.title}</th>
                    <td>
                      <ul className="erp-dev-customer-menu-items">
                        {section.items.map((item) => <MenuPreviewItem key={item} itemKey={item} showKey={showMenuKeys} />)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Text type="secondary">暂无登记菜单。</Text>}
      </WorkbenchSection>
      <WorkbenchSection flat title="字段显示候选" description="仅供评审。" className={wide}>
        {fieldCandidates.length > 0 ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="字段显示候选">
              <thead><tr><th scope="col">字段</th><th scope="col">模块</th><th scope="col">建议</th><th scope="col">说明</th></tr></thead>
              <tbody>
                {fieldCandidates.map((candidate) => (
                  <tr key={`${candidate.module}:${candidate.key}`}>
                    <th scope="row">{candidate.label}</th>
                    <td>{candidate.moduleLabel}</td>
                    <td><StatusTag status={candidate.decisionLabel} /></td>
                    <td>
                      {candidate.note}
                      <br /><Text type="secondary">{candidate.fieldKeyLabel} / {candidate.sourceLabel}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Text type="secondary">暂无字段候选。</Text>}
      </WorkbenchSection>
      <WorkbenchSection flat title="编号规则候选" description="仅供评审。" className={wide}>
        {numberingRules.length > 0 ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="编号规则候选">
              <thead><tr><th scope="col">规则</th><th scope="col">业务范围</th><th scope="col">状态</th><th scope="col">待确认</th></tr></thead>
              <tbody>
                {numberingRules.map((rule) => (
                  <tr key={rule.key}>
                    <th scope="row">{rule.label}</th>
                    <td>{rule.domain}</td>
                    <td><StatusTag status={rule.decisionLabel} /></td>
                    <td>{rule.unresolvedQuestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Text type="secondary">暂无编号规则。</Text>}
      </WorkbenchSection>
      <WorkbenchSection
        flat
        title="打印模板"
        description="销售订单受理当前未接打印模板；客户抬头、签章和固定文案不进入产品核心表单。"
        className={wide}
      >
        {templates.length > 0 ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="打印模板清单">
              <thead><tr><th scope="col">模板</th><th scope="col">类型与边界</th><th scope="col">字段</th><th scope="col">状态</th><th scope="col">依据</th></tr></thead>
              <tbody>
                {templates.map((template) => {
                  const open = template.key === templateKey
                  return (
                    <Fragment key={template.key}>
                      <tr>
                        <th scope="row">{template.title}</th>
                        <td>{template.category} · {template.factBoundaryLabel}</td>
                        <td>{template.fieldTruthCountLabel} · {template.fieldRequirementCountLabel}</td>
                        <td><StatusTag status={template.readiness} /></td>
                        <td>
                          <Button
                            size="small"
                            type="link"
                            aria-expanded={open}
                            aria-label={`${template.title}字段依据`}
                            onClick={() => setTemplateKey(open ? '' : template.key)}
                          >
                            {open ? '收起字段' : '字段依据'}
                          </Button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={5}>
                            <Text type="secondary">{template.templateKeyLabel}</Text>
                            <PrintFieldEvidence template={template} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <Text type="secondary">暂无登记模板。</Text>}
        {boundaries.length > 0 ? (
          <DevStaticGuidance title="页面配置保护规则">
            <div className="erp-dev-customer-guard-list">
              {boundaries.map((item) => (
                <div className="erp-dev-customer-guard" key={item.key}>
                  <Text>{guardItemLabel(item, '字段编号边界')}</Text>
                  <Tag color={item.ok ? 'green' : 'red'}>{item.ok ? item.expectedLabel : item.valueLabel}</Tag>
                </div>
              ))}
            </div>
          </DevStaticGuidance>
        ) : null}
      </WorkbenchSection>
    </div>
  )
}
