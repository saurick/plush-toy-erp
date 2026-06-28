import React, { useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Segmented, Space, Tag, Typography } from 'antd'
import { message } from '@/common/utils/antdApp'
import {
  DEV_TESTING_COPY_PRESETS,
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  buildDevTestingDocs,
  buildDevTestingSummary,
  filterDevTestingDocs,
  getDevTestingCategoryOptions,
  parseDevTestingStrategyTiers,
} from '../config/devTesting.mjs'

const { Paragraph, Text, Title } = Typography

const VIEW_TIERS = 'tiers'
const VIEW_COMMANDS = 'commands'
const VIEW_DOCS = 'docs'

const VIEW_OPTIONS = [
  { label: '测试分层 / Tiers', value: VIEW_TIERS },
  { label: '命令入口 / Commands', value: VIEW_COMMANDS },
  { label: '相关文档 / Docs', value: VIEW_DOCS },
]

const markdownModules = import.meta.glob(
  [
    '../../../../README.md',
    '../../../../docs/product/自动化测试策略.md',
    '../../../../docs/部署约定.md',
    '../../../../server/README.md',
    '../../../../server/deploy/README.md',
    '../../../../server/deploy/compose/prod/README.md',
    '../../../../scripts/README.md',
    '../../../../web/README.md',
  ],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
)

function MetricTile({ icon, label, value, note, tone = 'default' }) {
  return (
    <div className={`erp-dev-testing-metric erp-dev-testing-metric--${tone}`}>
      <span className="erp-dev-testing-metric__icon">{icon}</span>
      <span className="erp-dev-testing-metric__copy">
        <span className="erp-dev-testing-metric__label">{label}</span>
        <span className="erp-dev-testing-metric__value">{value}</span>
        <span className="erp-dev-testing-metric__note">{note}</span>
      </span>
    </div>
  )
}

function runCopy(text) {
  if (!String(text || '').trim()) {
    message.warning('当前层级没有可复制命令')
    return
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    message.warning('当前浏览器不支持复制')
    return
  }
  navigator.clipboard
    .writeText(text)
    .then(() => message.success('命令已复制'))
    .catch(() => message.error('复制失败，请手动选择命令'))
}

function TierCard({ tier }) {
  const hasCopyText = Boolean(tier.copyText)

  return (
    <article className="erp-dev-testing-tier">
      <div className="erp-dev-testing-tier__head">
        <div className="erp-dev-testing-tier__identity">
          <span className="erp-dev-testing-tier__level">{tier.key}</span>
          <span className="erp-dev-testing-tier__title">{tier.level}</span>
        </div>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!hasCopyText}
          onClick={() => runCopy(tier.copyText)}
        >
          复制
        </Button>
      </div>
      <div className="erp-dev-testing-tier__type">{tier.changeType}</div>
      <p className="erp-dev-testing-tier__desc">{tier.description}</p>
      <div className="erp-dev-testing-command-tags">
        {tier.copyCommands.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
    </article>
  )
}

function QuickPreset({ preset }) {
  return (
    <button
      type="button"
      className="erp-dev-testing-preset"
      onClick={() => runCopy(preset.commands.join('\n'))}
    >
      <span className="erp-dev-testing-preset__head">
        <span className="erp-dev-testing-preset__label">{preset.label}</span>
        <CopyOutlined />
      </span>
      <span className="erp-dev-testing-preset__desc">{preset.description}</span>
    </button>
  )
}

function CommandBlock({ block }) {
  return (
    <article className="erp-dev-testing-command-block">
      <div className="erp-dev-testing-command-block__head">
        <div>
          <Text strong>{block.context || block.title}</Text>
          <div className="erp-dev-testing-command-block__path">
            {block.sourcePath}
          </div>
        </div>
        <Button
          size="small"
          icon={<CodeOutlined />}
          onClick={() => runCopy(block.commandText)}
        >
          复制
        </Button>
      </div>
      <pre>
        <code>{block.commandText}</code>
      </pre>
    </article>
  )
}

function TestingDocRow({ doc, active, onSelect }) {
  return (
    <button
      type="button"
      className={
        active
          ? 'erp-dev-testing-doc-row erp-dev-testing-doc-row--active'
          : 'erp-dev-testing-doc-row'
      }
      onClick={() => onSelect(doc.key)}
    >
      <span className="erp-dev-testing-doc-row__top">
        <span className="erp-dev-testing-doc-row__title">{doc.title}</span>
        <Tag>{doc.category}</Tag>
      </span>
      <span className="erp-dev-testing-doc-row__path">{doc.path}</span>
      <span className="erp-dev-testing-doc-row__meta">
        命令 {doc.commandCount} / 命中 {doc.keywordHits}
      </span>
    </button>
  )
}

