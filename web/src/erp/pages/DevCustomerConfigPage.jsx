import React, { useMemo, useState } from 'react'
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Segmented, Space, Tag, Tooltip, Typography } from 'antd'
import { message } from '@/common/utils/antdApp'
import { buildCustomerConfigDevOverview } from '../config/devCustomerConfig.mjs'

const { Paragraph, Text, Title } = Typography

const VIEW_OVERVIEW = 'overview'
const VIEW_MENU = 'menu'
const VIEW_FIELDS = 'fields'
const VIEW_IMPORT = 'import'

const VIEW_OPTIONS = [
  { label: '总览', value: VIEW_OVERVIEW },
  { label: '菜单品牌', value: VIEW_MENU },
  { label: '字段编号', value: VIEW_FIELDS },
  { label: '导入工具', value: VIEW_IMPORT },
]

function StatusTag({ status }) {
  const colorByStatus = {
    已接前端运行时: 'green',
    草案: 'gold',
    未批准: 'red',
    禁止误接: 'red',
    runtime_frontend_only: 'green',
    evidence_only: 'blue',
    preview_only: 'cyan',
    report_gate_only: 'purple',
    待客户确认: 'gold',
    暂不接运行时: 'orange',
    后续评审: 'default',
  }
  return <Tag color={colorByStatus[status] || 'default'}>{status}</Tag>
}

function MetricTile({ icon, label, value, note, tone = 'default' }) {
  return (
    <div className={`erp-dev-customer-metric erp-dev-customer-metric--${tone}`}>
      <span className="erp-dev-customer-metric__icon">{icon}</span>
      <span className="erp-dev-customer-metric__copy">
        <span className="erp-dev-customer-metric__label">{label}</span>
        <span className="erp-dev-customer-metric__value">{value}</span>
        <span className="erp-dev-customer-metric__note">{note}</span>
      </span>
    </div>
  )
}

function BoundaryList({ items = [] }) {
  return (
    <div className="erp-dev-customer-boundaries">
      {items.map((item) => (
        <article className="erp-dev-customer-boundary" key={item.key}>
          <div className="erp-dev-customer-boundary__head">
            <Text strong>{item.title}</Text>
            <StatusTag status={item.status} />
          </div>
          <Text className="erp-dev-customer-boundary__path">
            {item.sourcePath}
          </Text>
          <Paragraph className="erp-dev-customer-boundary__body">
            {item.boundary}
          </Paragraph>
        </article>
      ))}
    </div>
  )
}

function copyText(value) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    message.info('当前浏览器不支持直接复制')
    return
  }
  navigator.clipboard
    .writeText(value)
    .then(() => message.success('已复制命令'))
    .catch(() => message.error('复制失败，请手动选择命令'))
}

function CommandBlock({ command }) {
  return (
    <div className="erp-dev-customer-command">
      <code>{command}</code>
      <Tooltip title="复制命令">
        <Button
          type="text"
          icon={<CopyOutlined />}
          aria-label="复制命令"
          onClick={() => copyText(command)}
        />
      </Tooltip>
    </div>
  )
}

function OverviewPanel({ overview }) {
  return (
    <div className="erp-dev-customer-panel-grid" data-dev-customer-view="总览">
      <section className="erp-dev-customer-panel">
        <div className="erp-dev-customer-panel__head">
          <CheckCircleOutlined />
          <Text strong>已接运行时</Text>
        </div>
        <BoundaryList items={overview.runtimePieces} />
      </section>
      <section className="erp-dev-customer-panel">
        <div className="erp-dev-customer-panel__head">
          <SettingOutlined />
          <Text strong>仍是草案</Text>
        </div>
        <BoundaryList items={overview.draftPieces} />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <ExclamationCircleOutlined />
          <Text strong>禁止误读</Text>
        </div>
        <BoundaryList items={overview.blockedPieces} />
      </section>
    </div>
  )
}

