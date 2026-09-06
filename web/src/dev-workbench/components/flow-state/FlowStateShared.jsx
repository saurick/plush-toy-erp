import React, { useCallback, useState } from 'react'
import {
  DatabaseOutlined,
  InfoCircleOutlined,
  PartitionOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Alert, Button, Space, Spin, Typography } from 'antd'
import { DEV_FLOW_STATE_OVERVIEW_CHAIN_KEY as ALL_BUSINESS_CHAINS_KEY } from '../../pages/devFlowStateQuery.mjs'

const { Paragraph, Text, Title } = Typography

const VIEW_ITEMS = Object.freeze([
  {
    value: 'chain',
    label: '看业务链',
    englishLabel: 'Business Chain',
    description:
      '把基础资料、来源单据、人、路、业务动作、账、规则和计算结果串起来',
  },
  {
    value: 'workflow',
    label: '查责任与任务',
    englishLabel: 'Workflow / Task',
    description: '谁负责、谁接棒、为什么阻塞或退回',
  },
  {
    value: 'runtime',
    label: '看运行路径',
    englishLabel: 'ProcessRuntime',
    description: '流程走到哪里、走过什么路径',
  },
  {
    value: 'facts',
    label: '看已生效结果',
    englishLabel: 'Fact / Ledger',
    description: '什么结果正式生效、凭证和纠正方式是什么',
  },
  {
    value: 'states',
    label: '查状态规则',
    englishLabel: 'State Machine',
    description: '对象有哪些状态、允许怎样转换',
  },
])

const VIEW_META = Object.freeze(
  Object.fromEntries(VIEW_ITEMS.map((item) => [item.value, item]))
)

const MEMORY_ITEMS = Object.freeze([
  {
    key: 'workflow',
    icon: TeamOutlined,
    title: 'Workflow 管“人”',
    text: '责任、审批、接棒和协同记录',
  },
  {
    key: 'runtime',
    icon: PartitionOutlined,
    title: 'ProcessRuntime 管“路”',
    text: '实例路径、等待、失败和重试',
  },
  {
    key: 'fact',
    icon: DatabaseOutlined,
    title: 'Fact / Ledger 管“账”',
    text: '正式生效的业务结果与凭证',
  },
  {
    key: 'state',
    icon: SafetyCertificateOutlined,
    title: '状态机管“规则”',
    text: '允许的状态和转换边界',
  },
  {
    key: 'chain',
    icon: SearchOutlined,
    title: '业务链负责串起来',
    text: '总图看衔接，单链看细节，不推断业务完成',
  },
])

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function useDefinitionSelectSearch() {
  const [searchValue, setSearchValue] = useState('')
  const onOpenChange = useCallback((open) => {
    if (!open) setSearchValue('')
  }, [])
  return {
    searchValue,
    onSearch: setSearchValue,
    onOpenChange,
  }
}