function SelectedDocDetail({ doc }) {
  if (!doc) {
    return (
      <div className="erp-dev-testing-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="没有匹配文档 / No matching docs"
        />
      </div>
    )
  }

  return (
    <section className="erp-dev-testing-doc-detail">
      <div className="erp-dev-testing-doc-detail__head">
        <div>
          <Title level={4}>{doc.title}</Title>
          <Text className="erp-dev-testing-doc-detail__path">{doc.path}</Text>
        </div>
        <Tag>{doc.category}</Tag>
      </div>
      <div className="erp-dev-testing-doc-detail__stats">
        <span>关键词命中 / Hits {doc.keywordHits}</span>
        <span>命令 / Commands {doc.commandCount}</span>
        <span>
          {doc.path === DEV_TESTING_STRATEGY_SOURCE_PATH
            ? '策略真源 / Strategy source'
            : '测试相关 / Test related'}
        </span>
      </div>
      {doc.commandBlocks.length > 0 ? (
        <div className="erp-dev-testing-command-list">
          {doc.commandBlocks.map((block) => (
            <CommandBlock key={block.key} block={block} />
          ))}
        </div>
      ) : (
        <Paragraph className="erp-dev-testing-doc-detail__note">
          该文档没有 fenced command block / no fenced command
          block；更多验证口径请回到正文阅读。
        </Paragraph>
      )}
    </section>
  )
}

export default function DevTestingPage() {
  const docs = useMemo(() => buildDevTestingDocs(markdownModules), [])
  const strategySource =
    docs.find((item) => item.path === DEV_TESTING_STRATEGY_SOURCE_PATH)
      ?.source || ''
  const tiers = useMemo(
    () => parseDevTestingStrategyTiers(strategySource),
    [strategySource]
  )
  const summary = useMemo(
    () => buildDevTestingSummary({ tiers, docs }),
    [docs, tiers]
  )
  const categoryOptions = useMemo(
    () => getDevTestingCategoryOptions(docs),
    [docs]
  )
  const [view, setView] = useState(VIEW_TIERS)
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('all')
  const filteredDocs = useMemo(
    () => filterDevTestingDocs(docs, { keyword, category }),
    [category, docs, keyword]
  )
  const [selectedKey, setSelectedKey] = useState(() => docs[0]?.key || '')
  const selectedDoc =
    filteredDocs.find((item) => item.key === selectedKey) ||
    filteredDocs[0] ||
    docs[0]
  const allCommandBlocks = filteredDocs.flatMap((doc) => doc.commandBlocks)

  return (
    <div className="erp-dev-testing-page">
      <header className="erp-dev-testing-header">
        <div className="erp-dev-testing-header__copy">
          <Space align="center" size={10}>
            <SafetyCertificateOutlined className="erp-dev-testing-header__icon" />
            <Title level={3} className="erp-dev-testing-title">
              开发测试入口 / Dev Test Entry
            </Title>
          </Space>
          <Paragraph className="erp-dev-testing-summary">
            读取当前测试策略、QA 脚本和部署 / 前后端说明；index current
            validation tiers and executable command references.
          </Paragraph>
        </div>
        <div className="erp-dev-testing-header__stats">
          <MetricTile
            icon={<CheckCircleOutlined />}
            label="测试层级 / Tiers"
            value={summary.tierCount}
            note="来自自动化测试策略"
            tone="primary"
          />
          <MetricTile
            icon={<FileSearchOutlined />}
            label="相关文档 / Docs"
            value={summary.docCount}
            note={`${summary.docsWithCommands} 篇含命令`}
          />
          <MetricTile
            icon={<CodeOutlined />}
            label="命令行 / Commands"
            value={summary.commandCount}
            note={`${summary.strategyCommandCount} 条来自策略`}
          />
        </div>
      </header>

      <main className="erp-dev-testing-shell">
        <aside className="erp-dev-testing-sidebar">
          <Input.Search
            allowClear
            className="erp-dev-testing-search"
            placeholder="搜索文档、命令、验收词"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <div className="erp-dev-testing-filter" aria-label="文档分类筛选">
            {categoryOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={
                  option.value === category
                    ? 'erp-dev-testing-filter__item erp-dev-testing-filter__item--active'
                    : 'erp-dev-testing-filter__item'
                }
                onClick={() => setCategory(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="erp-dev-testing-doc-list" aria-label="测试相关文档">
            {filteredDocs.map((doc) => (
              <TestingDocRow
                key={doc.key}
                doc={doc}
                active={doc.key === selectedDoc?.key}
                onSelect={setSelectedKey}
              />
            ))}
          </div>
        </aside>

        <section className="erp-dev-testing-reader">
          <div className="erp-dev-testing-reader__toolbar">
            <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} />
            <Text type="secondary">
              {selectedDoc?.path || DEV_TESTING_STRATEGY_SOURCE_PATH}
            </Text>
          </div>

          {view === VIEW_TIERS ? (
            <div className="erp-dev-testing-tier-view">
              <div
                className="erp-dev-testing-presets"
                aria-label="常用测试命令预设"
              >
                {DEV_TESTING_COPY_PRESETS.map((preset) => (
                  <QuickPreset key={preset.key} preset={preset} />
                ))}
              </div>
              <div className="erp-dev-testing-tier-grid">
                {tiers.map((tier) => (
                  <TierCard key={tier.key} tier={tier} />
                ))}
              </div>
            </div>
          ) : null}

          {view === VIEW_COMMANDS ? (
            <div className="erp-dev-testing-command-list">
              {allCommandBlocks.length > 0 ? (
                allCommandBlocks.map((block) => (
                  <CommandBlock key={block.key} block={block} />
                ))
              ) : (
                <div className="erp-dev-testing-empty">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="当前筛选没有命令块 / No command blocks"
                  />
                </div>
              )}
            </div>
          ) : null}

          {view === VIEW_DOCS ? <SelectedDocDetail doc={selectedDoc} /> : null}
        </section>
      </main>
    </div>
  )
}