function MenuPanel({ menuSummary }) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="菜单品牌"
    >
      <section className="erp-dev-customer-panel erp-dev-customer-panel--brand">
        <div className="erp-dev-customer-brand-mark">
          {menuSummary.brand.brandMark || menuSummary.customerKey.slice(0, 1)}
        </div>
        <div>
          <Title level={2}>{menuSummary.brand.companyName}</Title>
          <Paragraph>{menuSummary.brand.systemName}</Paragraph>
          <Space wrap>
            <StatusTag status={menuSummary.runtimeStatus} />
            <Tag>{menuSummary.sourcePath}</Tag>
          </Space>
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <ApartmentOutlined />
          <Text strong>桌面菜单分组</Text>
        </div>
        <div className="erp-dev-customer-menu-groups">
          {menuSummary.sections.map((section) => (
            <article
              className="erp-dev-customer-menu-group"
              key={section.title}
            >
              <div className="erp-dev-customer-menu-group__title">
                <Text strong>{section.title}</Text>
                <Tag>{section.items.length}</Tag>
              </div>
              <div className="erp-dev-customer-menu-group__items">
                {section.items.map((item) => (
                  <Tag key={item}>{item}</Tag>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function FieldsPanel({ fieldNumberingSummary }) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="字段编号"
    >
      <section className="erp-dev-customer-panel">
        <div className="erp-dev-customer-panel__head">
          <SafetyCertificateOutlined />
          <Text strong>边界守卫</Text>
        </div>
        <div className="erp-dev-customer-guard-list">
          {fieldNumberingSummary.boundaries.map((item) => (
            <div className="erp-dev-customer-guard" key={item.key}>
              <Text>{item.key}</Text>
              <Tag color={item.ok ? 'green' : 'red'}>
                {item.ok ? 'false / ok' : String(item.value)}
              </Tag>
            </div>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <SettingOutlined />
          <Text strong>字段显示候选</Text>
        </div>
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
                {candidate.key} / {candidate.source}
              </Text>
              <Paragraph>{candidate.note}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CodeOutlined />
          <Text strong>编号规则候选</Text>
        </div>
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
      </section>
    </div>
  )
}

function ImportPanel({ importSummary }) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="导入工具"
    >
      <section className="erp-dev-customer-panel">
        <div className="erp-dev-customer-panel__head">
          <DatabaseOutlined />
          <Text strong>执行边界</Text>
        </div>
        <div className="erp-dev-customer-import-flags">
          <div>
            <Text type="secondary">canExecuteRealImport</Text>
            <Tag color="red">{String(importSummary.canExecuteRealImport)}</Tag>
          </div>
          <div>
            <Text type="secondary">writesDatabase</Text>
            <Tag color="red">{String(importSummary.writesDatabase)}</Tag>
          </div>
        </div>
        <CommandBlock command={importSummary.qaCommand} />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>工具命令</Text>
        </div>
        <div className="erp-dev-customer-tool-list">
          {importSummary.tools.map((tool) => (
            <article className="erp-dev-customer-tool" key={tool.key}>
              <div className="erp-dev-customer-tool__head">
                <Text strong>{tool.title}</Text>
                <StatusTag status={tool.status} />
              </div>
              <CommandBlock command={tool.command} />
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function DevCustomerConfigPage() {
  const overview = useMemo(() => buildCustomerConfigDevOverview(), [])
  const [activeView, setActiveView] = useState(VIEW_OVERVIEW)

  const panel = {
    [VIEW_OVERVIEW]: <OverviewPanel overview={overview} />,
    [VIEW_MENU]: <MenuPanel menuSummary={overview.menuSummary} />,
    [VIEW_FIELDS]: (
      <FieldsPanel fieldNumberingSummary={overview.fieldNumberingSummary} />
    ),
    [VIEW_IMPORT]: <ImportPanel importSummary={overview.importSummary} />,
  }[activeView]

  return (
    <main className="erp-dev-customer-page">
      <header className="erp-dev-customer-header">
        <div className="erp-dev-customer-header__copy">
          <Space align="center" size={10}>
            <SettingOutlined className="erp-dev-customer-header__icon" />
            <Title className="erp-dev-customer-title" level={1}>
              客户配置开发总控
            </Title>
          </Space>
          <Paragraph className="erp-dev-customer-summary">
            只读查看 yoyoosun 客户配置包、菜单品牌
            runtime、字段编号草案和导入工具边界。
          </Paragraph>
          <Segmented
            className="erp-dev-customer-view-switch"
            options={VIEW_OPTIONS}
            value={activeView}
            onChange={setActiveView}
          />
        </div>
        <div className="erp-dev-customer-source">
          <Text type="secondary">当前客户 key</Text>
          <Text strong>{overview.customerKey}</Text>
          <Text type="secondary">{overview.sourcePath}</Text>
        </div>
      </header>

      <section className="erp-dev-customer-metrics" aria-label="客户配置摘要">
        <MetricTile
          icon={<ApartmentOutlined />}
          label="菜单分组"
          value={overview.menuSummary.sectionCount}
          note={`${overview.menuSummary.itemCount} 个菜单项，只控制前端展示`}
          tone="success"
        />
        <MetricTile
          icon={<SettingOutlined />}
          label="字段候选"
          value={overview.fieldNumberingSummary.fieldCandidateCount}
          note={`${overview.fieldNumberingSummary.fieldModuleCount} 个模块，仍待确认`}
          tone="warning"
        />
        <MetricTile
          icon={<CodeOutlined />}
          label="编号规则"
          value={overview.fieldNumberingSummary.numberingRuleCount}
          note="全部停留在 review / deferred"
        />
        <MetricTile
          icon={<DatabaseOutlined />}
          label="真实导入"
          value="blocked"
          note="只读 evidence / report gate，不写 DB"
          tone="danger"
        />
      </section>

      {panel}
    </main>
  )
}
