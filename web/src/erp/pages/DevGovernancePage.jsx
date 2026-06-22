import React, { useMemo, useState } from 'react'
import {
  ApartmentOutlined,
  BranchesOutlined,
  CopyOutlined,
  FileMarkdownOutlined,
  LinkOutlined,
  PartitionOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Space, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import { message } from '@/common/utils/antdApp'
import {
  DEV_GOVERNANCE_SOURCE_PATH,
  buildGovernanceSummary,
  extractGovernanceMermaid,
  filterGovernanceTasks,
  getRelatedGovernanceTasks,
  parseGovernanceAxes,
  parseGovernanceTaskRoutes,
} from '../config/devGovernance.mjs'

const { Paragraph, Text, Title } = Typography

const governanceSource = import.meta.glob('../../../../docs/项目治理地图.md', {
  eager: true,
  import: 'default',
  query: '?raw',
})

function getGovernanceSource() {
  return (
    governanceSource['../../../../docs/项目治理地图.md'] ||
    Object.values(governanceSource)[0] ||
    ''
  )
}

function copyText(text = '', successText = '已复制') {
  const value = String(text || '').trim()
  if (!value) {
    message.warning('没有可复制内容')
    return
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    message.warning('当前浏览器不支持复制')
    return
  }
  navigator.clipboard
    .writeText(value)
    .then(() => message.success(successText))
    .catch(() => message.error('复制失败，请手动选择内容'))
}

function Metric({ label, value, note }) {
  return (
    <div className="erp-dev-governance-metric">
      <span className="erp-dev-governance-metric__label">{label}</span>
      <span className="erp-dev-governance-metric__value">{value}</span>
      <span className="erp-dev-governance-metric__note">{note}</span>
    </div>
  )
}

function SourceLinks({ links = [] }) {
  if (!links.length) {
    return <Text type="secondary">回到治理地图 Markdown 阅读。</Text>
  }

  return (
    <div className="erp-dev-governance-links">
      {links.map((link) => (
        <span className="erp-dev-governance-link" key={link.copyPath}>
          {link.devDocsHref ? (
            <Link to={link.devDocsHref} target="_blank" rel="noreferrer">
              <LinkOutlined />
              <span>{link.label}</span>
            </Link>
          ) : (
            <span>
              <FileMarkdownOutlined />
              <span>{link.label}</span>
            </span>
          )}
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            aria-label={`复制 ${link.copyPath}`}
            onClick={() => copyText(link.copyPath, '已复制文档路径')}
          />
        </span>
      ))}
    </div>
  )
}

function AxisNav({ axes = [], selectedKey = '', onSelect }) {
  return (
    <nav
      className="erp-dev-governance-axis-nav"
      aria-label="治理维度与口径导航"
    >
      {axes.map((axis) => (
        <button
          key={axis.key}
          type="button"
          className={
            axis.key === selectedKey
              ? 'erp-dev-governance-axis-nav__item erp-dev-governance-axis-nav__item--active'
              : 'erp-dev-governance-axis-nav__item'
          }
          onClick={() => onSelect(axis.key)}
        >
          <span className="erp-dev-governance-axis-nav__title">
            {axis.axis}
          </span>
          <span className="erp-dev-governance-axis-nav__meta">
            {axis.sourcesLinks?.length || 0} 个真源链接
          </span>
        </button>
      ))}
    </nav>
  )
}

function AxisDetail({ axis }) {
  if (!axis) {
    return (
      <div className="erp-dev-governance-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="没有治理维度与口径"
        />
      </div>
    )
  }

  return (
    <section className="erp-dev-governance-axis-detail">
      <div className="erp-dev-governance-axis-detail__head">
        <div>
          <Text className="erp-dev-governance-eyebrow">当前治理维度与口径</Text>
          <Title level={3}>{axis.axis}</Title>
        </div>
        <Tag color="green">Markdown 派生</Tag>
      </div>

      <div className="erp-dev-governance-answer-grid">
        <article>
          <Text strong>回答什么</Text>
          <p>{axis.question}</p>
        </article>
        <article>
          <Text strong>不要混成</Text>
          <p>{axis.boundary}</p>
        </article>
      </div>

      <div className="erp-dev-governance-source-panel">
        <Text strong>先看哪里</Text>
        <SourceLinks links={axis.sourcesLinks} />
      </div>
    </section>
  )
}

function TaskCard({ task }) {
  return (
    <article className="erp-dev-governance-task">
      <div className="erp-dev-governance-task__head">
        <Text strong>{task.task}</Text>
        <Tag>分流</Tag>
      </div>
      <div className="erp-dev-governance-task__section">
        <Text className="erp-dev-governance-task__label">第一跳</Text>
        <SourceLinks links={task.firstHopLinks} />
      </div>
      <div className="erp-dev-governance-task__section">
        <Text className="erp-dev-governance-task__label">必须同步检查</Text>
        <p>{task.syncCheck}</p>
        <SourceLinks links={task.syncCheckLinks} />
      </div>
    </article>
  )
}

export default function DevGovernancePage() {
  const source = useMemo(() => getGovernanceSource(), [])
  const axes = useMemo(() => parseGovernanceAxes(source), [source])
  const tasks = useMemo(() => parseGovernanceTaskRoutes(source), [source])
  const mermaid = useMemo(() => extractGovernanceMermaid(source), [source])
  const summary = useMemo(
    () => buildGovernanceSummary({ axes, tasks, mermaid }),
    [axes, mermaid, tasks]
  )
  const [selectedAxisKey, setSelectedAxisKey] = useState(
    () => axes[0]?.key || ''
  )
  const [taskKeyword, setTaskKeyword] = useState('')
  const [taskScopeMode, setTaskScopeMode] = useState('related')
  const selectedAxis =
    axes.find((axis) => axis.key === selectedAxisKey) || axes[0]
  const relatedTasks = useMemo(
    () => getRelatedGovernanceTasks(tasks, selectedAxis),
    [selectedAxis, tasks]
  )
  const scopedTasks =
    taskScopeMode === 'all' || relatedTasks.length === 0 ? tasks : relatedTasks
  const filteredTasks = useMemo(
    () => filterGovernanceTasks(scopedTasks, taskKeyword),
    [scopedTasks, taskKeyword]
  )
  const visibleTaskScope =
    taskScopeMode === 'all' || relatedTasks.length === 0 ? 'all' : 'related'
  const handleSelectAxis = (axisKey) => {
    setSelectedAxisKey(axisKey)
    setTaskScopeMode('related')
  }

  return (
    <div className="erp-dev-governance-page">
      <header className="erp-dev-governance-header">
        <div className="erp-dev-governance-header__copy">
          <Space align="center" size={10} wrap>
            <PartitionOutlined className="erp-dev-governance-header__icon" />
            <Title level={3} className="erp-dev-governance-title">
              项目治理地图 / Governance Map
            </Title>
            <Tag color="green">DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-governance-summary">
            从 {DEV_GOVERNANCE_SOURCE_PATH}{' '}
            只读派生；用于跳转、分类、阅读和复制路径，
            不新增规则真源、后端、数据库、RBAC 或正式菜单。
          </Paragraph>
        </div>
        <div className="erp-dev-governance-header__metrics">
          <Metric
            label="治理维度"
            value={summary.axisCount}
            note="来自速查表"
          />
          <Metric
            label="任务分流"
            value={summary.taskCount}
            note="来自分流表"
          />
          <Metric
            label="文档链接"
            value={summary.sourceCount}
            note="可复制路径"
          />
        </div>
      </header>

      <main className="erp-dev-governance-shell">
        <aside className="erp-dev-governance-sidebar">
          <div className="erp-dev-governance-source-card">
            <Text strong>维护真源 / Source</Text>
            <code>{DEV_GOVERNANCE_SOURCE_PATH}</code>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() =>
                copyText(DEV_GOVERNANCE_SOURCE_PATH, '已复制治理地图路径')
              }
            >
              复制路径
            </Button>
          </div>
          <AxisNav
            axes={axes}
            selectedKey={selectedAxis?.key}
            onSelect={handleSelectAxis}
          />
        </aside>

        <section className="erp-dev-governance-main">
          <AxisDetail axis={selectedAxis} />

          <section className="erp-dev-governance-section">
            <div className="erp-dev-governance-section__head">
              <div className="erp-dev-governance-section__title">
                <Space size={8}>
                  <BranchesOutlined />
                  <Text strong>相关任务分流 / Related Task Routing</Text>
                </Space>
                <Text type="secondary">
                  {visibleTaskScope === 'related'
                    ? `当前维度：${selectedAxis?.axis || '未选择'}，匹配 ${
                        filteredTasks.length
                      } / ${relatedTasks.length}`
                    : `全部任务：匹配 ${filteredTasks.length} / ${tasks.length}`}
                </Text>
              </div>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                value={taskKeyword}
                placeholder="搜索任务、第一跳或同步检查"
                onChange={(event) => setTaskKeyword(event.target.value)}
              />
            </div>
            <div className="erp-dev-governance-task-scope">
              <Tag color={visibleTaskScope === 'related' ? 'blue' : 'default'}>
                {visibleTaskScope === 'related'
                  ? '当前治理维度与口径'
                  : '全部 Markdown 分流'}
              </Tag>
              {relatedTasks.length > 0 ? (
                <Button
                  size="small"
                  onClick={() =>
                    setTaskScopeMode((mode) =>
                      mode === 'all' ? 'related' : 'all'
                    )
                  }
                >
                  {taskScopeMode === 'all' ? '只看相关' : '查看全部'}
                </Button>
              ) : null}
            </div>
            {filteredTasks.length > 0 ? (
              <div className="erp-dev-governance-task-grid">
                {filteredTasks.map((task) => (
                  <TaskCard key={task.key} task={task} />
                ))}
              </div>
            ) : (
              <div className="erp-dev-governance-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="没有匹配任务"
                />
              </div>
            )}
          </section>

          {mermaid ? (
            <section className="erp-dev-governance-section">
              <div className="erp-dev-governance-section__head">
                <Space size={8}>
                  <ApartmentOutlined />
                  <Text strong>项目治理分流图 / Governance Routing</Text>
                </Space>
                <Tag>全局 Mermaid from Markdown</Tag>
              </div>
              <div className="erp-dev-governance-mermaid erp-dev-docs-markdown">
                <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
              </div>
            </section>
          ) : null}
        </section>
      </main>
    </div>
  )
}
