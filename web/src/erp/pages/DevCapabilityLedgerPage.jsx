import React from 'react'
import {
  ArrowRightOutlined,
  DatabaseOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { Space, Tag, Typography } from 'antd'
import {
  DEV_CAPABILITY_SOURCE_ITEMS,
  buildDevCapabilityDocsHref,
} from '../config/devCapabilityLedger.mjs'
import DevPageNav from '../components/dev/DevPageNav.jsx'

const { Paragraph, Text, Title } = Typography

const SOURCE_ICON_BY_KEY = {
  'product-capability': <DatabaseOutlined aria-hidden="true" />,
  'yoyoosun-customer-matrix': <TeamOutlined aria-hidden="true" />,
}

function CapabilitySourceCard({ source }) {
  return (
    <article
      className="erp-dev-capability-source-card"
      data-dev-capability-source={source.key}
    >
      <div className="erp-dev-capability-source-card__meta">
        <span className="erp-dev-capability-source-card__icon">
          {SOURCE_ICON_BY_KEY[source.key]}
        </span>
        <Tag color={source.key === 'product-capability' ? 'green' : 'blue'}>
          {source.kind}
        </Tag>
      </div>

      <Title level={2} className="erp-dev-capability-source-card__title">
        {source.title}
      </Title>
      <Paragraph className="erp-dev-capability-source-card__summary">
        {source.description}
      </Paragraph>

      <div className="erp-dev-capability-source-card__questions">
        <Text strong>用它回答</Text>
        <ul>
          {source.questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>

      <Text className="erp-dev-capability-source-card__boundary">
        边界：{source.boundary}
      </Text>

      <Link
        className="erp-dev-capability-source-card__link"
        aria-label={`打开正式文档：${source.title}`}
        to={buildDevCapabilityDocsHref(source.sourcePath)}
      >
        <span>查看正式文档</span>
        <ArrowRightOutlined aria-hidden="true" />
      </Link>
    </article>
  )
}

export default function DevCapabilityLedgerPage() {
  return (
    <div className="erp-dev-capability-page erp-dev-workspace-page">
      <DevPageNav />

      <header className="erp-dev-capability-header">
        <div className="erp-dev-capability-header__copy">
          <Space align="center" size={10} wrap>
            <DatabaseOutlined className="erp-dev-capability-header__icon" />
            <Title level={1} className="erp-dev-capability-title">
              能力真源入口 / Capability Sources
            </Title>
            <Tag color="green">仅开发环境 / DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-capability-summary">
            这里只负责带你找到两份正式真源，不复制台账内容，也不计算第二套状态。
          </Paragraph>
        </div>

        <div className="erp-dev-capability-boundary">
          <Text strong>本页不维护状态</Text>
          <Text type="secondary">不计算成熟度 · 不复制证据 · 不替代验收</Text>
        </div>
      </header>

      <main
        className="erp-dev-capability-source-grid"
        aria-label="产品能力与客户能力正式真源"
      >
        {DEV_CAPABILITY_SOURCE_ITEMS.map((source) => (
          <CapabilitySourceCard key={source.key} source={source} />
        ))}
      </main>

      <section
        className="erp-dev-capability-reading-order"
        aria-labelledby="capability-reading-order-title"
      >
        <Text strong id="capability-reading-order-title">
          阅读顺序
        </Text>
        <Text>
          先看产品能力是否成立，再看当前客户是否可见、可试用或已验收；需要实现证据时继续进入专题文档、代码、migration 和测试。
        </Text>
      </section>
    </div>
  )
}
