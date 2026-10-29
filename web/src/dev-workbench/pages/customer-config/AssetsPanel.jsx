import {
  ApartmentOutlined,
  CodeOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Alert, Space, Tag, Typography } from 'antd'
import { getBusinessModule } from '@/erp/config/businessModules.mjs'
import { navigationItemRegistry } from '@/erp/config/seedData.mjs'
import { guardItemLabel, StatusTag } from './presentation.jsx'

const { Paragraph, Text, Title } = Typography

export function resolveMenuItemPresentation(itemKey) {
  const normalizedKey = String(itemKey || '').trim()
  const item =
    getBusinessModule(normalizedKey) || navigationItemRegistry[normalizedKey]

  return {
    key: normalizedKey,
    label: item?.label || '未识别菜单项',
  }
}

export function MenuPreviewItem({ itemKey }) {
  const item = resolveMenuItemPresentation(itemKey)

  return (
    <div className="erp-dev-customer-menu-item">
      <Text strong>{item.label}</Text>
      <code>{item.key}</code>
    </div>
  )
}

export function AssetsPanel({
  menuSummary,
  fieldNumberingSummary,
  printTemplateSummary,
}) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="菜单字段"
    >
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-panel--brand">
        <div className="erp-dev-customer-brand-mark">
          {menuSummary.brand.brandMark || '客'}
        </div>
        <div>
          <Title level={2}>{menuSummary.brand.companyName}</Title>
          <Paragraph>{menuSummary.brand.systemName}</Paragraph>
          <Space wrap>
            <StatusTag status={menuSummary.runtimeStatus} />
            <Tag>{menuSummary.sourceLabel || '来源已登记'}</Tag>
          </Space>
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <ApartmentOutlined aria-hidden="true" />
          <div>
            <Text strong>菜单分组</Text>
            <Text type="secondary" className="erp-dev-customer-panel__hint">
              先看业务名称；展开后可查看对应内部键。
            </Text>
          </div>
        </div>
        <div className="erp-dev-customer-menu-groups">
          {menuSummary.sections.map((section) => (
            <details
              className="erp-dev-disclosure erp-dev-customer-menu-group"
              key={section.title}
              open
            >
              <summary className="erp-dev-customer-menu-group__title">
                <span>
                  <Text strong>{section.title}</Text>
                  <Text type="secondary">{section.items.length} 个页面</Text>
                </span>
                <span className="erp-dev-customer-menu-group__toggle">
                  <span className="erp-dev-customer-menu-group__open-label">
                    展开
                  </span>
                  <span className="erp-dev-customer-menu-group__close-label">
                    收起
                  </span>
                </span>
              </summary>
              <div className="erp-dev-customer-menu-group__items">
                {section.items.map((item) => (
                  <MenuPreviewItem itemKey={item} key={item} />
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
      <details
        className="erp-dev-disclosure erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-disclosure"
      >
        <summary className="erp-dev-customer-panel__head erp-dev-customer-disclosure__summary">
          <SafetyCertificateOutlined aria-hidden="true" />
          <div>
            <Text strong>页面配置边界</Text>
            <Text type="secondary" className="erp-dev-customer-panel__hint">
              {fieldNumberingSummary.boundaries.length} 项保护规则，点击查看
            </Text>
          </div>
        </summary>
        <div className="erp-dev-customer-disclosure__body">
          <div className="erp-dev-customer-guard-list">
            {fieldNumberingSummary.boundaries.map((item) => (
              <div className="erp-dev-customer-guard" key={item.key}>
                <Text>{guardItemLabel(item, '字段编号边界')}</Text>
                <Tag color={item.ok ? 'green' : 'red'}>
                  {item.ok ? item.expectedLabel : item.valueLabel}
                </Tag>
              </div>
            ))}
          </div>
        </div>
      </details>
      <details
        className="erp-dev-disclosure erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-disclosure"
        open
      >
        <summary className="erp-dev-customer-panel__head erp-dev-customer-disclosure__summary">
          <SettingOutlined aria-hidden="true" />
          <div>
            <Text strong>字段显示候选</Text>
            <Text type="secondary" className="erp-dev-customer-panel__hint">
              {fieldNumberingSummary.fieldCandidates.length}{' '}
              个候选字段，点击查看
            </Text>
          </div>
        </summary>
        <div className="erp-dev-customer-disclosure__body">
          <div className="erp-dev-customer-field-list">
            {fieldNumberingSummary.fieldCandidates.map((candidate) => (
              <article
                className="erp-dev-customer-field"
                key={`${candidate.module}:${candidate.key}`}
              >
                <div className="erp-dev-customer-field__head">
                  <Text strong>{candidate.label}</Text>
                  <Tag>{candidate.moduleLabel}</Tag>
                  <StatusTag status={candidate.decisionLabel} />
                </div>
                <Text className="erp-dev-customer-field__key">
                  {candidate.fieldKeyLabel} / {candidate.sourceLabel}
                </Text>
                <Paragraph>{candidate.note}</Paragraph>
              </article>
            ))}
          </div>
        </div>
      </details>
      <details
        className="erp-dev-disclosure erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-disclosure"
        open
      >
        <summary className="erp-dev-customer-panel__head erp-dev-customer-disclosure__summary">
          <CodeOutlined aria-hidden="true" />
          <div>
            <Text strong>编号规则候选</Text>
            <Text type="secondary" className="erp-dev-customer-panel__hint">
              {fieldNumberingSummary.numberingRules.length}{' '}
              项待确认规则，点击查看
            </Text>
          </div>
        </summary>
        <div className="erp-dev-customer-disclosure__body">
          <div className="erp-dev-customer-numbering-list">
            {fieldNumberingSummary.numberingRules.map((rule) => (
              <article className="erp-dev-customer-numbering" key={rule.key}>
                <div>
                  <Text strong>{rule.label}</Text>
                  <Text type="secondary">{rule.domain}</Text>
                </div>
                <StatusTag status={rule.decisionLabel} />
                <Paragraph>{rule.unresolvedQuestion}</Paragraph>
              </article>
            ))}
          </div>
        </div>
      </details>
      <details
        className="erp-dev-disclosure erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-panel--print-templates erp-dev-customer-disclosure"
        open
      >
        <summary className="erp-dev-customer-panel__head erp-dev-customer-disclosure__summary">
          <FileTextOutlined aria-hidden="true" />
          <div>
            <Text strong>打印模板字段</Text>
            <Text type="secondary" className="erp-dev-customer-panel__hint">
              {printTemplateSummary.templates.length} 套模板，点击查看字段真源
            </Text>
          </div>
        </summary>
        <div className="erp-dev-customer-disclosure__body">
          <Alert
            type="info"
            showIcon
            message="当前展示合同和工程资料打印模板字段真源"
            description="销售订单受理当前未接打印模板；客户抬头、签章和固定文案应留在客户配置或模板边界，不进入产品核心表单。"
          />
          <div className="erp-dev-customer-tool-list">
            {printTemplateSummary.templates.map((template) => (
              <article className="erp-dev-customer-tool" key={template.key}>
                <div className="erp-dev-customer-tool__head">
                  <Space wrap>
                    <Text strong>{template.title}</Text>
                    <Tag>{template.templateKeyLabel}</Tag>
                    <Tag>{template.fieldTruthCountLabel}</Tag>
                    <Tag>{template.fieldRequirementCountLabel}</Tag>
                    <Tag>{template.factBoundaryLabel}</Tag>
                  </Space>
                  <StatusTag status={template.readiness} />
                </div>
                <Text type="secondary">{template.category}</Text>
                <div className="erp-dev-customer-field-list">
                  {template.fieldTruth.map((truth) => (
                    <Text key={truth}>{truth}</Text>
                  ))}
                </div>
                <div className="erp-dev-customer-tool-list mt-3">
                  {template.fieldRequirementItems.map((requirement) => (
                    <div
                      className="erp-dev-customer-asset"
                      key={`${template.key}-${requirement.label}`}
                    >
                      <Space wrap>
                        <Text strong>{requirement.label}</Text>
                        <Tag>{requirement.requirementKeyLabel}</Tag>
                      </Space>
                      <Text type="secondary">{requirement.sourceLabel}</Text>
                      <Paragraph>{requirement.boundary}</Paragraph>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}
