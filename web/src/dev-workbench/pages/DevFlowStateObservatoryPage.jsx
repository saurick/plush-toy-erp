import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  PartitionOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Popover,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import { Markdown } from '@/common/components/markdown'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  getWorkflowTaskProcessContext,
  listWorkflowTaskEvents,
  listWorkflowTasks,
} from '@/erp/api/workflowApi.mjs'
import {
  formatProcessStartedAt,
  getProcessLabel,
  getProcessNodeLabel,
  getProcessNodeStatusLabel,
  getProcessStatusLabel,
  getWorkflowTaskDisplayName,
  isDisplayOnlyWorkflowTask,
} from '@/erp/utils/processRuntimePresentation.mjs'
import { buildWorkflowTaskEventTrailModel } from '@/erp/utils/workflowTaskEventPresentation.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from '@/erp/utils/workflowTaskBoard.mjs'
import { getPermissionCenterRoleName } from '../../erp/utils/permissionCenterAccess.mjs'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import { buildDevBusinessChainCustomerReview } from '../config/devBusinessChainCustomerReview.mjs'
import DevBusinessChainCustomerReviewPrint from './DevBusinessChainCustomerReviewPrint.jsx'
import {
  DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION,
  buildDevFlowStateTaskLookupQuery,
  getDevFlowStateTaskRuntimeAssociation,
  isDevFlowStateTaskUnlinkedRuntimeError,
  parseDevFlowStateTaskIDReference,
  resolveDevFlowStateTaskLookupPage,
} from './devFlowStateTaskLookup.mjs'
import {
  buildDevFlowDefinitionSearchGroups,
  createDevFlowDefinitionOptionFilter,
  normalizeDevFlowDefinitionSearchText,
} from './devFlowDefinitionSearch.mjs'
import {
  buildBusinessChainSelectOptions,
  buildFactDefinitionSelectOptions,
  buildStateDefinitionSelectOptions,
} from './devFlowDefinitionSelectOptions.mjs'
import {
  DEV_FLOW_STATE_TRANSITION_FILTERS,
  buildDevFlowStateNodeSummary,
  buildDevFlowStateRelatedViews,
  buildDevFlowStateRuleMermaid,
  buildDevFlowStateRuleSummary,
  filterDevFlowStateTransitions,
  getDevFlowStateTransitionPresentation,
  listDevFlowStatePathGroups,
} from './devFlowStateRulePresentation.mjs'
import {
  DEV_FLOW_STATE_DEFAULT_VIEW as DEFAULT_VIEW,
  DEV_FLOW_STATE_OVERVIEW_CHAIN_KEY as ALL_BUSINESS_CHAINS_KEY,
  DEV_FLOW_STATE_QUERY_KEYS as QUERY_KEYS,
  DEV_FLOW_STATE_SELECTION_QUERY_KEYS as SELECTION_QUERY_KEYS,
  DEV_FLOW_STATE_VIEW_SELECTION_QUERY_KEYS as VIEW_SELECTION_QUERY_KEYS,
  canonicalizeDevFlowStateSearchParams,
} from './devFlowStateQuery.mjs'
import '../styles/dev-flow-state-observatory.css'

const { Paragraph, Text, Title } = Typography

const SOURCE_PATH = 'docs/architecture/业务链与运行轨迹边界.md'
const CATALOG_MODULE_PATH = '../config/devFlowStateCatalog.mjs'
const CATALOG_MODULES = import.meta.glob('../config/devFlowStateCatalog.mjs')

const KNOWN_QUERY_KEYS = new Set(Object.values(QUERY_KEYS))
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
const VIEW_KEYS = new Set(VIEW_ITEMS.map((item) => item.value))
function getProcessOwnerPoolLabel(ownerPool) {
  const label = getPermissionCenterRoleName({ role_key: ownerPool })
  return label === '已配置岗位' ? ownerPool : label
}

const CHAIN_KIND_PRESENTATION = Object.freeze({
  primary: { label: '业务主链', color: 'green' },
  supporting: { label: '支撑链', color: 'blue' },
  exception: { label: '异常链', color: 'volcano' },
  rework: { label: '返工链', color: 'purple' },
  reversal: { label: '冲正链', color: 'gold' },
})

const CHAIN_LAYER_PRESENTATION = Object.freeze({
  source_document: {
    label: '业务单据',
    technicalLabel: 'Source Document',
    color: 'blue',
    responsibility: '由具有该单据权限的业务经办岗位办理。',
    completion:
      '完成该单据允许的当前动作后，才按业务链进入下一步；单据状态不等于业务事实已经生效。',
    exception:
      '单据被退回、取消或关闭时，按该业务对象的状态规则处理，不在本页直接改状态。',
  },
  masterdata_lifecycle: {
    label: '基础资料',
    technicalLabel: 'MasterData',
    color: 'purple',
    responsibility: '由获授权的基础资料维护岗位负责。',
    completion:
      '资料已经生效并满足后续引用条件；停用或缺少有效版本时，依赖它的步骤不能继续。',
    exception: '先修正或启用权威基础资料，再回到业务链继续核对。',
  },
  process_runtime: {
    label: '流程运行',
    technicalLabel: 'ProcessRuntime',
    color: 'orange',
    responsibility:
      '系统按已登记流程推进；需要人工办理时，由对应岗位任务承接。',
    completion:
      '当前流程步骤按正式结果结束并进入已登记的下一步；流程走完不代表业务事实已经生效。',
    exception:
      '到“查责任与任务”查看等待、阻塞或退回原因，不在本页强改流程状态。',
  },
  workflow_task: {
    label: '岗位协同',
    technicalLabel: 'Workflow Task',
    color: 'green',
    responsibility: '由当前任务的责任人或责任池办理。',
    completion:
      '任务完成、阻塞或退回都会留下协同记录；任务完成不等于库存、出货或财务结果已经生效。',
    exception: '到“查责任与任务”查看原因、责任人和接棒记录。',
  },
  fact_ledger: {
    label: '已生效业务记录',
    technicalLabel: 'Fact / Ledger',
    color: 'red',
    responsibility:
      '由对应领域动作和有权限的岗位共同形成，权威结果以业务凭证为准。',
    completion: '正式业务凭证已经生效，并能按对应取消、调整或冲正规则纠正。',
    exception: '不能直接改状态；应使用对应业务对象的取消、调整或冲正路径。',
  },
  derived_result: {
    label: '计算结果',
    technicalLabel: 'Derived Result',
    color: 'geekblue',
    responsibility: '由系统根据正式业务记录计算或汇总。',
    completion:
      '上游权威数据完整且计算结果已更新；计算结果本身不会反写业务事实。',
    exception: '返回上游业务记录核对缺失或错误来源，不在计算结果上补造数据。',
  },
})

const CHAIN_EDGE_PRESENTATION = Object.freeze({
  starts_process: '触发流程',
  creates_task: '创建任务',
  calls_domain_command: '调用领域命令',
  requires: '需要前置结果',
  creates_source: '创建来源单据',
  posts_fact: '生成业务事实',
  derives: '形成派生结果',
  reverses: '冲正原影响',
  returns: '退回或回货',
  reworks: '进入返工',
})

const CHAIN_RELATION_PRESENTATION = Object.freeze({
  continues: { label: '主线衔接', color: 'green' },
  supplies: { label: '供给', color: 'blue' },
  branches_to: { label: '异常分流', color: 'volcano' },
  returns_to: { label: '返回主路径', color: 'purple' },
  corrects: { label: '纠正', color: 'gold' },
  cross_cuts: { label: '横切支撑', color: 'default' },
  reworks: { label: '返工', color: 'magenta' },
})

const CHAIN_OVERVIEW_LANE_PRESENTATION = Object.freeze({
  primary: { color: 'green' },
  supply: { color: 'blue' },
  exception: { color: 'volcano' },
  correction: { color: 'gold' },
})

const PROCESS_STATUS_COLORS = Object.freeze({
  active: 'orange',
  blocked: 'red',
  completed: 'blue',
  waiting: 'default',
})

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

const DEFINITION_SEARCH_GUIDE_GROUPS = Object.freeze([
  {
    label: '业务对象或业务链',
    examples: Object.freeze(['销售订单', '生产 入库']),
  },
  {
    label: '流程或节点',
    examples: Object.freeze(['销售 PMC', '财务放行']),
  },
  {
    label: '状态',
    examples: Object.freeze(['已提交', '阻塞']),
  },
  {
    label: '事实定义',
    examples: Object.freeze(['采购入库', '出货事实']),
  },
  {
    label: '稳定 key（排障）',
    examples: Object.freeze(['source.sales_order', 'fact.shipment']),
  },
])

const DEFINITION_SELECT_CLASS_NAMES = Object.freeze({
  popup: Object.freeze({ root: 'erp-dev-flow-definition-select-popup' }),
})

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

function uniqueKeys(items, keyOf) {
  const keys = items.map(keyOf)
  return keys.length === new Set(keys).size && keys.every(Boolean)
}

function validateCatalog(moduleValue) {
  const catalog = moduleValue?.DEV_FLOW_STATE_CATALOG || moduleValue?.default
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('状态目录模块没有导出 DEV_FLOW_STATE_CATALOG')
  }
  if (
    catalog.readOnly !== true ||
    catalog.allowsActionExecution !== false ||
    catalog.allowsGenericStatusWrite !== false
  ) {
    throw new Error('目录没有闭合只读边界')
  }

  const flows = asArray(catalog.flows)
  const processDefinitions = asArray(catalog.processDefinitions)
  const businessChains = asArray(catalog.businessChains)
  const { businessChainOverview } = catalog
  const factDefinitions = asArray(catalog.factDefinitions)
  const factDefinitionGroups = asArray(catalog.factDefinitionGroups)
  if (
    flows.length === 0 ||
    processDefinitions.length === 0 ||
    businessChains.length === 0 ||
    factDefinitions.length === 0 ||
    factDefinitionGroups.length === 0 ||
    !uniqueKeys(flows, (flow) => flow.key) ||
    !uniqueKeys(processDefinitions, (definition) => definition.key) ||
    !uniqueKeys(businessChains, (chain) => chain.key) ||
    !uniqueKeys(factDefinitions, (definition) => definition.factKey) ||
    !uniqueKeys(factDefinitionGroups, (group) => group.key)
  ) {
    throw new Error('目录为空、存在重复 key 或结构不完整')
  }
  if (
    catalog.businessChainCoverage?.complete !== true ||
    catalog.businessChainCoverage?.overviewComplete !== true ||
    catalog.factLedgerCoverage?.complete !== true ||
    catalog.factRuntimeQuery?.availability !== 'unavailable'
  ) {
    throw new Error('业务链或事实目录覆盖门禁未闭合')
  }
  if (
    businessChainOverview?.key !== ALL_BUSINESS_CHAINS_KEY ||
    businessChainOverview?.readOnly !== true ||
    businessChainOverview?.allowsActionExecution !== false ||
    businessChainOverview?.runtimeAuthority !== 'design_projection_only' ||
    !uniqueKeys(asArray(businessChainOverview.lanes), (lane) => lane.key) ||
    !uniqueKeys(
      asArray(businessChainOverview.relations),
      (relation) => relation.key
    ) ||
    asArray(businessChainOverview.lanes).some(
      (lane) => lane.readOnly !== true
    ) ||
    asArray(businessChainOverview.relations).some(
      (relation) => relation.readOnly !== true
    ) ||
    businessChains.some(
      (chain) =>
        chain.readOnly !== true ||
        chain.allowsActionExecution !== false ||
        chain.runtimeAuthority !== 'design_projection_only' ||
        !asArray(chain.nodes).every((node) => node.readOnly === true) ||
        !asArray(chain.edges).every((edge) => edge.readOnly === true)
    ) ||
    factDefinitions.some(
      (definition) =>
        definition.readOnly !== true ||
        definition.runtimeProofQuery !== 'unavailable' ||
        !factDefinitionGroups.some(
          (group) => group.key === definition.displayGroupKey
        )
    ) ||
    factDefinitionGroups.some((group) => group.navigationOnly !== true)
  ) {
    throw new Error('目录包含可执行能力或伪造的运行凭证查询')
  }
  const overviewChainKeys = asArray(businessChainOverview.lanes).flatMap(
    (lane) => asArray(lane.chainKeys)
  )
  if (
    overviewChainKeys.length !== businessChains.length ||
    new Set(overviewChainKeys).size !== businessChains.length ||
    businessChains.some((chain) => !overviewChainKeys.includes(chain.key))
  ) {
    throw new Error('业务总图没有精确覆盖全部业务链')
  }
  return catalog
}

