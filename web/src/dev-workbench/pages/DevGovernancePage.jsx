import React, { useEffect, useMemo } from 'react'
import {
  CheckCircleOutlined,
  CopyOutlined,
  FileMarkdownOutlined,
  LinkOutlined,
  PartitionOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Button, Empty, Space, Tag, Typography } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_GOVERNANCE_SOURCE_PATH,
  buildGovernanceSummary,
  extractGovernanceMermaid,
  parseGovernanceAxes,
  parseGovernanceTaskRoutes,
  parsePersonalDeliveryLoop,
} from '../config/devGovernance.mjs'

const { Paragraph, Text, Title } = Typography

const TASK_QUERY_KEY = 'task'
const LEGACY_QUERY_KEYS = ['axis', 'scope']

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

function SourceLinks({ links = [] }) {
  if (!links.length) {
    return null
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

function TaskNav({ tasks = [], selectedKey = '', onSelect }) {
  return (
    <nav className="erp-dev-governance-task-nav" aria-label="本轮改动类型">
      {tasks.map((task, index) => (
        <button
          key={task.key}
          type="button"
          className={
            task.key === selectedKey
              ? 'erp-dev-governance-task-nav__item erp-dev-governance-task-nav__item--active'
              : 'erp-dev-governance-task-nav__item'
          }
          aria-current={task.key === selectedKey ? 'page' : undefined}
          onClick={() => onSelect(task.key)}
        >
          <span
            className="erp-dev-governance-task-nav__index"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="erp-dev-governance-task-nav__title">
            {task.task}
          </span>
        </button>
      ))}
    </nav>
  )
}

function DecisionStep({ index, icon, title, tone, children }) {
  return (
    <section
      className={`erp-dev-governance-decision-step erp-dev-governance-decision-step--${tone}`}
    >
      <div
        className="erp-dev-governance-decision-step__marker"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="erp-dev-governance-decision-step__body">
        <Text className="erp-dev-governance-decision-step__eyebrow">
          第 {index} 步
        </Text>
        <Title level={3}>{title}</Title>
        {children}
      </div>
    </section>
  )
}

function TaskDecision({ task }) {
  if (!task) {
    return (
      <div className="erp-dev-governance-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="治理说明里还没有可用任务"
        />
      </div>
    )
  }

  return (
    <section
      className="erp-dev-governance-decision"
      aria-labelledby={`governance-task-${task.key}`}
    >
      <div className="erp-dev-governance-decision__head">
        <div>
          <Text className="erp-dev-governance-eyebrow">当前选择</Text>
          <Title level={2} id={`governance-task-${task.key}`}>
            {task.task}
          </Title>
          <Paragraph>
            按下面三步核对即可；内部术语和完整关系放在页面底部，需要维护规则时再展开。
          </Paragraph>
        </div>
      </div>

      <div className="erp-dev-governance-decision-list">
        <DecisionStep
          index="1"
          icon={<ReadOutlined />}
          title="先看这些"
          tone="primary"
        >
          <SourceLinks links={task.firstHopLinks} />
        </DecisionStep>

        <DecisionStep
          index="2"
          icon={<CheckCircleOutlined />}
          title="同时检查"
          tone="check"
        >
          <p>{task.syncCheck}</p>
          <SourceLinks links={task.syncCheckLinks} />
        </DecisionStep>

        <DecisionStep
          index="3"
          icon={<SafetyCertificateOutlined />}
          title="不要误判"
          tone="boundary"
        >
          <p>{task.boundary}</p>
        </DecisionStep>
      </div>

      <details className="erp-dev-governance-internal-scope">
        <summary>查看这项改动涉及的内部范围</summary>
        <p>{task.internalScope}</p>
      </details>
    </section>
  )
}

function DeliveryLoop({ loop }) {
  if (!loop?.steps?.length) return null

  return (
    <section
      className="erp-dev-governance-delivery-loop"
      aria-labelledby="personal-delivery-loop-title"
    >
      <div className="erp-dev-governance-delivery-loop__head">
        <div>
          <Space size={8} wrap>
            <SyncOutlined />
            <Title level={2} id="personal-delivery-loop-title">
              个人 ToB 交付循环
            </Title>
          </Space>
          <Paragraph>{loop.summary}</Paragraph>
        </div>
        <Tag color="blue">{loop.steps.length} 步</Tag>
      </div>

      <ol
        className="erp-dev-governance-delivery-loop__steps"
        aria-label="个人 ToB 交付循环五步"
      >
        {loop.steps.map((step, index) => (
          <li className="erp-dev-governance-delivery-loop__step" key={step.key}>
            <span
              className="erp-dev-governance-delivery-loop__number"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <Text strong className="erp-dev-governance-delivery-loop__name">
              {step.step}
            </Text>
            <span className="erp-dev-governance-delivery-loop__owner">
              <Text type="secondary">负责</Text>
              <span>{step.owner}</span>
            </span>
            <p>{step.outcome}</p>
          </li>
        ))}
      </ol>

      <div className="erp-dev-governance-delivery-loop__sources">
        <Text strong>详细说明</Text>
        <SourceLinks links={loop.summaryLinks} />
      </div>
    </section>
  )
}

function AxisReference({ axes = [] }) {
  if (!axes.length) return null

  return (
    <section
      className="erp-dev-governance-reference-section"
      aria-labelledby="governance-axis-reference-title"
    >
      <div className="erp-dev-governance-reference-section__head">
        <div>
          <Text className="erp-dev-governance-eyebrow">维护人员参考</Text>
          <Title level={2} id="governance-axis-reference-title">
            内部分类解释
          </Title>
          <Paragraph>
            日常改动不要求先理解这些词；只有规则冲突或需要解释责任边界时再查。
          </Paragraph>
        </div>
      </div>

      <div className="erp-dev-governance-axis-reference-grid">
        {axes.map((axis) => (
          <article className="erp-dev-governance-axis-reference" key={axis.key}>
            <Title level={3}>{axis.question}</Title>
            <Text type="secondary">内部分类：{axis.axis}</Text>
            <p>
              <Text strong>不要混淆：</Text>
              {axis.boundary}
            </p>
            <SourceLinks links={axis.sourcesLinks} />
          </article>
        ))}
      </div>
    </section>
  )
}

export default function DevGovernancePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const source = useMemo(() => getGovernanceSource(), [])
  const tasks = useMemo(() => parseGovernanceTaskRoutes(source), [source])
  const axes = useMemo(() => parseGovernanceAxes(source), [source])
  const deliveryLoop = useMemo(
    () => parsePersonalDeliveryLoop(source),
    [source]
  )
  const mermaid = useMemo(() => extractGovernanceMermaid(source), [source])
  const summary = useMemo(
    () => buildGovernanceSummary({ axes, tasks, mermaid }),
    [axes, mermaid, tasks]
  )
  const requestedTaskKey = searchParams.get(TASK_QUERY_KEY) || ''
  const selectedTask =
    tasks.find((task) => task.key === requestedTaskKey) || tasks[0]

  useEffect(() => {
    const canonicalTaskKey = selectedTask?.key || ''
    const hasLegacyParams = LEGACY_QUERY_KEYS.some((key) =>
      searchParams.has(key)
    )
    if (requestedTaskKey === canonicalTaskKey && !hasLegacyParams) return

    const nextParams = new URLSearchParams(searchParams)
    if (canonicalTaskKey) {
      nextParams.set(TASK_QUERY_KEY, canonicalTaskKey)
    } else {
      nextParams.delete(TASK_QUERY_KEY)
    }
    LEGACY_QUERY_KEYS.forEach((key) => nextParams.delete(key))
    setSearchParams(nextParams, { replace: true })
  }, [requestedTaskKey, searchParams, selectedTask?.key, setSearchParams])

  const handleSelectTask = (taskKey) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(TASK_QUERY_KEY, taskKey)
    LEGACY_QUERY_KEYS.forEach((key) => nextParams.delete(key))
    setSearchParams(nextParams)
  }

  return (
    <div className="erp-dev-governance-page erp-dev-workspace-page">
      <DevPageNav sourcePath={DEV_GOVERNANCE_SOURCE_PATH} />

      <header className="erp-dev-governance-header">
        <div className="erp-dev-governance-header__copy">
          <Space size={8} wrap className="erp-dev-governance-kicker">
            <PartitionOutlined aria-hidden="true" />
            <Text>项目治理地图</Text>
          </Space>
          <Space align="center" size={10} wrap>
            <Title level={1} className="erp-dev-governance-title">
              这次改动该怎么做？
            </Title>
            <Tag color="green">开发辅助 · 只读</Tag>
          </Space>
          <Paragraph className="erp-dev-governance-summary">
            选择最接近的一项，直接看第一份依据、同时要检查的内容和最容易误判的边界。
          </Paragraph>
        </div>
      </header>

      <main className="erp-dev-governance-shell">
        <aside className="erp-dev-governance-sidebar">
          <div className="erp-dev-governance-sidebar__intro">
            <Title level={2}>你这次准备做什么？</Title>
            <Text type="secondary">不用先记住项目里的专业分类。</Text>
          </div>
          <TaskNav
            tasks={tasks}
            selectedKey={selectedTask?.key}
            onSelect={handleSelectTask}
          />
        </aside>

        <TaskDecision task={selectedTask} />
      </main>

      <details className="erp-dev-governance-reference-details">
        <summary>
          <span>查看完整工作方式和内部说明</span>
          <small>维护规则、解释术语或查看全局关系时再展开</small>
        </summary>
        <div className="erp-dev-governance-reference-details__content">
          <DeliveryLoop loop={deliveryLoop} />
          <AxisReference axes={axes} />

          {mermaid ? (
            <section
              className="erp-dev-governance-reference-section"
              aria-labelledby="governance-routing-title"
            >
              <div className="erp-dev-governance-reference-section__head">
                <div>
                  <Text className="erp-dev-governance-eyebrow">全局关系</Text>
                  <Title level={2} id="governance-routing-title">
                    完整治理关系图
                  </Title>
                  <Paragraph>只用于解释阅读顺序，不替代代码和测试。</Paragraph>
                </div>
              </div>
              <div className="erp-dev-governance-mermaid erp-dev-docs-markdown">
                <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
              </div>
            </section>
          ) : null}

          <section className="erp-dev-governance-source-card">
            <div>
              <Text strong>唯一维护来源</Text>
              <code>{DEV_GOVERNANCE_SOURCE_PATH}</code>
            </div>
            <Text type="secondary">
              当前包含 {summary.taskCount} 类常见任务和 {summary.axisCount}{' '}
              个内部分类。{summary.boundary}
            </Text>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() =>
                copyText(DEV_GOVERNANCE_SOURCE_PATH, '已复制治理地图路径')
              }
            >
              复制来源路径
            </Button>
          </section>
        </div>
      </details>
    </div>
  )
}