function renderDefinitionSelectOption(option) {
  const businessLabel = option?.data?.businessLabel || option?.label
  const machineKey = option?.data?.machineKey || ''
  return (
    <span className="erp-dev-flow-definition-option">
      <span className="erp-dev-flow-definition-option__label">
        {businessLabel}
      </span>
      {machineKey ? (
        <code className="erp-dev-flow-definition-option__key">
          {machineKey}
        </code>
      ) : null}
    </span>
  )
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function evidenceRefs(value) {
  const refs = [
    ...asArray(value?.sourceRefs),
    ...asArray(value?.evidence).map((item) => item?.ref),
  ]
    .map(cleanText)
    .filter(Boolean)
  return [...new Set(refs)]
}

function EvidenceDisclosure({ value, label = '查看代码与文档证据' }) {
  const refs = evidenceRefs(value)
  if (refs.length === 0) return null
  return (
    <details className="erp-dev-flow-evidence" data-evidence-disclosure>
      <summary>
        {label}（{refs.length}）
      </summary>
      <ul>
        {refs.map((ref) => (
          <li key={ref}>
            <code>{ref}</code>
          </li>
        ))}
      </ul>
    </details>
  )
}

function KeyValue({ children, value, copyable = true }) {
  return (
    <Text
      copyable={copyable ? { text: value } : undefined}
      className="erp-dev-flow-key-copy"
    >
      <code>{children || value}</code>
    </Text>
  )
}

function CatalogState({ state, onRetry }) {
  if (state.status === 'loading') {
    return (
      <div className="erp-dev-flow-loading" role="status" aria-live="polite">
        <Spin />
        <span>正在加载业务链目录…</span>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <Alert
        showIcon
        type="error"
        message="业务链目录不可用"
        description={
          <Space direction="vertical">
            <span>{state.error}</span>
            <Button icon={<ReloadOutlined />} onClick={onRetry}>
              重新加载目录
            </Button>
          </Space>
        }
      />
    )
  }
  return null
}

function MemoryStrip() {
  return (
    <>
      <section className="erp-dev-flow-memory" aria-label="五个视图职责记忆">
        {MEMORY_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.key} data-memory-layer={item.key}>
              <Icon aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
            </article>
          )
        })}
      </section>
      <Paragraph className="erp-dev-flow-concepts__scope">
        <strong>业务链中的对象：</strong>
        基础资料提供标准，例如客户、供应商、产品、材料和仓库；来源单据记录承诺，例如销售订单、采购订单、生产订单和加工合同，用来说明准备做什么或承诺做什么，但不代表库存、出货或财务结果已经发生。
        <br />
        <strong>动作和横切控制：</strong>
        受控业务动作负责真正执行，计算结果由正式来源和事实派生；权限、客户配置与审计贯穿全部视图，不单独构成业务链。
      </Paragraph>
    </>
  )
}

function GuidanceDisclosure({ guidanceKey, title, summary, description }) {
  return (
    <details className="erp-dev-flow-guidance" data-flow-guidance={guidanceKey}>
      <summary>
        <InfoCircleOutlined aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
      </summary>
      <div className="erp-dev-flow-guidance__body">
        <p>{description}</p>
      </div>
    </details>
  )
}

function ContextStrip({
  view,
  chain,
  node,
  selection,
  canReturnToChain,
  onReturnChain,
}) {
  const overviewSelected = chain?.key === ALL_BUSINESS_CHAINS_KEY
  return (
    <section className="erp-dev-flow-context" aria-label="当前观察上下文">
      <div>
        <span>当前视图</span>
        <strong>{VIEW_META[view]?.label}</strong>
      </div>
      <div>
        <span>当前业务链</span>
        <strong>{chain?.label || '未选择'}</strong>
      </div>
      <div>
        <span>{overviewSelected ? '总图范围' : '当前链路节点'}</span>
        <strong>
          {overviewSelected
            ? `${chain.chainKeys.length} 条业务链 · ${chain.relations.length} 条衔接`
            : node?.label || '未选择'}
        </strong>
      </div>
      {selection ? (
        <div>
          <span>当前专项选择</span>
          <strong>{selection}</strong>
        </div>
      ) : null}
      {canReturnToChain ? (
        <Button onClick={onReturnChain}>返回业务链</Button>
      ) : null}
    </section>
  )
}

export {
  Paragraph,
  Text,
  Title,
  VIEW_ITEMS,
  VIEW_META,
  cleanText,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
  asArray,
  EvidenceDisclosure,
  KeyValue,
  CatalogState,
  MemoryStrip,
  GuidanceDisclosure,
  ContextStrip,
}

const DEFINITION_SELECT_CLASS_NAMES = Object.freeze({
  popup: Object.freeze({ root: 'erp-dev-flow-definition-select-popup' }),
})

function formatQueryTime(value) {
  if (!value) return '未查询'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function escapeMermaid(value) {
  return cleanText(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', ' ')
}
export { DEFINITION_SELECT_CLASS_NAMES, formatQueryTime, escapeMermaid }