function useFlowStateCatalog() {
  const [state, setState] = useState({
    status: 'loading',
    catalog: null,
    error: '',
  })

  const reload = useCallback(() => {
    let active = true
    const loader =
      CATALOG_MODULES[CATALOG_MODULE_PATH] || Object.values(CATALOG_MODULES)[0]
    setState({ status: 'loading', catalog: null, error: '' })
    if (typeof loader !== 'function') {
      setState({
        status: 'error',
        catalog: null,
        error: `未找到 ${CATALOG_MODULE_PATH}`,
      })
      return () => {
        active = false
      }
    }
    loader()
      .then((moduleValue) => {
        if (!active) return
        setState({
          status: 'ready',
          catalog: validateCatalog(moduleValue),
          error: '',
        })
      })
      .catch((error) => {
        if (!active) return
        setState({
          status: 'error',
          catalog: null,
          error: cleanText(error?.message) || '目录加载失败',
        })
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => reload(), [reload])
  return { ...state, reload }
}

function patchParams(searchParams, patch) {
  const next = new URLSearchParams(searchParams)
  for (const [key, value] of Object.entries(patch)) {
    const normalized = cleanText(value)
    if (!normalized) next.delete(key)
    else next.set(key, normalized)
  }
  return next
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

function buildChainMermaid(chain, currentRuntimeNodeKey) {
  if (!chain) return ''
  const ids = new Map(chain.nodes.map((node, index) => [node.key, `N${index}`]))
  const lines = ['flowchart LR']
  for (const node of chain.nodes) {
    lines.push(`  ${ids.get(node.key)}["${escapeMermaid(node.label)}"]`)
  }
  for (const edge of chain.edges) {
    lines.push(
      `  ${ids.get(edge.from)} -->|"${escapeMermaid(edge.label)}"| ${ids.get(edge.to)}`
    )
  }
  lines.push(
    '  classDef source_document fill:#e6f4ff,stroke:#1677ff,color:#102a43',
    '  classDef masterdata_lifecycle fill:#f9f0ff,stroke:#722ed1,color:#2d1648',
    '  classDef process_runtime fill:#fff7e6,stroke:#d46b08,color:#452500',
    '  classDef workflow_task fill:#f6ffed,stroke:#389e0d,color:#163300',
    '  classDef fact_ledger fill:#fff1f0,stroke:#cf1322,color:#3d0b0b',
    '  classDef derived_result fill:#f0f5ff,stroke:#2f54eb,color:#061b57',
    '  classDef runtime_current fill:#fffbe6,stroke:#fa8c16,stroke-width:4px,color:#422006'
  )
  for (const node of chain.nodes) {
    const classes = [node.layer]
    if (node.key === currentRuntimeNodeKey) classes.push('runtime_current')
    lines.push(`  class ${ids.get(node.key)} ${classes.join(',')}`)
  }
  return lines.join('\n')
}

function buildBusinessChainOverviewMermaid(overview, chains, currentChainKey) {
  if (!overview) return ''
  const chainByKey = new Map(chains.map((chain) => [chain.key, chain]))
  const ids = new Map(chains.map((chain, index) => [chain.key, `C${index}`]))
  const lines = ['flowchart LR']

  overview.lanes.forEach((lane, laneIndex) => {
    lines.push(`  subgraph L${laneIndex}["${escapeMermaid(lane.label)}"]`)
    lines.push('    direction LR')
    lane.chainKeys.forEach((chainKey) => {
      const chain = chainByKey.get(chainKey)
      lines.push(
        `    ${ids.get(chainKey)}["${escapeMermaid(chain?.label || chainKey)}"]`
      )
    })
    lines.push('  end')
  })

  overview.relations.forEach((relation) => {
    lines.push(
      `  ${ids.get(relation.fromChainKey)} -->|"${escapeMermaid(relation.label)}"| ${ids.get(relation.toChainKey)}`
    )
  })
  lines.push(
    '  classDef primary fill:#f6ffed,stroke:#389e0d,color:#163300',
    '  classDef supporting fill:#e6f4ff,stroke:#1677ff,color:#102a43',
    '  classDef exception fill:#fff2e8,stroke:#d4380d,color:#431407',
    '  classDef rework fill:#f9f0ff,stroke:#722ed1,color:#2d1648',
    '  classDef reversal fill:#fffbe6,stroke:#d48806,color:#3d2b00',
    '  classDef overview_runtime_current fill:#fff7e6,stroke:#fa8c16,stroke-width:4px,color:#452500'
  )
  chains.forEach((chain) => {
    const classes = [chain.kind]
    if (chain.key === currentChainKey) classes.push('overview_runtime_current')
    lines.push(`  class ${ids.get(chain.key)} ${classes.join(',')}`)
  })
  return lines.join('\n')
}

function buildProcessMermaid(definition) {
  if (!definition) return ''
  const ids = new Map(
    definition.nodes.map((node, index) => [node.key, `P${index}`])
  )
  const nodeByKey = new Map(definition.nodes.map((node) => [node.key, node]))
  const lines = ['flowchart LR']
  for (const node of definition.nodes) {
    lines.push(`  ${ids.get(node.key)}["${escapeMermaid(node.label)}"]`)
  }
  for (const edge of definition.edges) {
    const branchLabel =
      edge.branchLabel || nodeByKey.get(edge.to)?.label || '结果分支'
    const connector = edge.branchPolicy
      ? `-->|"${escapeMermaid(branchLabel)}"|`
      : '-->'
    lines.push(`  ${ids.get(edge.from)} ${connector} ${ids.get(edge.to)}`)
  }
  return lines.join('\n')
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

function DefinitionSearch({ catalog, onOpen, onOpenTaskLookup }) {
  const [draftKeyword, setDraftKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchGuideOpen, setSearchGuideOpen] = useState(false)
  const composingRef = useRef(false)
  const normalized = normalizeDevFlowDefinitionSearchText(searchKeyword)
  const groups = useMemo(
    () => buildDevFlowDefinitionSearchGroups(catalog, searchKeyword),
    [catalog, searchKeyword]
  )
  const resultCount = groups.reduce(
    (count, group) => count + group.items.length,
    0
  )
  const clearSearch = () => {
    composingRef.current = false
    setDraftKeyword('')
    setSearchKeyword('')
  }
  const openResult = (item) => {
    clearSearch()
    onOpen(item)
  }
  const searchExample = (keyword) => {
    composingRef.current = false
    setDraftKeyword(keyword)
    setSearchKeyword(keyword)
    setSearchGuideOpen(false)
  }
  const openTaskLookup = () => {
    const keyword = draftKeyword
    clearSearch()
    setSearchGuideOpen(false)
    onOpenTaskLookup(keyword)
  }

  const searchGuide = (
    <div
      className="erp-dev-flow-search-guide"
      id="dev-flow-definition-search-guide"
      data-definition-search-guide
    >
      <p>这个框查目录定义，不查具体任务、运行实例或真实业务记录。</p>
      <ul>
        {DEFINITION_SEARCH_GUIDE_GROUPS.map((group) => (
          <li key={group.label}>
            <strong>{group.label}</strong>
            <div className="erp-dev-flow-search-guide__examples">
              {group.examples.map((example) => (
                <Button
                  key={example}
                  size="small"
                  onClick={() => searchExample(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <small>多个词用空格组合；点击示例会直接带入并搜索。</small>
    </div>
  )

  return (
    <section
      className="erp-dev-flow-global-search"
      aria-labelledby="dev-flow-global-search-title"
      data-search-composing={composingRef.current ? 'true' : 'false'}
    >
      <div className="erp-dev-flow-section-heading">
        <div>
          <Space size={6} wrap>
            <Text strong id="dev-flow-global-search-title">
              跨视图查定义
            </Text>
            <Tag color="blue">覆盖 5 个视图</Tag>
          </Space>
          <Text type="secondary">
            这是本页 5 个视图的定义总索引，不属于当前
            Tab；统一查业务链、Workflow、ProcessRuntime、状态和事实定义，不查具体任务、运行实例或真实业务记录。
          </Text>
        </div>
        <Space size={8} wrap>
          <Popover
            placement="bottomRight"
            trigger="click"
            open={searchGuideOpen}
            title="这个框可以搜什么"
            content={searchGuide}
            onOpenChange={setSearchGuideOpen}
          >
            <Button
              icon={<InfoCircleOutlined />}
              aria-expanded={searchGuideOpen}
              aria-controls="dev-flow-definition-search-guide"
            >
              可以搜什么
            </Button>
          </Popover>
          <Button onClick={openTaskLookup}>去查真实任务</Button>
        </Space>
      </div>
      <SearchInput
        allowClear
        maxLength={500}
        value={draftKeyword}
        placeholder="例如：销售订单、销售 PMC、已提交"
        searchHint="本页 5 个视图的定义总索引，不属于当前 Tab；不搜索具体任务、运行实例或真实业务记录"
        aria-autocomplete="list"
        aria-expanded={Boolean(normalized)}
        aria-controls="dev-flow-definition-search-results"
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={(event) => {
          const { value } = event.currentTarget
          composingRef.current = false
          setDraftKeyword(value)
          setSearchKeyword(value)
        }}
        onChange={(event) => {
          const { value } = event.target
          setDraftKeyword(value)
          if (!composingRef.current && !event.nativeEvent.isComposing) {
            setSearchKeyword(value)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') clearSearch()
        }}
      />
      {normalized ? (
        <div
          className="erp-dev-flow-search-results"
          id="dev-flow-definition-search-results"
          aria-label="定义搜索结果"
        >
          <div className="erp-dev-flow-search-result-summary">
            <Tag>{resultCount} 个定义</Tag>
          </div>
          {resultCount > 0 ? (
            <div className="erp-dev-flow-search-groups">
              {groups.map((group) => (
                <section key={group.key}>
                  <h3>
                    {group.label}
                    <span>{group.items.length}</span>
                  </h3>
                  {group.items.length > 0 ? (
                    <ul>
                      {group.items.map((item) => (
                        <li key={`${item.type}:${item.key}`}>
                          <button
                            type="button"
                            onClick={() => openResult(item)}
                          >
                            <strong>{item.label}</strong>
                            {item.matchContext ? (
                              <small>{item.matchContext}</small>
                            ) : null}
                            <code>{item.key}</code>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <small>没有匹配定义</small>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="没有匹配定义；具体任务请使用“去查真实任务”"
            />
          )}
        </div>
      ) : null}
    </section>
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

function TaskLookupResults({ lookup, onSelectTask }) {
  if (lookup.status === 'loading') {
    return (
      <div className="erp-dev-flow-loading" role="status" aria-live="polite">
        <Spin />
        <span>正在当前账号可见任务中查找…</span>
      </div>
    )
  }
  if (lookup.status === 'error') {
    return (
      <Alert
        showIcon
        type="error"
        message="任务查找失败"
        description={lookup.error}
      />
    )
  }
  if (lookup.status !== 'ready') return null
  if (lookup.candidates.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="没有找到名称、任务编号或来源单号相符的可见任务"
      />
    )
  }
  return (
    <section className="erp-dev-flow-task-results" aria-label="任务查询结果">
      <div className="erp-dev-flow-section-heading">
        <div>
          <Text strong>
            {lookup.candidates.length > 1
              ? `找到 ${lookup.candidates.length} 条同名或相关任务`
              : '找到 1 条相关任务'}
          </Text>
          <Text type="secondary">
            名称可能重复，请结合任务编号、来源单号、负责岗位和状态选择。
          </Text>
        </div>
        <Tag>{lookup.serverMatchCount} 条后端匹配</Tag>
      </div>
      {!lookup.complete ? (
        <Alert
          showIcon
          type="warning"
          message={`当前只读取最新 ${lookup.loadedCount} 条匹配任务`}
          description="结果不完整时不会自动选择；请补全任务名称、任务编号或来源单号。"
        />
      ) : null}
      <ul>
        {lookup.candidates.map((task) => {
          const status = getWorkflowTaskStatusMeta(task)
          const sourceNo = cleanText(task.source_no) || '未记录来源单号'
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onSelectTask(task)}
                aria-label={`读取任务：${getWorkflowTaskDisplayName(task)}；任务编号：${task.task_code}；来源单号：${sourceNo}`}
              >
                <span>
                  <strong>{getWorkflowTaskDisplayName(task)}</strong>
                  <Tag color={status.color}>{status.label}</Tag>
                </span>
                <small>任务编号：{task.task_code}</small>
                <small>来源单号：{sourceNo}</small>
                <small>负责岗位：{getWorkflowTaskOwnerRoleLabel(task)}</small>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function TaskFinder({
  draft,
  onDraftChange,
  onClearTask,
  onSelectTask,
  taskId,
}) {
  const controllerRef = useRef(null)
  const [lookup, setLookup] = useState({
    status: 'idle',
    candidates: [],
    complete: true,
    loadedCount: 0,
    serverMatchCount: 0,
    error: '',
  })
  useEffect(() => () => controllerRef.current?.abort(), [])

  const selectTask = (task) => {
    controllerRef.current?.abort()
    setLookup((current) => ({
      ...current,
      status: 'selected',
      candidates: [],
      error: '',
    }))
    onDraftChange(task.task_name)
    onSelectTask(task.id, task)
  }

  const submit = async () => {
    const directTaskId = parseDevFlowStateTaskIDReference(draft)
    if (directTaskId) {
      controllerRef.current?.abort()
      setLookup((current) => ({
        ...current,
        status: 'selected',
        candidates: [],
        error: '',
      }))
      onSelectTask(directTaskId, null)
      return
    }
    let query
    try {
      query = buildDevFlowStateTaskLookupQuery(draft)
    } catch (error) {
      setLookup({
        status: 'error',
        candidates: [],
        complete: true,
        loadedCount: 0,
        serverMatchCount: 0,
        error: error.message,
      })
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLookup({
      status: 'loading',
      candidates: [],
      complete: true,
      loadedCount: 0,
      serverMatchCount: 0,
      error: '',
    })
    onClearTask()
    try {
      const data = await listWorkflowTasks(query, { signal: controller.signal })
      if (controller.signal.aborted) return
      const resolved = resolveDevFlowStateTaskLookupPage(data, draft)
      if (resolved.autoSelectedTask) {
        selectTask(resolved.autoSelectedTask)
        return
      }
      setLookup({ status: 'ready', error: '', ...resolved })
    } catch (error) {
      if (controller.signal.aborted || isRpcAbortError(error)) return
      setLookup({
        status: 'error',
        candidates: [],
        complete: true,
        loadedCount: 0,
        serverMatchCount: 0,
        error: getActionErrorMessage(error, '查找任务', {
          fallback: '查找任务失败，请确认已登录且具备任务查看权限',
        }),
      })
    }
  }

  return (
    <div className="erp-dev-flow-task-finder">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label htmlFor="dev-flow-task-search">查找后台任务</label>
        <SearchInput
          id="dev-flow-task-search"
          allowClear
          maxLength={200}
          value={draft}
          placeholder="粘贴完整任务名称、任务编号、来源单号或数字 task_id"
          searchHint="从电脑端后台「任务看板」复制完整任务名称；也支持任务编号、来源单号，数字 task_id 仅用于开发排障"
          onChange={(event) => {
            controllerRef.current?.abort()
            setLookup((current) => ({
              ...current,
              status: 'idle',
              candidates: [],
              error: '',
            }))
            onDraftChange(event.target.value)
          }}
        />
        <Button
          type="primary"
          htmlType="submit"
          loading={lookup.status === 'loading'}
        >
          查找并读取
        </Button>
        {taskId ? <Button onClick={onClearTask}>清除当前任务</Button> : null}
      </form>
      <Text type="secondary">
        从后台「任务看板」复制完整任务名称、任务编号或来源单号；数字 task_id
        仅用于开发排障，查询结果受当前账号可见范围限制。
      </Text>
      <TaskLookupResults lookup={lookup} onSelectTask={selectTask} />
    </div>
  )
}

function useRuntimeContext(taskId, association) {
  const [state, setState] = useState({
    status: 'idle',
    context: null,
    error: '',
    queriedAt: '',
  })
  useEffect(() => {
    if (!taskId) {
      setState({ status: 'idle', context: null, error: '', queriedAt: '' })
      return undefined
    }
    if (association === DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.UNLINKED) {
      setState({
        status: 'unlinked',
        context: null,
        error: '',
        queriedAt: new Date().toISOString(),
      })
      return undefined
    }
    if (association === DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.INVALID) {
      setState({
        status: 'error',
        context: null,
        error: '任务的 ProcessRuntime 锚点不完整，已拒绝猜测。',
        queriedAt: new Date().toISOString(),
      })
      return undefined
    }
    const controller = new AbortController()
    setState({ status: 'loading', context: null, error: '', queriedAt: '' })
    getWorkflowTaskProcessContext(Number(taskId), { signal: controller.signal })
      .then((context) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'ready',
            context,
            error: '',
            queriedAt: new Date().toISOString(),
          })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || isRpcAbortError(error)) return
        if (isDevFlowStateTaskUnlinkedRuntimeError(error)) {
          setState({
            status: 'unlinked',
            context: null,
            error: '',
            queriedAt: new Date().toISOString(),
          })
          return
        }
        setState({
          status: 'error',
          context: null,
          queriedAt: new Date().toISOString(),
          error: getActionErrorMessage(error, '读取任务流程位置', {
            fallback: '读取任务流程位置失败，请确认已登录且具备任务查看权限',
          }),
        })
      })
    return () => controller.abort()
  }, [association, taskId])
  return state
}

function useWorkflowEvents(taskId) {
  const [state, setState] = useState({
    status: 'idle',
    items: [],
    truncated: false,
    error: '',
    queriedAt: '',
  })
  useEffect(() => {
    if (!taskId) {
      setState({
        status: 'idle',
        items: [],
        truncated: false,
        error: '',
        queriedAt: '',
      })
      return undefined
    }
    const controller = new AbortController()
    setState({
      status: 'loading',
      items: [],
      truncated: false,
      error: '',
      queriedAt: '',
    })
    listWorkflowTaskEvents(Number(taskId), {
      limit: 100,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'ready',
            items: result.items,
            truncated: result.truncated,
            error: '',
            queriedAt: new Date().toISOString(),
          })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || isRpcAbortError(error)) return
        setState({
          status: 'error',
          items: [],
          truncated: false,
          queriedAt: new Date().toISOString(),
          error: getActionErrorMessage(error, '读取任务协同记录', {
            fallback: '读取任务协同记录失败，请确认已登录且具备任务查看权限',
          }),
        })
      })
    return () => controller.abort()
  }, [taskId])
  return state
}

function BusinessChainSelector({ catalog, value, onChange }) {
  const searchProps = useDefinitionSelectSearch()
  const options = useMemo(
    () => buildBusinessChainSelectOptions(catalog),
    [catalog]
  )
  const chainOptionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(catalog, 'chains'),
    [catalog]
  )
  const optionFilter = useCallback(
    (keyword, option) => {
      if (option?.value !== ALL_BUSINESS_CHAINS_KEY) {
        return chainOptionFilter(keyword, option)
      }
      const normalized = normalizeDevFlowDefinitionSearchText(keyword)
      if (!normalized) return true
      const overviewText = normalizeDevFlowDefinitionSearchText(
        [
          catalog.businessChainOverview.label,
          catalog.businessChainOverview.summary,
          '全部业务链 总链 总图 设计总图',
        ].join(' ')
      )
      return normalized
        .split(/\s+/u)
        .every((term) => overviewText.includes(term))
    },
    [catalog.businessChainOverview, chainOptionFilter]
  )
  const overviewSelected = value === ALL_BUSINESS_CHAINS_KEY
  const selectedChain = catalog.businessChains.find(
    (item) => item.key === value
  )
  const selectedKind = selectedChain
    ? CHAIN_KIND_PRESENTATION[selectedChain.kind]
    : null
  return (
    <div className="erp-dev-flow-chain-selector">
      <label htmlFor="dev-flow-chain-select">选择业务链</label>
      <Select
        id="dev-flow-chain-select"
        aria-label="选择业务链"
        showSearch
        virtual={false}
        {...searchProps}
        classNames={DEFINITION_SELECT_CLASS_NAMES}
        filterOption={optionFilter}
        notFoundContent="没有匹配的业务链"
        value={value}
        options={options}
        optionRender={renderDefinitionSelectOption}
        onChange={onChange}
      />
      {overviewSelected ? (
        <Tag color="geekblue">链级设计总图</Tag>
      ) : selectedKind ? (
        <Tag color={selectedKind.color}>{selectedKind.label}</Tag>
      ) : null}
    </div>
  )
}

function useBusinessChainRuntime(catalog, taskId, selectedTask) {
  const association = getDevFlowStateTaskRuntimeAssociation(selectedTask)
  const runtime = useRuntimeContext(taskId, association)
  const runtimeProcessKey = cleanText(
    runtime.context?.process_instance?.process_key
  )
  const matchingChain = runtimeProcessKey
    ? catalog.businessChains.find((item) =>
        item.nodes.some((candidate) =>
          candidate.processKeys.includes(runtimeProcessKey)
        )
      )
    : null
  return { runtime, runtimeProcessKey, matchingChain }
}

function BusinessChainOverviewView({
  catalog,
  taskId,
  selectedTask,
  onSelectChain,
  onOpenView,
  onPrintCustomerReview,
}) {
  const overview = catalog.businessChainOverview
  const chainByKey = useMemo(
    () => new Map(catalog.businessChains.map((chain) => [chain.key, chain])),
    [catalog.businessChains]
  )
  const { runtime, matchingChain } = useBusinessChainRuntime(
    catalog,
    taskId,
    selectedTask
  )
  const mermaid = useMemo(
    () =>
      buildBusinessChainOverviewMermaid(
        overview,
        catalog.businessChains,
        matchingChain?.key
      ),
    [catalog.businessChains, matchingChain?.key, overview]
  )
  const connectionCountByChain = useMemo(() => {
    const counts = new Map(
      catalog.businessChains.map((chain) => [chain.key, 0])
    )
    overview.relations.forEach((relation) => {
      counts.set(
        relation.fromChainKey,
        (counts.get(relation.fromChainKey) || 0) + 1
      )
      counts.set(
        relation.toChainKey,
        (counts.get(relation.toChainKey) || 0) + 1
      )
    })
    return counts
  }, [catalog.businessChains, overview.relations])

  return (
    <div className="erp-dev-flow-view-stack" data-business-chain-overview>
      <GuidanceDisclosure
        guidanceKey="chain-overview"
        title="总图只画链与链的衔接"
        summary="点击一条链，再按步骤查看业务单据、岗位协同、流程运行和已生效结果"
        description="这里的 12 个节点分别代表 12 条正式设计链，不会把每条链内部几十个业务单据、岗位任务、流程步骤和业务凭证挤在同一张图里。总图只说明允许怎样衔接，不是一笔业务的完整运行历史。"
      />

      <section className="erp-dev-flow-chain-heading">
        <div>
          <Text className="erp-dev-flow-eyebrow">全部业务链 · 设计总图</Text>
          <Title level={2}>{overview.label}</Title>
          <Paragraph>{overview.summary}</Paragraph>
        </div>
        <div className="erp-dev-flow-chain-heading__actions">
          <BusinessChainSelector
            catalog={catalog}
            value={overview.key}
            onChange={onSelectChain}
          />
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={onPrintCustomerReview}
          >
            导出甲方校对版
          </Button>
        </div>
      </section>

      <section
        className="erp-dev-flow-chain-runtime"
        data-runtime-overlay={runtime.status}
      >
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text strong>查看一笔任务现在走到哪里</Text>
            <Text type="secondary">
              按任务名称、任务编号或来源单号查询；总图最多只高亮这笔任务所属的一条业务链。
            </Text>
          </div>
          <Button onClick={() => onOpenView(taskId ? 'runtime' : 'workflow')}>
            {taskId ? '查看完整运行路径' : '查询任务位置'}
          </Button>
        </div>
        {!taskId ? (
          <p>
            尚未查询运行数据。当前只展示允许怎样衔接，不表示任何业务实例已经发生。
          </p>
        ) : null}
        {runtime.status === 'loading' ? (
          <div className="erp-dev-flow-loading">
            <Spin />
            <span>正在定位任务所属业务链…</span>
          </div>
        ) : null}
        {runtime.status === 'error' ? (
          <Alert
            showIcon
            type="error"
            message="所属业务链定位失败"
            description={runtime.error}
          />
        ) : null}
        {runtime.status === 'unlinked' ? (
          <Alert
            showIcon
            type="info"
            message="当前任务没有正式流程运行记录"
            description="页面不会根据任务标题或相似名称猜测它属于哪条业务链。"
          />
        ) : null}
        {runtime.status === 'ready' ? (
          <div className="erp-dev-flow-runtime-proof">
            {matchingChain ? (
              <Tag color="orange">当前实例所属链：{matchingChain.label}</Tag>
            ) : (
              <Tag>当前流程未登记到业务总图</Tag>
            )}
            <dl>
              <div>
                <dt>流程</dt>
                <dd>{getProcessLabel(runtime.context.process_instance)}</dd>
              </div>
              <div>
                <dt>来源单号</dt>
                <dd>{runtime.context.source?.no || '未声明'}</dd>
              </div>
              <div>
                <dt>查询时间</dt>
                <dd>{formatQueryTime(runtime.queriedAt)}</dd>
              </div>
            </dl>
            <strong>
              只证明定位到所属链；尚未证明上下游完成或业务事实已落账
            </strong>
            <details className="erp-dev-flow-developer-details">
              <summary>查看查询边界与开发者信息</summary>
              <dl>
                <div>
                  <dt>数据来源</dt>
                  <dd>
                    <code>workflow.get_task_process_context</code>
                  </dd>
                </div>
                <div>
                  <dt>流程实例 ID</dt>
                  <dd>
                    <KeyValue
                      value={String(runtime.context.process_instance.id)}
                    />
                  </dd>
                </div>
              </dl>
            </details>
          </div>
        ) : null}
      </section>

      <section className="erp-dev-flow-overview-map">
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text strong>业务链级总图</Text>
            <Text type="secondary">
              12 条正式设计链、4 个业务分区、{overview.relations.length}{' '}
              条明确衔接。
            </Text>
          </div>
          <Space wrap>
            {Object.entries(CHAIN_KIND_PRESENTATION).map(([key, item]) => (
              <Tag color={item.color} key={key}>
                {item.label}
              </Tag>
            ))}
          </Space>
        </div>
        <div className="erp-dev-flow-overview-graph erp-dev-docs-markdown">
          <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
        </div>

        <div className="erp-dev-flow-overview-lanes">
          {overview.lanes.map((lane) => {
            const lanePresentation = CHAIN_OVERVIEW_LANE_PRESENTATION[lane.key]
            return (
              <details
                data-overview-lane={lane.key}
                key={lane.key}
                open={lane.key === 'primary'}
              >
                <summary>
                  <span>
                    <span>
                      <Tag color={lanePresentation.color}>{lane.label}</Tag>
                      <small>{lane.summary}</small>
                    </span>
                    <strong>{lane.chainKeys.length} 条</strong>
                  </span>
                </summary>
                <ul>
                  {lane.chainKeys.map((chainKey) => {
                    const chain = chainByKey.get(chainKey)
                    const kind = CHAIN_KIND_PRESENTATION[chain.kind]
                    return (
                      <li key={chain.key}>
                        <button
                          type="button"
                          aria-label={`查看业务链：${chain.label}`}
                          data-overview-chain={chain.key}
                          data-runtime-current={
                            chain.key === matchingChain?.key || undefined
                          }
                          onClick={() => onSelectChain(chain.key)}
                        >
                          <span>
                            <strong>{chain.label}</strong>
                            <Tag color={kind.color}>{kind.label}</Tag>
                          </span>
                          <small>{chain.summary}</small>
                          <span className="erp-dev-flow-overview-connections">
                            {connectionCountByChain.get(chain.key)} 条链间衔接
                            {chain.key === matchingChain?.key
                              ? ' · 当前实例所属链'
                              : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </details>
            )
          })}
        </div>

        <details className="erp-dev-flow-overview-relations">
          <summary>查看全部链间衔接（{overview.relations.length}）</summary>
          <ul>
            {overview.relations.map((relation) => {
              const presentation = CHAIN_RELATION_PRESENTATION[relation.kind]
              return (
                <li data-overview-relation={relation.key} key={relation.key}>
                  <Tag color={presentation.color}>{presentation.label}</Tag>
                  <strong>{relation.label}</strong>
                  <span>
                    {chainByKey.get(relation.fromChainKey)?.label} →{' '}
                    {chainByKey.get(relation.toChainKey)?.label}
                  </span>
                </li>
              )
            })}
          </ul>
        </details>
        <EvidenceDisclosure value={overview} label="查看业务总图证据" />
      </section>
    </div>
  )
}

function BusinessChainView({
  catalog,
  chain,
  node,
  taskId,
  selectedTask,
  onSelectChain,
  onSelectNode,
  onOpenView,
  onPrintCustomerReview,
}) {
  const { runtime, runtimeProcessKey, matchingChain } = useBusinessChainRuntime(
    catalog,
    taskId,
    selectedTask
  )
  const currentRuntimeNode = chain?.nodes.find((item) =>
    item.processKeys.includes(runtimeProcessKey)
  )
  const relations = chain.edges.filter(
    (edge) => edge.from === node.key || edge.to === node.key
  )
  const outgoingRelations = chain.edges.filter((edge) => edge.from === node.key)
  const mermaid = useMemo(
    () => buildChainMermaid(chain, currentRuntimeNode?.key),
    [chain, currentRuntimeNode?.key]
  )
  const flowByKey = useMemo(
    () => new Map(catalog.flows.map((flow) => [flow.key, flow])),
    [catalog.flows]
  )
  const processByKey = useMemo(
    () =>
      new Map(
        catalog.processDefinitions.map((definition) => [
          definition.key,
          definition,
        ])
      ),
    [catalog.processDefinitions]
  )
  const layer = CHAIN_LAYER_PRESENTATION[node.layer]
  const nodePurpose =
    node.summary ||
    '这个步骤负责连接当前业务对象与下一环节，详细规则以对应业务对象为准。'
  const nextStepLabels = outgoingRelations
    .map((edge) => chain.nodes.find((item) => item.key === edge.to)?.label)
    .filter(Boolean)
  const completionCopy = nextStepLabels.length
    ? `${layer.completion} 接下来会衔接：${nextStepLabels.join('、')}。`
    : layer.completion

  return (
    <div className="erp-dev-flow-view-stack">
      <GuidanceDisclosure
        guidanceKey="chain"
        title="业务链先看步骤，再查运行证据"
        summary="查询任务后，只高亮真实运行到的一个步骤"
        description="业务单据、岗位协同、流程运行、已生效业务记录和计算结果各自保留权威来源，不会因为流程走完就一起显示为完成。"
      />
      <section className="erp-dev-flow-chain-heading">
        <div>
          <Text className="erp-dev-flow-eyebrow">一次只看一条业务链</Text>
          <Title level={2}>{chain.label}</Title>
          <Paragraph>{chain.summary}</Paragraph>
        </div>
        <div className="erp-dev-flow-chain-heading__actions">
          <BusinessChainSelector
            catalog={catalog}
            value={chain.key}
            onChange={onSelectChain}
          />
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={onPrintCustomerReview}
          >
            导出甲方校对版
          </Button>
        </div>
      </section>

      <section
        className="erp-dev-flow-chain-runtime"
        data-runtime-overlay={runtime.status}
      >
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text strong>查看一笔任务现在走到哪一步</Text>
            <Text type="secondary">
              按任务名称、任务编号或来源单号查询；只高亮这笔任务对应的一个流程步骤。
            </Text>
          </div>
          <Button onClick={() => onOpenView('runtime')}>
            {taskId ? '查看完整运行路径' : '查询任务位置'}
          </Button>
        </div>
        {!taskId ? (
          <p>
            尚未查询运行数据；使用任务名称、任务编号或来源单号定位，无需数据库
            ID。
          </p>
        ) : null}
        {runtime.status === 'loading' ? (
          <div className="erp-dev-flow-loading">
            <Spin />
            <span>正在读取真实流程位置…</span>
          </div>
        ) : null}
        {runtime.status === 'error' ? (
          <Alert
            showIcon
            type="error"
            message="运行叠加查询失败"
            description={runtime.error}
          />
        ) : null}
        {runtime.status === 'unlinked' ? (
          <Alert
            showIcon
            type={isDisplayOnlyWorkflowTask(selectedTask) ? 'warning' : 'info'}
            message={
              isDisplayOnlyWorkflowTask(selectedTask)
                ? '模拟展示任务没有正式流程运行记录'
                : '当前任务没有正式流程运行记录'
            }
            description="页面不会根据任务标题或相似名称猜测流程位置。"
          />
        ) : null}
        {runtime.status === 'ready' ? (
          <div className="erp-dev-flow-runtime-proof">
            {currentRuntimeNode ? (
              <Tag color="orange">当前实例位于：{currentRuntimeNode.label}</Tag>
            ) : matchingChain ? (
              <Button
                size="small"
                onClick={() => onSelectChain(matchingChain.key)}
              >
                切换到所属业务链：{matchingChain.label}
              </Button>
            ) : (
              <Tag>当前流程未登记到业务链</Tag>
            )}
            <dl>
              <div>
                <dt>流程</dt>
                <dd>{getProcessLabel(runtime.context.process_instance)}</dd>
              </div>
              <div>
                <dt>来源单号</dt>
                <dd>{runtime.context.source?.no || '未声明'}</dd>
              </div>
              <div>
                <dt>查询时间</dt>
                <dd>{formatQueryTime(runtime.queriedAt)}</dd>
              </div>
            </dl>
            <strong>尚未证明业务事实已落账</strong>
            <details className="erp-dev-flow-developer-details">
              <summary>查看查询边界与开发者信息</summary>
              <dl>
                <div>
                  <dt>数据来源</dt>
                  <dd>
                    <code>workflow.get_task_process_context</code>
                  </dd>
                </div>
                <div>
                  <dt>流程实例 ID</dt>
                  <dd>
                    <KeyValue
                      value={String(runtime.context.process_instance.id)}
                    />
                  </dd>
                </div>
              </dl>
            </details>
          </div>
        ) : null}
      </section>

      <section className="erp-dev-flow-chain-workspace">
        <div className="erp-dev-flow-chain-map">
          <div className="erp-dev-flow-section-heading">
            <div>
              <Text strong>按步骤看业务链</Text>
              <Text type="secondary">
                点击一个步骤，只在右侧查看这一步的职责、完成条件和异常处理。
              </Text>
            </div>
            <Space wrap>
              {Object.entries(CHAIN_LAYER_PRESENTATION).map(([key, item]) => (
                <Tag color={item.color} key={key}>
                  {item.label}
                </Tag>
              ))}
            </Space>
          </div>
          <ol className="erp-dev-flow-chain-steps" aria-label="业务链分层步骤">
            {chain.nodes.map((item, index) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={item.key === node.key ? 'is-selected' : ''}
                  aria-current={item.key === node.key ? 'step' : undefined}
                  data-chain-node={item.key}
                  data-chain-layer={item.layer}
                  data-runtime-current={
                    item.key === currentRuntimeNode?.key || undefined
                  }
                  onClick={() => onSelectNode(item.key)}
                >
                  <span>{index + 1}</span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{CHAIN_LAYER_PRESENTATION[item.layer].label}</small>
                  </span>
                  {item.key === currentRuntimeNode?.key ? (
                    <Tag color="orange">实例所在</Tag>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
          <div className="erp-dev-flow-chain-graph erp-dev-docs-markdown">
            <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
          </div>
        </div>
        <aside
          className="erp-dev-flow-node-detail"
          data-selected-chain-node={node.key}
        >
          <div className="erp-dev-flow-node-detail__title">
            <Tag color={layer.color}>{layer.label}</Tag>
            {node.key === currentRuntimeNode?.key ? (
              <Tag color="orange">真实实例所在区段</Tag>
            ) : null}
            <Title level={2}>{node.label}</Title>
          </div>
          <div className="erp-dev-flow-node-answers">
            <section>
              <h3>这一步做什么</h3>
              <p>{nodePurpose}</p>
            </section>
            <section>
              <h3>谁来处理</h3>
              <p>{layer.responsibility}</p>
            </section>
            <section>
              <h3>怎样算完成</h3>
              <p>{completionCopy}</p>
            </section>
            <section>
              <h3>异常时怎么办</h3>
              <p>{layer.exception}</p>
            </section>
          </div>
          <div className="erp-dev-flow-node-actions">
            {node.layer === 'workflow_task' ? (
              <Button type="primary" onClick={() => onOpenView('workflow')}>
                查看责任与任务
              </Button>
            ) : null}
            {node.processDefinitionKeys.map((key) => (
              <Button
                type="primary"
                key={key}
                onClick={() =>
                  onOpenView('runtime', { [QUERY_KEYS.process]: key })
                }
              >
                查看 {processByKey.get(key)?.label || key}
              </Button>
            ))}
            {node.factKeys.map((key) => (
              <Button
                type="primary"
                key={key}
                onClick={() => onOpenView('facts', { [QUERY_KEYS.fact]: key })}
              >
                查看{' '}
                {catalog.factDefinitions.find((fact) => fact.factKey === key)
                  ?.label || key}
              </Button>
            ))}
            {node.machineKeys.map((key) => (
              <Button
                key={key}
                onClick={() =>
                  onOpenView('states', {
                    [QUERY_KEYS.flow]: key,
                    [QUERY_KEYS.state]: null,
                  })
                }
              >
                查看 {flowByKey.get(key)?.label || key}状态规则
              </Button>
            ))}
          </div>
          <section className="erp-dev-flow-node-relations">
            <h3>这一步与哪些步骤相连</h3>
            {relations.length > 0 ? (
              <ul>
                {relations.map((edge) => {
                  const peerKey = edge.from === node.key ? edge.to : edge.from
                  const peer = chain.nodes.find((item) => item.key === peerKey)
                  return (
                    <li key={edge.key}>
                      <Tag>{CHAIN_EDGE_PRESENTATION[edge.kind]}</Tag>
                      <strong>{edge.label}</strong>
                      <span>
                        {edge.from === node.key ? '流向' : '来自'}：
                        {peer?.label || peerKey}
                      </span>
                      <details>
                        <summary>查看为什么不能直接算业务完成</summary>
                        <p>{edge.factBoundary}</p>
                        <EvidenceDisclosure value={edge} label="查看关系证据" />
                      </details>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="当前节点没有直接关系"
              />
            )}
          </section>
          <details className="erp-dev-flow-node-technical">
            <summary>查看开发者信息</summary>
            <dl>
              <div>
                <dt>内部分类</dt>
                <dd>{layer.technicalLabel}</dd>
              </div>
              <div>
                <dt>稳定 key</dt>
                <dd>
                  <KeyValue value={node.key} />
                </dd>
              </div>
            </dl>
            <EvidenceDisclosure value={node} label="查看完整节点证据" />
          </details>
        </aside>
      </section>
      <details className="erp-dev-flow-cross-cutting">
        <summary>
          查看其他公共规则与特殊情况（
          {catalog.businessChainCoverage.excludedMachineKeys.length}）
        </summary>
        <dl>
          {catalog.businessChainCoverage.excludedMachineKeys.map((key) => (
            <div key={key}>
              <dt>
                <KeyValue value={key} />
              </dt>
              <dd>{catalog.businessChainCoverage.exclusionReasons[key]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  )
}

function WorkflowView({
  taskId,
  draft,
  selectedTask,
  onDraftChange,
  onClearTask,
  onSelectTask,
}) {
  const events = useWorkflowEvents(taskId)
  const model = buildWorkflowTaskEventTrailModel({
    events: events.items,
    task: selectedTask || {},
  })
  const status = selectedTask ? getWorkflowTaskStatusMeta(selectedTask) : null
  return (
    <div className="erp-dev-flow-view-stack">
      <GuidanceDisclosure
        guidanceKey="workflow"
        title="Workflow 管“人”"
        summary="任务 done 不等于业务事实发生"
        description="它回答谁负责、谁审批、谁接棒，以及为什么阻塞或退回。任务 done 只表示协同任务结束，不证明库存、出货、质检或财务事实已经发生。"
      />
      <TaskFinder
        draft={draft}
        onDraftChange={onDraftChange}
        onClearTask={onClearTask}
        onSelectTask={onSelectTask}
        taskId={taskId}
      />
      {!taskId ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚未查询任务；请粘贴后台可见的任务名称、任务编号或来源单号"
        />
      ) : null}
      {events.status === 'loading' ? (
        <div className="erp-dev-flow-loading" role="status">
          <Spin />
          <span>正在读取任务协同记录…</span>
        </div>
      ) : null}
      {events.status === 'error' ? (
        <Alert
          showIcon
          type="error"
          message="任务协同记录读取失败"
          description={events.error}
        />
      ) : null}
      {events.status === 'ready' ? (
        <>
          <section className="erp-dev-flow-specialist-summary">
            <div className="erp-dev-flow-section-heading">
              <div>
                <Text className="erp-dev-flow-eyebrow">真实 Workflow 任务</Text>
                <Title level={2}>
                  {selectedTask
                    ? getWorkflowTaskDisplayName(selectedTask)
                    : `任务 ${taskId}`}
                </Title>
              </div>
              {status ? (
                <Tag color={status.color}>{status.label}</Tag>
              ) : (
                <Tag>状态见事件记录</Tag>
              )}
            </div>
            <dl>
              <div>
                <dt>任务类型</dt>
                <dd>
                  {selectedTask ? (
                    <>
                      <span>{getWorkflowTaskDisplayName(selectedTask)}</span>
                      <KeyValue value={selectedTask.task_group}>
                        {selectedTask.task_group}
                      </KeyValue>
                    </>
                  ) : (
                    '请通过名称或编号查询以显示任务类型'
                  )}
                </dd>
              </div>
              <div>
                <dt>负责岗位</dt>
                <dd>
                  {selectedTask
                    ? getWorkflowTaskOwnerRoleLabel(selectedTask)
                    : '从可见任务结果确认'}
                </dd>
              </div>
              <div>
                <dt>处理人</dt>
                <dd>
                  {selectedTask?.assignee_id
                    ? '已指定处理人'
                    : selectedTask
                      ? '岗位共同待办'
                      : '从可见任务结果确认'}
                </dd>
              </div>
              <div>
                <dt>来源单号</dt>
                <dd>{selectedTask?.source_no || '从可见任务结果确认'}</dd>
              </div>
              <div>
                <dt>数据来源</dt>
                <dd>workflow.list_task_events</dd>
              </div>
              <div>
                <dt>查询时间</dt>
                <dd>{formatQueryTime(events.queriedAt)}</dd>
              </div>
            </dl>
          </section>
          <Alert
            showIcon
            type="warning"
            message="Workflow task done ≠ Fact posted"
            description="即使任务显示“已完成”，仍必须到 Fact / Ledger 的权威真源确认业务结果和凭证。"
          />
          <section className="erp-dev-flow-responsibility">
            <div className="erp-dev-flow-section-heading">
              <div>
                <Text strong>当前责任</Text>
                <Text type="secondary">岗位、承接方式、状态和当前原因。</Text>
              </div>
            </div>
            <dl>
              {model.responsibilityItems.map((item) => (
                <div key={item.key}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="erp-dev-flow-events">
            <div className="erp-dev-flow-section-heading">
              <div>
                <Text strong>协同事件</Text>
                <Text type="secondary">
                  只回答这条任务如何被处理，不冒充来源单据完整审批链。
                </Text>
              </div>
              <Tag>{model.summaryLabel}</Tag>
            </div>
            {events.truncated ? (
              <Alert showIcon type="warning" message="只显示最近 100 条事件" />
            ) : null}
            {model.items.length > 0 ? (
              <ol>
                {model.items.map((item) => (
                  <li key={item.key} data-event-tone={item.tone}>
                    <span>{item.timeLabel}</span>
                    <strong>{item.label}</strong>
                    <p>
                      {item.actorLabel}
                      {item.transitionLabel ? ` · ${item.transitionLabel}` : ''}
                    </p>
                    {item.reason ? (
                      <blockquote>{item.reason}</blockquote>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="该任务暂无可见协同事件"
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

function ProcessDefinitionCard({ definition }) {
  const nodeByKey = new Map(definition.nodes.map((node) => [node.key, node]))
  const mermaid = buildProcessMermaid(definition)
  return (
    <section className="erp-dev-flow-process-definition">
      <div className="erp-dev-flow-section-heading">
        <div>
          <Text className="erp-dev-flow-eyebrow">流程定义与 variant</Text>
          <Title level={2}>{definition.label}</Title>
          <KeyValue value={definition.key} />
        </div>
        <Tag>{definition.processVersion}</Tag>
      </div>
      <GuidanceDisclosure
        guidanceKey="process-definition"
        title="这是流程定义"
        summary="不是某次运行实例"
        description={definition.guardrail}
      />
      <div className="erp-dev-flow-process-layout">
        <div className="erp-dev-flow-process-graph erp-dev-docs-markdown">
          <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
        </div>
        <ol>
          {definition.nodes.map((node, index) => (
            <li key={node.key}>
              <span>{index + 1}</span>
              <div>
                <strong>{node.label}</strong>
                <small>
                  {node.type === 'human_task' || node.type === 'approval'
                    ? '人工协同节点'
                    : node.type === 'domain_command'
                      ? '领域命令节点'
                      : '流程结束节点'}
                </small>
                {node.ownerPool ? (
                  <Tag>
                    负责岗位：
                    {getProcessOwnerPoolLabel(node.ownerPool)}
                  </Tag>
                ) : null}
                <KeyValue value={node.key} />
              </div>
            </li>
          ))}
        </ol>
      </div>
      <details>
        <summary>查看定义边与代码证据</summary>
        <ul>
          {definition.edges.map((edge) => (
            <li key={edge.key}>
              <strong>
                {nodeByKey.get(edge.from)?.label || edge.from} →{' '}
                {nodeByKey.get(edge.to)?.label || edge.to}
              </strong>
              <span>
                {edge.branchPolicy
                  ? edge.branchLabel ||
                    `转到${nodeByKey.get(edge.to)?.label || edge.to}`
                  : '顺序推进'}
              </span>
            </li>
          ))}
        </ul>
        <EvidenceDisclosure value={definition} />
      </details>
    </section>
  )
}

function RuntimeUnlinkedTaskBoundary({ task, taskId }) {
  const displayOnly = isDisplayOnlyWorkflowTask(task)
  const status = task ? getWorkflowTaskStatusMeta(task) : null
  return (
    <section
      className="erp-dev-flow-unlinked-task"
      data-task-runtime-boundary={displayOnly ? 'display-only' : 'unlinked'}
    >
      <Alert
        showIcon
        type={displayOnly ? 'warning' : 'info'}
        message={
          displayOnly
            ? '已找到任务，但它是模拟展示数据'
            : '已找到任务，但它没有正式流程轨迹'
        }
        description={
          displayOnly
            ? '这个任务只用于演示任务列表，没有关联正式 ProcessRuntime。页面不会补造流程节点，也不能据此证明业务事实已经发生。'
            : '任务记录真实存在，但未关联正式 ProcessRuntime。页面不会根据任务名称或 payload 补造流程节点。'
        }
      />
      <div className="erp-dev-flow-section-heading">
        <div>
          <Text className="erp-dev-flow-eyebrow">已找到的任务</Text>
          <Title level={2}>
            {task ? getWorkflowTaskDisplayName(task) : `任务 ${taskId}`}
          </Title>
        </div>
        {status ? (
          <Tag color={status.color}>{status.label}</Tag>
        ) : (
          <Tag>未关联正式流程</Tag>
        )}
      </div>
      <dl>
        {task ? (
          <>
            <div>
              <dt>任务编号</dt>
              <dd>{task.task_code}</dd>
            </div>
            <div>
              <dt>来源单号</dt>
              <dd>{task.source_no || '未记录来源单号'}</dd>
            </div>
            <div>
              <dt>负责岗位</dt>
              <dd>{getWorkflowTaskOwnerRoleLabel(task)}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>内部 task_id</dt>
          <dd>
            <KeyValue value={taskId} />
          </dd>
        </div>
        <div>
          <dt>流程轨迹</dt>
          <dd>未关联正式 ProcessRuntime</dd>
        </div>
      </dl>
    </section>
  )
}

function RuntimeView({
  catalog,
  definition,
  taskId,
  draft,
  selectedTask,
  onSelectDefinition,
  onDraftChange,
  onClearTask,
  onSelectTask,
}) {
  const searchProps = useDefinitionSelectSearch()
  const optionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(catalog, 'runtime'),
    [catalog]
  )
  const association = getDevFlowStateTaskRuntimeAssociation(selectedTask)
  const runtime = useRuntimeContext(taskId, association)
  const nodes = asArray(runtime.context?.nodes)
  return (
    <div className="erp-dev-flow-view-stack">
      <GuidanceDisclosure
        guidanceKey="runtime"
        title="ProcessRuntime 管“路”"
        summary="completed 不等于事实落账"
        description="它区分流程定义、流程 variant 和具体运行实例，回答走到哪里、走过什么、为何等待、失败或重试。ProcessRuntime completed 不等于业务事实已落账。"
      />
      <section className="erp-dev-flow-definition-selector">
        <label htmlFor="dev-flow-process-select">选择流程定义</label>
        <Select
          id="dev-flow-process-select"
          aria-label="选择流程定义"
          showSearch
          virtual={false}
          {...searchProps}
          filterOption={optionFilter}
          notFoundContent="没有匹配的流程定义"
          value={definition.key}
          options={catalog.processDefinitions.map((item) => ({
            value: item.key,
            label: item.label,
          }))}
          onChange={onSelectDefinition}
        />
        <Text type="secondary">
          当前登记{' '}
          {
            new Set(catalog.processDefinitions.map((item) => item.processKey))
              .size
          }{' '}
          个流程 key、{catalog.processDefinitions.length} 个
          variant；客户预览只代表设计选择。
        </Text>
      </section>
      <ProcessDefinitionCard definition={definition} />
      <section className="erp-dev-flow-runtime-query">
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text strong>定位具体运行实例</Text>
            <Text type="secondary">
              当前通用读取链只能从可见 Workflow 任务锚定实例。
            </Text>
          </div>
        </div>
        <Alert
          showIcon
          type="warning"
          message="真实流程请先用任务信息定位"
          description="粘贴任务名称、任务编号或来源单号即可，无需查询 ProcessRuntime 实例 ID。"
        />
        <TaskFinder
          draft={draft}
          onDraftChange={onDraftChange}
          onClearTask={onClearTask}
          onSelectTask={onSelectTask}
          taskId={taskId}
        />
      </section>
      {!taskId ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="无运行数据：尚未选择真实任务，当前只展示流程定义"
        />
      ) : null}
      {runtime.status === 'loading' ? (
        <div className="erp-dev-flow-loading" role="status">
          <Spin />
          <span>正在读取具体运行实例…</span>
        </div>
      ) : null}
      {runtime.status === 'error' ? (
        <Alert
          showIcon
          type="error"
          message="运行实例读取失败"
          description={runtime.error}
        />
      ) : null}
      {runtime.status === 'unlinked' ? (
        <RuntimeUnlinkedTaskBoundary task={selectedTask} taskId={taskId} />
      ) : null}
      {runtime.status === 'ready' ? (
        <section className="erp-dev-flow-runtime-instance">
          <div className="erp-dev-flow-section-heading">
            <div>
              <Text className="erp-dev-flow-eyebrow">具体运行实例</Text>
              <Title level={2}>
                {getProcessLabel(runtime.context.process_instance)}
              </Title>
            </div>
            <Tag
              color={
                PROCESS_STATUS_COLORS[runtime.context.process_instance.status]
              }
            >
              {getProcessStatusLabel(runtime.context.process_instance)}
            </Tag>
          </div>
          <dl>
            <div>
              <dt>实例 ID</dt>
              <dd>
                <KeyValue value={String(runtime.context.process_instance.id)} />
              </dd>
            </div>
            <div>
              <dt>流程 key</dt>
              <dd>
                <KeyValue
                  value={runtime.context.process_instance.process_key}
                />
              </dd>
            </div>
            <div>
              <dt>流程版本</dt>
              <dd>{runtime.context.process_instance.process_version}</dd>
            </div>
            <div>
              <dt>来源单号</dt>
              <dd>{runtime.context.source?.no || '未声明'}</dd>
            </div>
            <div>
              <dt>发起时间</dt>
              <dd>
                {formatProcessStartedAt(
                  runtime.context.process_instance.started_at
                )}
              </dd>
            </div>
            <div>
              <dt>数据来源</dt>
              <dd>workflow.get_task_process_context</dd>
            </div>
            <div>
              <dt>查询时间</dt>
              <dd>{formatQueryTime(runtime.queriedAt)}</dd>
            </div>
          </dl>
          <Alert
            showIcon
            type="warning"
            message="尚未证明业务事实已落账"
            description="下面的 completed 只属于 ProcessRuntime 节点；不会把 Workflow 或 Fact / Ledger 节点一并标成完成。"
          />
          <ol className="erp-dev-flow-runtime-nodes">
            {nodes.map((node) => (
              <li
                key={node.id}
                data-node-status={node.status}
                aria-current={
                  ['active', 'blocked'].includes(node.status)
                    ? 'step'
                    : undefined
                }
              >
                <span>
                  {node.status === 'completed' ? (
                    <CheckCircleOutlined />
                  ) : node.status === 'blocked' ? (
                    <ExclamationCircleOutlined />
                  ) : (
                    <ClockCircleOutlined />
                  )}
                </span>
                <div>
                  <strong>{getProcessNodeLabel(node)}</strong>
                  <KeyValue value={node.node_key} />
                  <small>尝试次数：{node.attempt || 1}</small>
                </div>
                <Tag color={PROCESS_STATUS_COLORS[node.status]}>
                  {getProcessNodeStatusLabel(node)}
                </Tag>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

function FactsView({ catalog, fact, onSelectFact, onOpenState }) {
  const searchProps = useDefinitionSelectSearch()
  const options = useMemo(
    () => buildFactDefinitionSelectOptions(catalog),
    [catalog]
  )
  const optionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(catalog, 'facts'),
    [catalog]
  )
  return (
    <div className="erp-dev-flow-view-stack">
      <GuidanceDisclosure
        guidanceKey="facts"
        title="Fact / Ledger 管“账”"
        summary="流程完成不能替代事实凭证"
        description="它回答什么业务结果已经正式生效、权威真源在哪里、凭证和纠正方式是什么。Workflow 或 ProcessRuntime 的完成状态都不能替代事实凭证。"
      />
      <Alert
        showIcon
        type="warning"
        message={catalog.factRuntimeQuery.label}
        description={catalog.factRuntimeQuery.reason}
      />
      <section className="erp-dev-flow-definition-selector">
        <label htmlFor="dev-flow-fact-select">选择事实定义</label>
        <Select
          id="dev-flow-fact-select"
          aria-label="选择事实定义"
          showSearch
          virtual={false}
          {...searchProps}
          classNames={DEFINITION_SELECT_CLASS_NAMES}
          filterOption={optionFilter}
          notFoundContent="没有匹配的事实定义"
          value={fact.factKey}
          options={options}
          optionRender={renderDefinitionSelectOption}
          onChange={onSelectFact}
        />
        <Text type="secondary">
          只展示当前代码核实的定义；不提供 mock 运行凭证或伪造凭证搜索。
        </Text>
      </section>
      <section
        className="erp-dev-flow-fact-detail"
        data-selected-fact={fact.factKey}
      >
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text className="erp-dev-flow-eyebrow">Fact / Ledger 定义</Text>
            <Title level={2}>{fact.label}</Title>
            <KeyValue value={fact.factKey} />
          </div>
          <Tag color="red">定义证据</Tag>
        </div>
        <dl>
          <div>
            <dt>正式发生条件</dt>
            <dd>{fact.occurrenceCondition}</dd>
          </div>
          <div>
            <dt>来源单据</dt>
            <dd>{fact.sourceDocument}</dd>
          </div>
          <div>
            <dt>权威真源</dt>
            <dd>{fact.authority}</dd>
          </div>
          <div>
            <dt>业务影响</dt>
            <dd>{fact.businessImpact}</dd>
          </div>
          <div>
            <dt>事实凭证</dt>
            <dd>{fact.voucher}</dd>
          </div>
          <div>
            <dt>幂等规则</dt>
            <dd>{fact.idempotencyRule}</dd>
          </div>
          <div>
            <dt>纠正方式</dt>
            <dd>{fact.correction}</dd>
          </div>
        </dl>
        <Button onClick={() => onOpenState(fact.machineKey)}>
          查看对应状态规则
        </Button>
        <EvidenceDisclosure value={fact} />
      </section>
    </div>
  )
}

function StatePathLegend({ groups }) {
  if (groups.length === 0) return null
  return (
    <section
      className="erp-dev-flow-state-path-legend"
      aria-labelledby="dev-flow-state-path-legend-title"
    >
      <div>
        <Text strong id="dev-flow-state-path-legend-title">
          图和清单怎么读
        </Text>
        <Text type="secondary">
          图中的彩色线和短标签共同区分路径；清单再解释条件和影响边界，不只靠颜色判断。
        </Text>
      </div>
      <div role="list">
        {groups.map((group) => (
          <article
            key={group.key}
            role="listitem"
            data-path-group={group.key}
            style={{ '--erp-dev-state-path-color': group.diagramStroke }}
          >
            <span aria-hidden="true" />
            <strong>{group.label}</strong>
            <small>{group.description}</small>
          </article>
        ))}
      </div>
    </section>
  )
}

function StateRuleRelatedViews({ relatedViews, onOpenView }) {
  const hasTargets =
    relatedViews.direct.length > 0 ||
    relatedViews.facts.length > 0 ||
    relatedViews.chains.length > 0
  if (!hasTargets) return null

  const openTarget = (target) => {
    if (target.type === 'chain') {
      onOpenView('chain', {
        [QUERY_KEYS.chain]: target.chainKey,
        [QUERY_KEYS.node]: target.nodeKey,
      })
    } else if (target.type === 'facts') {
      onOpenView('facts', { [QUERY_KEYS.fact]: target.factKey })
    } else {
      onOpenView(target.type)
    }
  }

  const chainPicker = (
    <div className="erp-dev-flow-state-related-chain-picker">
      {relatedViews.chains.map((target) => (
        <Button
          key={target.key}
          type="text"
          onClick={() => openTarget(target)}
          data-related-chain={target.chainKey}
        >
          <strong>{target.chainLabel}</strong>
          <small>{target.nodeLabel}</small>
        </Button>
      ))}
    </div>
  )

  return (
    <section className="erp-dev-flow-state-related-views">
      <div>
        <Text strong>要看实际原因或完整影响</Text>
        <Text type="secondary">
          状态规则只说明“允许怎样变化”；实际办理、运行位置和已生效结果回到对应视图核对。
        </Text>
      </div>
      <div className="erp-dev-flow-state-related-actions">
        {relatedViews.direct.map((target) => (
          <Button
            key={target.key}
            icon={
              target.type === 'workflow' ? (
                <TeamOutlined />
              ) : (
                <PartitionOutlined />
              )
            }
            onClick={() => openTarget(target)}
            data-related-view={target.type}
          >
            {target.label}
          </Button>
        ))}
        {relatedViews.facts.map((target) => (
          <Button
            key={target.key}
            icon={<DatabaseOutlined />}
            onClick={() => openTarget(target)}
            data-related-view="facts"
          >
            查看{target.label}
          </Button>
        ))}
        {relatedViews.chains.length === 1 ? (
          <Button
            icon={<SearchOutlined />}
            onClick={() => openTarget(relatedViews.chains[0])}
            data-related-view="chain"
          >
            查看相关业务链
          </Button>
        ) : null}
        {relatedViews.chains.length > 1 ? (
          <Popover
            trigger="click"
            placement="bottomRight"
            title="选择业务链位置"
            content={chainPicker}
          >
            <Button icon={<SearchOutlined />} data-related-view="chain">
              相关业务链（{relatedViews.chains.length}）
            </Button>
          </Popover>
        ) : null}
      </div>
    </section>
  )
}

function StateTransitionCard({
  flow,
  index,
  scope,
  selectedStateKey,
  stateByKey,
  transition,
}) {
  const presentation = getDevFlowStateTransitionPresentation(flow, transition)
  const actionCoveredByPathKind = presentation.pathKinds.some(
    (item) =>
      item.label.includes(presentation.actionLabel) ||
      presentation.actionLabel.includes(item.label)
  )
  const selectedRelated =
    Boolean(selectedStateKey) &&
    (transition.from === selectedStateKey || transition.to === selectedStateKey)
  return (
    <li
      data-transition-key={transition.key}
      data-path-group={presentation.groupKey}
      data-exceptional={presentation.isExceptional ? 'true' : 'false'}
      data-selected-related={selectedRelated ? 'true' : 'false'}
      style={{
        '--erp-dev-state-path-color': presentation.group.diagramStroke,
      }}
    >
      <header className="erp-dev-flow-transition-heading">
        <span aria-hidden="true">{index + 1}</span>
        <strong>
          {stateByKey.get(transition.from)?.label || transition.from} →{' '}
          {stateByKey.get(transition.to)?.label || transition.to}
        </strong>
        <span className="erp-dev-flow-transition-tags">
          {!actionCoveredByPathKind ? (
            <Tag>{presentation.actionLabel}</Tag>
          ) : null}
          {presentation.pathKinds.map((item) => (
            <Tag key={item.key} color={item.color}>
              {item.label}
            </Tag>
          ))}
          {presentation.conditional ? <Tag color="gold">条件适用</Tag> : null}
        </span>
      </header>
      <dl className="erp-dev-flow-transition-explanation">
        <div>
          <dt>什么时候可以</dt>
          <dd>{transition.guard || '按对应领域合同校验。'}</dd>
        </div>
        <div>
          <dt>转换后到哪里</dt>
          <dd>{presentation.destinationSummary}</dd>
        </div>
        <div>
          <dt>这条路径代表什么</dt>
          <dd>{presentation.group.description}</dd>
        </div>
        <div>
          <dt>影响边界</dt>
          <dd>
            {scope
              ? `${scope.label}：${scope.guardrail}`
              : '影响范围回到当前对象的正式领域合同核对。'}
          </dd>
        </div>
      </dl>
      {presentation.condition ? (
        <p className="erp-dev-flow-transition-condition">
          <InfoCircleOutlined />
          <span>
            <strong>仅在以下条件归入该路径：</strong>
            {presentation.condition}
          </span>
        </p>
      ) : null}
      <details>
        <summary>查看内部规则</summary>
        <dl>
          <div>
            <dt>action</dt>
            <dd>
              <KeyValue value={transition.action} />
            </dd>
          </div>
          <div>
            <dt>内部影响边界</dt>
            <dd>{transition.factBoundary}</dd>
          </div>
          <div>
            <dt>权限</dt>
            <dd>
              {asArray(transition.permission).join('、') || '无额外权限声明'}
            </dd>
          </div>
        </dl>
        <EvidenceDisclosure value={transition} />
      </details>
    </li>
  )
}

function StateRulesView({
  catalog,
  flow,
  state,
  onSelectFlow,
  onSelectState,
  onOpenView,
}) {
  const [transitionFilter, setTransitionFilter] = useState(
    DEV_FLOW_STATE_TRANSITION_FILTERS.all
  )
  const searchProps = useDefinitionSelectSearch()
  const options = useMemo(
    () => buildStateDefinitionSelectOptions(catalog),
    [catalog]
  )
  const optionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(catalog, 'stateOptions'),
    [catalog]
  )
  const stateByKey = useMemo(
    () => new Map(flow.states.map((item) => [item.key, item])),
    [flow]
  )
  const stateSummaries = useMemo(
    () =>
      new Map(
        flow.states.map((item) => [
          item.key,
          buildDevFlowStateNodeSummary(flow, item),
        ])
      ),
    [flow]
  )
  const selectedStateSummary = state ? stateSummaries.get(state.key) : null
  const summary = useMemo(() => buildDevFlowStateRuleSummary(flow), [flow])
  const pathGroups = useMemo(() => listDevFlowStatePathGroups(flow), [flow])
  const scope = useMemo(
    () => catalog.scopes.find((item) => item.key === flow.scopeKey) || null,
    [catalog.scopes, flow.scopeKey]
  )
  const relatedViews = useMemo(
    () => buildDevFlowStateRelatedViews(catalog, flow),
    [catalog, flow]
  )
  const visibleTransitions = useMemo(
    () => filterDevFlowStateTransitions(flow, state?.key, transitionFilter),
    [flow, state?.key, transitionFilter]
  )
  const transitionOrder = useMemo(
    () => new Map(flow.transitions.map((item, index) => [item.key, index])),
    [flow]
  )
  const relatedTransitionCount = state
    ? filterDevFlowStateTransitions(
        flow,
        state.key,
        DEV_FLOW_STATE_TRANSITION_FILTERS.related
      ).length
    : 0
  const filterOptions = [
    {
      key: DEV_FLOW_STATE_TRANSITION_FILTERS.all,
      label: '全部',
      count: summary.transitionCount,
    },
    ...(summary.exceptionalTransitionCount > 0
      ? [
          {
            key: DEV_FLOW_STATE_TRANSITION_FILTERS.exceptional,
            label: '异常与纠正',
            count: summary.exceptionalTransitionCount,
          },
        ]
      : []),
    ...(state
      ? [
          {
            key: DEV_FLOW_STATE_TRANSITION_FILTERS.related,
            label: '当前状态',
            count: relatedTransitionCount,
          },
        ]
      : []),
  ]
  const mermaid = useMemo(() => buildDevFlowStateRuleMermaid(flow), [flow])

  useEffect(() => {
    setTransitionFilter(
      state
        ? DEV_FLOW_STATE_TRANSITION_FILTERS.related
        : DEV_FLOW_STATE_TRANSITION_FILTERS.all
    )
  }, [flow.key, state])

  return (
    <div className="erp-dev-flow-view-stack">
      <GuidanceDisclosure
        guidanceKey="states"
        title="状态机管“规则”"
        summary="规则视图不是运行实例或事实凭证"
        description="它回答当前所选对象有哪些状态、允许怎样转换，以及取消、退回、冲正或返工后到哪里。这里只展示这个对象自己的合法转换，不把另一个对象的异常结果补造成它的状态；实际发生了什么仍回到任务、运行路径或已生效结果核对。"
      />
      <section className="erp-dev-flow-definition-selector">
        <label htmlFor="dev-flow-state-select">选择状态对象</label>
        <Select
          id="dev-flow-state-select"
          aria-label="选择状态对象"
          showSearch
          virtual={false}
          {...searchProps}
          classNames={DEFINITION_SELECT_CLASS_NAMES}
          filterOption={optionFilter}
          notFoundContent="没有匹配的状态对象"
          value={flow.key}
          options={options}
          optionRender={renderDefinitionSelectOption}
          onChange={onSelectFlow}
        />
      </section>
      <section
        className="erp-dev-flow-state-rule"
        data-selected-flow={flow.key}
      >
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text className="erp-dev-flow-eyebrow">状态规则定义</Text>
            <Title level={2}>{flow.label}</Title>
            <KeyValue value={flow.key} />
          </div>
          <Tag color="green">只读规则</Tag>
        </div>
        <Paragraph>{flow.summary}</Paragraph>
        <div
          className="erp-dev-flow-state-overview"
          role="list"
          aria-label={`${flow.label}状态规则概览`}
        >
          <article role="listitem">
            <strong>{summary.stateCount}</strong>
            <span>个状态</span>
          </article>
          <article role="listitem">
            <strong>{summary.transitionCount}</strong>
            <span>条合法转换</span>
          </article>
          <article role="listitem">
            <strong>{summary.exceptionalTransitionCount}</strong>
            <span>条异常或纠正路径</span>
          </article>
          <article role="listitem">
            <strong>{summary.terminalCount}</strong>
            <span>{summary.terminalPolicyLabel}</span>
          </article>
        </div>
        <section className="erp-dev-flow-state-boundary">
          <SafetyCertificateOutlined />
          <div>
            <strong>{scope?.label || '当前对象'}的规则边界</strong>
            <p>{flow.guard}</p>
            {scope?.guardrail ? <small>{scope.guardrail}</small> : null}
          </div>
        </section>
        <StatePathLegend groups={pathGroups} />
        <div className="erp-dev-flow-state-layout">
          <div
            className="erp-dev-flow-state-graph erp-dev-docs-markdown"
            role="region"
            aria-label={`${flow.label}状态转换图`}
          >
            <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
          </div>
          <div className="erp-dev-flow-state-list">
            <div className="erp-dev-flow-state-list__heading">
              <h3>选择状态</h3>
              <small>点击后聚焦相关转换，再次点击可取消聚焦。</small>
            </div>
            <ul>
              {flow.states.map((item) => {
                const itemSummary = stateSummaries.get(item.key)
                const selected = item.key === state?.key
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={selected ? 'is-selected' : ''}
                      aria-pressed={selected}
                      aria-label={`${item.label}，${itemSummary.positionLabel}，${itemSummary.incoming.length} 条进入，${itemSummary.outgoing.length} 条离开；${selected ? '取消聚焦' : '查看相关转换'}`}
                      data-state-position={
                        itemSummary.initial
                          ? 'initial'
                          : itemSummary.terminal
                            ? 'terminal'
                            : 'middle'
                      }
                      onClick={() => onSelectState(selected ? null : item.key)}
                    >
                      <strong>{item.label}</strong>
                      <KeyValue value={item.key} copyable={false} />
                      <span>
                        {itemSummary.positionLabel} ·{' '}
                        {itemSummary.incoming.length} 条进入 ·{' '}
                        {itemSummary.outgoing.length} 条离开
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
        {state ? (
          <section className="erp-dev-flow-selected-state">
            <div>
              <Text className="erp-dev-flow-eyebrow">当前选择</Text>
              <h3>{state.label}</h3>
              <KeyValue value={state.key} />
            </div>
            <div className="erp-dev-flow-selected-state__meaning">
              <p>
                {state.summary ||
                  '目录未提供额外说明，请结合允许进入和离开的转换理解。'}
              </p>
              <dl>
                <div>
                  <dt>状态位置</dt>
                  <dd>{selectedStateSummary?.positionLabel}</dd>
                </div>
                <div>
                  <dt>如何进入</dt>
                  <dd>
                    {selectedStateSummary?.incoming.length || 0} 条登记路径
                    {selectedStateSummary?.incomingExceptionalCount
                      ? `，其中 ${selectedStateSummary.incomingExceptionalCount} 条属于异常或纠正`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt>怎样离开</dt>
                  <dd>
                    {selectedStateSummary?.outgoing.length || 0} 条登记路径
                    {selectedStateSummary?.outgoingExceptionalCount
                      ? `，其中 ${selectedStateSummary.outgoingExceptionalCount} 条属于异常或纠正`
                      : ''}
                  </dd>
                </div>
              </dl>
            </div>
            <EvidenceDisclosure value={state} />
          </section>
        ) : null}
        <StateRuleRelatedViews
          relatedViews={relatedViews}
          onOpenView={onOpenView}
        />
        <section className="erp-dev-flow-transitions">
          <div className="erp-dev-flow-transition-toolbar">
            <div>
              <Text strong>允许的状态转换</Text>
              <Text type="secondary">
                先看条件、结果和影响边界；内部 action、权限与代码证据按需展开。
              </Text>
            </div>
            <div
              className="erp-dev-flow-transition-filters"
              role="group"
              aria-label="状态转换筛选"
            >
              {filterOptions.map((option) => (
                <Button
                  key={option.key}
                  size="small"
                  type={transitionFilter === option.key ? 'primary' : 'default'}
                  aria-pressed={transitionFilter === option.key}
                  onClick={() => setTransitionFilter(option.key)}
                >
                  {option.label} {option.count}
                </Button>
              ))}
            </div>
            <Text
              className="erp-dev-flow-transition-result-count"
              type="secondary"
              role="status"
              aria-live="polite"
            >
              当前显示 {visibleTransitions.length} / {summary.transitionCount}{' '}
              条
            </Text>
          </div>
          {visibleTransitions.length > 0 ? (
            <ol>
              {visibleTransitions.map((transition) => (
                <StateTransitionCard
                  key={transition.key}
                  flow={flow}
                  index={transitionOrder.get(transition.key) || 0}
                  scope={scope}
                  selectedStateKey={state?.key || ''}
                  stateByKey={stateByKey}
                  transition={transition}
                />
              ))}
            </ol>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前筛选下没有登记的转换；这不表示可以任意改状态。"
            />
          )}
        </section>
        <EvidenceDisclosure value={flow} label="查看状态机证据" />
      </section>
    </div>
  )
}

function invalidQueryMessages(searchParams, catalog) {
  const messages = []
  for (const key of new Set(searchParams.keys())) {
    if (!KNOWN_QUERY_KEYS.has(key)) messages.push(`未知 query 参数：${key}`)
    if (searchParams.getAll(key).length > 1) {
      messages.push(`query 参数重复：${key}`)
    }
  }
  const view = cleanText(searchParams.get(QUERY_KEYS.view))
  const chainKey = cleanText(searchParams.get(QUERY_KEYS.chain))
  const nodeKey = cleanText(searchParams.get(QUERY_KEYS.node))
  const flowKey = cleanText(searchParams.get(QUERY_KEYS.flow))
  const stateKey = cleanText(searchParams.get(QUERY_KEYS.state))
  const processKey = cleanText(searchParams.get(QUERY_KEYS.process))
  const factKey = cleanText(searchParams.get(QUERY_KEYS.fact))
  const taskId = cleanText(searchParams.get(QUERY_KEYS.taskId))
  const chain = catalog.businessChains.find((item) => item.key === chainKey)
  const overviewSelected = chainKey === catalog.businessChainOverview.key
  const flow = catalog.flows.find((item) => item.key === flowKey)
  const activeView = view || DEFAULT_VIEW

  if (view && !VIEW_KEYS.has(view)) messages.push(`未知视图：${view}`)
  if (VIEW_KEYS.has(activeView)) {
    const allowedSelectionKeys = VIEW_SELECTION_QUERY_KEYS[activeView]
    for (const key of SELECTION_QUERY_KEYS) {
      if (
        cleanText(searchParams.get(key)) &&
        !allowedSelectionKeys.includes(key)
      ) {
        messages.push(`${VIEW_META[activeView].label}视图不接受参数：${key}`)
      }
    }
  }
  if (chainKey && !chain && !overviewSelected) {
    messages.push(`未知或过期业务链：${chainKey}`)
  }
  if (nodeKey && !chainKey) messages.push('链路节点缺少所属业务链')
  if (nodeKey && overviewSelected) {
    messages.push('业务总图不接受单链节点参数')
  }
  if (nodeKey && chain && !chain.nodes.some((item) => item.key === nodeKey)) {
    messages.push(`业务链中不存在节点：${nodeKey}`)
  }
  if (flowKey && !flow) messages.push(`未知状态对象：${flowKey}`)
  if (stateKey && !flowKey) messages.push('状态 key 缺少所属状态对象')
  if (stateKey && flow && !flow.states.some((item) => item.key === stateKey)) {
    messages.push(`状态对象中不存在状态：${stateKey}`)
  }
  if (
    processKey &&
    !catalog.processDefinitions.some((item) => item.key === processKey)
  ) {
    messages.push(`未知流程 variant：${processKey}`)
  }
  if (
    factKey &&
    !catalog.factDefinitions.some((item) => item.factKey === factKey)
  ) {
    messages.push(`未知 Fact Key：${factKey}`)
  }
  if (taskId && !parseDevFlowStateTaskIDReference(taskId)) {
    messages.push('task_id 必须是大于 0 的整数')
  }
  return [...new Set(messages)]
}

export default function DevFlowStateObservatoryPage() {
  const catalogState = useFlowStateCatalog()
  const { catalog } = catalogState
  const [searchParams, setSearchParams] = useSearchParams()
  const queryCanonicalization = useMemo(
    () => canonicalizeDevFlowStateSearchParams(searchParams),
    [searchParams]
  )
  const activeSearchParams = queryCanonicalization.searchParams
  const requestedView = cleanText(activeSearchParams.get(QUERY_KEYS.view))
  const view = requestedView || DEFAULT_VIEW
  const requestedChainKey = cleanText(activeSearchParams.get(QUERY_KEYS.chain))
  const requestedNodeKey = cleanText(activeSearchParams.get(QUERY_KEYS.node))
  const requestedFlowKey = cleanText(activeSearchParams.get(QUERY_KEYS.flow))
  const requestedStateKey = cleanText(activeSearchParams.get(QUERY_KEYS.state))
  const requestedProcessKey = cleanText(
    activeSearchParams.get(QUERY_KEYS.process)
  )
  const requestedFactKey = cleanText(activeSearchParams.get(QUERY_KEYS.fact))
  const taskId = cleanText(activeSearchParams.get(QUERY_KEYS.taskId))
  const [taskDraft, setTaskDraft] = useState(taskId)
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskLookupFocusRequest, setTaskLookupFocusRequest] = useState(0)
  const [customerReviewGeneratedAt, setCustomerReviewGeneratedAt] = useState(
    () => new Date().toISOString()
  )
  const taskSelectionRef = useRef(taskId)
  const chainReturnRef = useRef({
    [QUERY_KEYS.chain]: requestedChainKey || ALL_BUSINESS_CHAINS_KEY,
    [QUERY_KEYS.node]: requestedNodeKey || null,
  })

  useEffect(() => {
    if (taskSelectionRef.current === taskId) return
    taskSelectionRef.current = taskId
    setSelectedTask(null)
    setTaskDraft(taskId)
  }, [taskId])

  const updateParams = useCallback(
    (patch, options = {}) => {
      setSearchParams(patchParams(activeSearchParams, patch), {
        replace: options.replace === true,
      })
    },
    [activeSearchParams, setSearchParams]
  )

  const invalidMessages = catalog
    ? invalidQueryMessages(activeSearchParams, catalog)
    : []
  const valid = invalidMessages.length === 0

  useEffect(() => {
    if (!queryCanonicalization.changed) return
    setSearchParams(queryCanonicalization.searchParams, { replace: true })
  }, [queryCanonicalization, setSearchParams])

  useEffect(() => {
    if (!catalog || !valid || view !== 'chain') return
    chainReturnRef.current = {
      [QUERY_KEYS.chain]:
        requestedChainKey || catalog.businessChainOverview.key,
      [QUERY_KEYS.node]:
        requestedChainKey === catalog.businessChainOverview.key
          ? null
          : requestedNodeKey || null,
    }
  }, [catalog, requestedChainKey, requestedNodeKey, valid, view])

  useEffect(() => {
    if (taskLookupFocusRequest === 0 || view !== 'workflow' || !valid) return
    const input = document.getElementById('dev-flow-task-search')
    if (!input) return
    input.scrollIntoView({ behavior: 'auto', block: 'center' })
    input.focus({ preventScroll: true })
  }, [taskLookupFocusRequest, valid, view])

  const overviewSelected = catalog
    ? !requestedChainKey ||
      requestedChainKey === catalog.businessChainOverview.key
    : false
  const chain = catalog
    ? catalog.businessChains.find((item) => item.key === requestedChainKey) ||
      null
    : null
  const node = chain
    ? chain.nodes.find((item) => item.key === requestedNodeKey) ||
      (!requestedNodeKey ? chain.nodes[0] : null)
    : null
  const flow = catalog
    ? catalog.flows.find((item) => item.key === requestedFlowKey) ||
      (!requestedFlowKey ? catalog.flows[0] : null)
    : null
  const state =
    flow && requestedStateKey
      ? flow.states.find((item) => item.key === requestedStateKey)
      : null
  const definition = catalog
    ? catalog.processDefinitions.find(
        (item) => item.key === requestedProcessKey
      ) || (!requestedProcessKey ? catalog.processDefinitions[0] : null)
    : null
  const fact = catalog
    ? catalog.factDefinitions.find(
        (item) => item.factKey === requestedFactKey
      ) || (!requestedFactKey ? catalog.factDefinitions[0] : null)
    : null
  const customerReview = useMemo(() => {
    if (!catalog || !valid || view !== 'chain') return null
    const chainKey = overviewSelected
      ? catalog.businessChainOverview.key
      : chain?.key
    if (!chainKey) return null
    return buildDevBusinessChainCustomerReview({
      catalog,
      chainKey,
      generatedAt: customerReviewGeneratedAt,
    })
  }, [
    catalog,
    chain?.key,
    customerReviewGeneratedAt,
    overviewSelected,
    valid,
    view,
  ])

  useEffect(() => {
    if (!catalog || !valid) return
    const patch = {}
    if (!requestedView) patch[QUERY_KEYS.view] = DEFAULT_VIEW
    if (view === 'chain' && !requestedChainKey) {
      patch[QUERY_KEYS.chain] = catalog.businessChainOverview.key
    }
    if (view === 'chain' && !overviewSelected && !requestedNodeKey && node) {
      patch[QUERY_KEYS.node] = node.key
    }
    if (view === 'states' && !requestedFlowKey && flow) {
      patch[QUERY_KEYS.flow] = flow.key
    }
    if (view === 'runtime' && !requestedProcessKey && definition) {
      patch[QUERY_KEYS.process] = definition.key
    }
    if (view === 'facts' && !requestedFactKey && fact) {
      patch[QUERY_KEYS.fact] = fact.factKey
    }
    if (Object.keys(patch).length > 0) updateParams(patch, { replace: true })
  }, [
    catalog,
    chain,
    definition,
    fact,
    flow,
    node,
    overviewSelected,
    requestedChainKey,
    requestedFactKey,
    requestedFlowKey,
    requestedNodeKey,
    requestedProcessKey,
    requestedView,
    updateParams,
    valid,
    view,
  ])

  const selectTask = (nextTaskId, task) => {
    taskSelectionRef.current = String(nextTaskId)
    setSelectedTask(task || null)
    updateParams({ [QUERY_KEYS.taskId]: String(nextTaskId) })
  }
  const clearTask = () => {
    taskSelectionRef.current = ''
    setSelectedTask(null)
    updateParams({ [QUERY_KEYS.taskId]: null })
  }
  const openView = (nextView, patch = {}) => {
    const allowedSelectionKeys = VIEW_SELECTION_QUERY_KEYS[nextView] || []
    const nextPatch = Object.fromEntries(
      SELECTION_QUERY_KEYS.map((key) => [key, null])
    )
    nextPatch[QUERY_KEYS.view] = nextView
    if (nextView === 'chain') {
      Object.assign(nextPatch, chainReturnRef.current)
    }
    for (const [key, value] of Object.entries(patch)) {
      if (allowedSelectionKeys.includes(key) || key === QUERY_KEYS.taskId) {
        nextPatch[key] = value
      }
    }
    updateParams(nextPatch)
  }
  const printCustomerReview = async () => {
    setCustomerReviewGeneratedAt(new Date().toISOString())
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
    })
    await new Promise((resolve) => {
      const startedAt = window.performance.now()
      const checkDiagram = () => {
        const status = document
          .querySelector(
            '[data-customer-review-print-root] [data-customer-review-diagram] .erp-markdown-mermaid'
          )
          ?.getAttribute('data-mermaid-status')
        if (
          status === 'rendered' ||
          status === 'error' ||
          window.performance.now() - startedAt >= 5_000
        ) {
          resolve()
          return
        }
        window.requestAnimationFrame(checkDiagram)
      }
      checkDiagram()
    })
    window.print()
  }
  const specialistSelection =
    view === 'runtime'
      ? definition?.label
      : view === 'facts'
        ? fact?.label
        : view === 'states'
          ? flow?.label
          : ''

  const renderView = () => {
    if (!catalog || !flow || !definition || !fact) {
      return null
    }
    if (view === 'chain') {
      if (overviewSelected) {
        return (
          <BusinessChainOverviewView
            catalog={catalog}
            taskId={taskId}
            selectedTask={selectedTask}
            onSelectChain={(key) =>
              updateParams({
                [QUERY_KEYS.chain]: key,
                [QUERY_KEYS.node]: null,
              })
            }
            onOpenView={openView}
            onPrintCustomerReview={printCustomerReview}
          />
        )
      }
      if (!chain || !node) return null
      return (
        <BusinessChainView
          catalog={catalog}
          chain={chain}
          node={node}
          taskId={taskId}
          selectedTask={selectedTask}
          onSelectChain={(key) =>
            updateParams({ [QUERY_KEYS.chain]: key, [QUERY_KEYS.node]: null })
          }
          onSelectNode={(key) => updateParams({ [QUERY_KEYS.node]: key })}
          onOpenView={openView}
          onPrintCustomerReview={printCustomerReview}
        />
      )
    }
    if (view === 'workflow') {
      return (
        <WorkflowView
          taskId={taskId}
          draft={taskDraft}
          selectedTask={selectedTask}
          onDraftChange={setTaskDraft}
          onClearTask={clearTask}
          onSelectTask={selectTask}
        />
      )
    }
    if (view === 'runtime') {
      return (
        <RuntimeView
          catalog={catalog}
          definition={definition}
          taskId={taskId}
          draft={taskDraft}
          selectedTask={selectedTask}
          onSelectDefinition={(key) =>
            updateParams({ [QUERY_KEYS.process]: key })
          }
          onDraftChange={setTaskDraft}
          onClearTask={clearTask}
          onSelectTask={selectTask}
        />
      )
    }
    if (view === 'facts') {
      return (
        <FactsView
          catalog={catalog}
          fact={fact}
          onSelectFact={(key) => updateParams({ [QUERY_KEYS.fact]: key })}
          onOpenState={(key) =>
            openView('states', {
              [QUERY_KEYS.flow]: key,
              [QUERY_KEYS.state]: null,
            })
          }
        />
      )
    }
    return (
      <StateRulesView
        catalog={catalog}
        flow={flow}
        state={state}
        onSelectFlow={(key) =>
          updateParams({ [QUERY_KEYS.flow]: key, [QUERY_KEYS.state]: null })
        }
        onSelectState={(key) => updateParams({ [QUERY_KEYS.state]: key })}
        onOpenView={openView}
      />
    )
  }

  return (
    <div
      className="erp-dev-flow-state-page erp-dev-workspace-page"
      data-dev-flow-state-observatory
      data-catalog-status={catalogState.status}
    >
      <DevPageNav sourcePath={SOURCE_PATH} />
      <header className="erp-dev-flow-header">
        <div className="erp-dev-flow-header__primary">
          <div className="erp-dev-flow-header__intro">
            <Space align="center" wrap>
              <PartitionOutlined className="erp-dev-flow-header__icon" />
              <Title level={1}>业务链与运行观察台</Title>
              <Tag color="green">仅开发环境 · 只读</Tag>
            </Space>
            <Paragraph>
              先看客户、产品等基础信息和销售、采购等业务单据怎样沿 12
              条业务链，经过责任协同、流程运行和受控业务动作形成事实台账与计算结果；状态规则、权限、客户配置与审计贯穿全程。
            </Paragraph>
          </div>
          <div className="erp-dev-flow-readonly">
            <SafetyCertificateOutlined />
            <span>
              <strong>不执行真实业务动作</strong>
              <small>无过账 · 无付款 · 无冲正 · 无流程推进</small>
            </span>
          </div>
        </div>
        <details className="erp-dev-flow-concepts">
          <summary>
            <span>概念解释</span>
            <small>
              资料、单据、人、路、动作、账、规则和横切控制各自负责什么
            </small>
          </summary>
          <MemoryStrip />
        </details>
      </header>
      {catalogState.status === 'ready' && catalog ? (
        <details className="erp-dev-flow-definition-tools">
          <summary>
            <span>本页定义总索引</span>
            <small>统一搜索 5 个视图，不属于当前 Tab</small>
          </summary>
          <DefinitionSearch
            catalog={catalog}
            onOpenTaskLookup={(keyword) => {
              const nextDraft = cleanText(keyword)
              if (nextDraft) setTaskDraft(nextDraft)
              setTaskLookupFocusRequest((current) => current + 1)
              openView('workflow')
            }}
            onOpen={(item) => {
              if (item.type === 'chain') {
                openView('chain', {
                  [QUERY_KEYS.chain]: item.key,
                  [QUERY_KEYS.node]: item.nodeKey || null,
                })
              } else if (item.type === 'runtime') {
                openView('runtime', { [QUERY_KEYS.process]: item.key })
              } else if (item.type === 'facts') {
                openView('facts', { [QUERY_KEYS.fact]: item.key })
              } else if (item.type === 'states') {
                openView('states', {
                  [QUERY_KEYS.flow]: item.key,
                  [QUERY_KEYS.state]: null,
                })
              } else openView('workflow')
            }}
          />
        </details>
      ) : null}
      <section className="erp-dev-flow-nav">
        <div className="erp-dev-flow-nav__intro">
          <Text strong>你现在想看什么？</Text>
          <Text type="secondary">
            默认看业务总图；点击一条链看细节，需要责任、运行、事实或状态时再切换。
          </Text>
        </div>
        <DevTaskNav
          compact
          level="primary"
          ariaLabel="业务链与运行观察视图"
          items={VIEW_ITEMS}
          value={view}
          disabled={catalogState.status === 'loading'}
          onChange={(nextView) => openView(nextView)}
        />
      </section>
      {catalogState.status === 'ready' && catalog ? (
        <ContextStrip
          view={view}
          chain={
            view === 'chain'
              ? overviewSelected
                ? catalog.businessChainOverview
                : chain
              : null
          }
          node={view === 'chain' ? node : null}
          selection={specialistSelection}
          canReturnToChain={valid && view !== 'chain'}
          onReturnChain={() => openView('chain')}
        />
      ) : null}
      <main className="erp-dev-flow-main" data-flow-state-view={view}>
        <CatalogState state={catalogState} onRetry={catalogState.reload} />
        {catalogState.status === 'ready' &&
        catalog &&
        invalidMessages.length > 0 ? (
          <Alert
            showIcon
            type="warning"
            message="无效或过期深链接，已按 fail closed 停止加载"
            description={
              <Space direction="vertical">
                <ul>
                  {invalidMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
                <Button
                  type="primary"
                  onClick={() => {
                    setSearchParams(
                      new URLSearchParams({
                        view: 'chain',
                        chain: catalog.businessChainOverview.key,
                      }),
                      { replace: true }
                    )
                  }}
                >
                  恢复到业务总图
                </Button>
              </Space>
            }
          />
        ) : null}
        {catalogState.status === 'ready' && catalog && valid
          ? renderView()
          : null}
      </main>
      <DevBusinessChainCustomerReviewPrint review={customerReview} />
    </div>
  )
}
