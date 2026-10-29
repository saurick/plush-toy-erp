import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  InfoCircleOutlined,
  PartitionOutlined,
  DownOutlined,
  ExportOutlined,
  LeftOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Popover,
  Space,
  Spin,
  Tag,
} from 'antd'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import Modal from '@/common/components/modal/AppModal'
import { StateRulesView } from '../components/flow-state/StateRulesView.jsx'
import { FactsView } from '../components/flow-state/FactsView.jsx'
import { RuntimeView } from '../components/flow-state/RuntimeView.jsx'
import { WorkflowView } from '../components/flow-state/WorkflowView.jsx'
import BusinessChainInstanceView from '../components/flow-state/BusinessChainInstanceView.jsx'
import FinanceTraceView from '../components/flow-state/FinanceTraceView.jsx'
import FinanceRulesView from '../components/flow-state/FinanceRulesView.jsx'
import { FINANCE_RELATIONS_TOPIC_KEY, FINANCE_RULES, FINANCE_TOPIC_KEYS } from '../config/devFinanceWorkbench.mjs'
import BusinessRelationFilters from '../components/flow-state/BusinessRelationFilters.jsx'
import { TaskFinder } from '../components/flow-state/FlowTaskContext.jsx'
import {
  BusinessChainOverviewView,
  BusinessChainView,
} from '../components/flow-state/BusinessChainViews.jsx'
import {
  Text,
  Title,
  VIEW_ITEMS,
  VIEW_META,
  cleanText,
  asArray,
  CatalogState,
  MemoryStrip,
} from '../components/flow-state/FlowStateShared.jsx'
import SearchInput from '@/common/components/SearchInput'
import { AUTH_SESSION_CHANGED_EVENT, getToken } from '@/common/auth/auth'
import { getWorkflowTask } from '@/erp/api/workflowApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import {
  DEV_BUSINESS_TOPICS_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_BUSINESS_RULES_ROUTE,
} from '../config/devRoutes.mjs'
import {
  FLOW_READING_CONTEXT_KEYS,
  resolveDevFlowViewContext,
  restoreDevFlowPrimaryContext,
} from './devFlowViewContext.mjs'
import { buildFulfillmentRelations, buildChainActionRelations, projectFulfillmentRelations, projectChainRelations, projectAllActionRelations } from '../config/devFulfillmentRelations.mjs'
import { buildDevBusinessChainProjection } from '../config/devBusinessChainProjection.mjs'
import { buildDevBusinessChainCustomerReview } from '../config/devBusinessChainCustomerReview.mjs'
import { DEV_CUSTOMER_QUERY_KEY } from '../config/devCustomerScope.mjs'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'
import DevBusinessChainCustomerReviewPrint from './DevBusinessChainCustomerReviewPrint.jsx'
import { parseDevFlowStateTaskIDReference } from './devFlowStateTaskLookup.mjs'
import {
  buildDevFlowDefinitionSearchGroups,
  normalizeDevFlowDefinitionSearchText,
} from './devFlowDefinitionSearch.mjs'

import {
  DEV_FLOW_STATE_DEFAULT_VIEW as DEFAULT_VIEW,
  DEV_FLOW_STATE_OVERVIEW_CHAIN_KEY as ALL_BUSINESS_CHAINS_KEY,
  DEV_FLOW_STATE_QUERY_KEYS as QUERY_KEYS,
  DEV_FLOW_STATE_SELECTION_QUERY_KEYS as SELECTION_QUERY_KEYS,
  DEV_FLOW_STATE_VIEW_SELECTION_QUERY_KEYS as VIEW_SELECTION_QUERY_KEYS,
  canonicalizeDevFlowStateSearchParams,
  DEV_BUSINESS_RULE_VIEWS,
  resolveDevFlowViewRoute,
  buildDevFlowSurfaceLocation,
  readDevFlowRelationFilters,
  patchDevFlowRelationFilters,
} from './devFlowStateQuery.mjs'
import '../styles/dev-flow-state-observatory.css'

const CATALOG_MODULE_PATH = '../config/devFlowStateCatalog.mjs'
const CATALOG_MODULES = import.meta.glob('../config/devFlowStateCatalog.mjs')

const KNOWN_QUERY_KEYS = new Set([
  ...Object.values(QUERY_KEYS),
  DEV_CUSTOMER_QUERY_KEY,
])

const VIEW_KEYS = new Set(VIEW_ITEMS.map((item) => item.value))
const PRIMARY_VIEWS = [
  ...VIEW_ITEMS.filter((item) => ['chain', 'tracking'].includes(item.value)).map(({ value, label }) => ({ value, label })),
]
const primaryViewKey = (view) => view === 'chain' ? 'chain' : ['tracking', 'workflow', 'runtime', 'finance_records'].includes(view) ? 'tracking' : 'rules'
const TECHNICAL_VIEWS = DEV_BUSINESS_RULE_VIEWS.map((key) => VIEW_ITEMS.find((item) => item.value === key))
  .map(({ value, label }) => ({ value, label }))
const TRACKING_VIEWS = VIEW_ITEMS.filter((item) => ['tracking', 'workflow', 'runtime', 'finance_records'].includes(item.value))
  .map(({ value, label }) => ({ value, label: value === 'tracking' ? '关联任务' : label }))

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
        asArray(chain.steps).length !== asArray(chain.edges).length ||
        asArray(chain.acceptanceScenarios).length !== 6 ||
        !asArray(chain.nodes).every((node) => node.readOnly === true) ||
        !asArray(chain.edges).every((edge) => edge.readOnly === true) ||
        !asArray(chain.steps).every(
          (step) =>
            step.readOnly === true && step.allowsActionExecution === false
        ) ||
        !asArray(chain.acceptanceScenarios).every(
          (scenario) =>
            scenario.readOnly === true &&
            scenario.allowsActionExecution === false
        )
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
  const requestSequenceRef = useRef(0)

  const reload = useCallback(() => {
    const requestSequence = requestSequenceRef.current + 1
    requestSequenceRef.current = requestSequence
    const loader =
      CATALOG_MODULES[CATALOG_MODULE_PATH] || Object.values(CATALOG_MODULES)[0]
    setState({ status: 'loading', catalog: null, error: '' })
    if (typeof loader !== 'function') {
      setState({
        status: 'error',
        catalog: null,
        error: `未找到 ${CATALOG_MODULE_PATH}`,
      })
      return
    }
    loader()
      .then((moduleValue) => {
        if (requestSequenceRef.current !== requestSequence) return
        setState({
          status: 'ready',
          catalog: validateCatalog(moduleValue),
          error: '',
        })
      })
      .catch((error) => {
        if (requestSequenceRef.current !== requestSequence) return
        setState({
          status: 'error',
          catalog: null,
          error: cleanText(error?.message) || '目录加载失败',
        })
      })
  }, [])

  useEffect(() => {
    reload()
    return () => {
      requestSequenceRef.current += 1
    }
  }, [reload])
  return { ...state, reload }
}

function patchParams(searchParams, patch) {
  const next = new URLSearchParams(searchParams)
  for (const [key, value] of Object.entries(patch)) {
    const normalized = cleanText(value)
    if (
      value === '' &&
      [QUERY_KEYS.flow, QUERY_KEYS.process, QUERY_KEYS.fact, QUERY_KEYS.financeRule, QUERY_KEYS.ruleAction].includes(key)
    ) {
      next.set(key, '')
    } else if (!normalized) next.delete(key)
    else next.set(key, normalized)
  }
  return next
}

function DefinitionSearch({ catalog, onOpen, onOpenTaskLookup }) {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchGuideOpen, setSearchGuideOpen] = useState(false)
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
    setSearchKeyword('')
  }
  const openResult = (item) => {
    clearSearch()
    onOpen(item)
  }
  const searchExample = (keyword) => {
    setSearchKeyword(keyword)
    setSearchGuideOpen(false)
  }
  const openTaskLookup = () => {
    const keyword = searchKeyword
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
    >
      <div className="erp-dev-flow-section-heading">
        <div>
          <Space size={6} wrap>
            <Text strong id="dev-flow-global-search-title">
              跨视图查定义
            </Text>
          </Space>
          <Text type="secondary">
            搜索业务链、流程、状态和事实定义。查某张订单的进度，请使用“定位业务”。
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
        value={searchKeyword}
        placeholder="例如：销售订单、销售 PMC、已提交"
        searchHint="本页 5 个视图的定义总索引，不属于当前 Tab；不搜索具体任务、运行实例或真实业务记录"
        aria-autocomplete="list"
        aria-expanded={Boolean(normalized)}
        aria-controls="dev-flow-definition-search-results"
        onSearch={(value) => setSearchKeyword(value)}
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
                  <h3 className="erp-dev-directory-group-title">
                    {group.label}
                    <span>{group.items.length}</span>
                  </h3>
                  {group.items.length > 0 ? (
                    <ul>
                      {group.items.map((item) => (
                        <li key={`${item.type}:${item.key}`}>
                          <button
                            type="button"
                            className="erp-dev-directory-item erp-dev-directory-item--stacked erp-dev-directory-item--nested"
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

function invalidQueryMessages(searchParams, catalog, defaultView = DEFAULT_VIEW) {
  const messages = []
  for (const key of new Set(searchParams.keys())) {
    if (!KNOWN_QUERY_KEYS.has(key)) messages.push(`未知 query 参数：${key}`)
    if (key !== DEV_CUSTOMER_QUERY_KEY && searchParams.getAll(key).length > 1) {
      messages.push(`query 参数重复：${key}`)
    }
  }
  const readingTab = searchParams.get(QUERY_KEYS.roleTab)
  if (readingTab && readingTab !== 'exceptions') messages.push('未登记的流程视图，请从侧栏进入业务专题')
  const view = cleanText(searchParams.get(QUERY_KEYS.view))
  const chainKey = cleanText(searchParams.get(QUERY_KEYS.chain))
  const nodeKey = cleanText(searchParams.get(QUERY_KEYS.node))
  const flowKey = cleanText(searchParams.get(QUERY_KEYS.flow))
  const stateKey = cleanText(searchParams.get(QUERY_KEYS.state))
  const processKey = cleanText(searchParams.get(QUERY_KEYS.process))
  const factKey = cleanText(searchParams.get(QUERY_KEYS.fact))
  const taskId = cleanText(searchParams.get(QUERY_KEYS.taskId))
  const topicKey = searchParams.get(QUERY_KEYS.roleTopic)
  const topicNodeKey = searchParams.get(QUERY_KEYS.roleTopicNode)
  const mapKey = searchParams.get(QUERY_KEYS.roleMap)
  const mapNodeKey = searchParams.get(QUERY_KEYS.roleMapNode)
  if (
    topicKey &&
    topicKey !== FINANCE_RELATIONS_TOPIC_KEY &&
    !catalog.businessChains.some((item) => item.key === topicKey)
  ) {
    messages.push('未登记的业务专题')
  }
  for (const [key, values] of [
    [QUERY_KEYS.financeRule, ['', ...FINANCE_RULES.map((item) => item.key)]],
    [QUERY_KEYS.financeTopic, FINANCE_TOPIC_KEYS],
    [QUERY_KEYS.financeStep, ['0', '1', '2', '3']],
    [QUERY_KEYS.financeStage, ['none', 'draft', 'posted']],
    [QUERY_KEYS.financeChange, ['return', 'increase', 'transfer']],
  ]) {
    if (searchParams.has(key) && !values.includes(searchParams.get(key))) messages.push('未登记的财务阅读条件')
  }
  const financeFactID = searchParams.get(QUERY_KEYS.financeFact)
  if (financeFactID !== null && (!/^[1-9]\d*$/.test(financeFactID) || !Number.isSafeInteger(Number(financeFactID)))) messages.push('账款编号无效')
  if (mapKey && !catalog.businessChains.some((item) => item.key === mapKey)) {
    messages.push('未登记的系统关联专题')
  }
  if (mapNodeKey) {
    const related = new Set([
      mapKey,
      ...catalog.businessChainOverview.relations
        .filter(
          (item) => item.fromChainKey === mapKey || item.toChainKey === mapKey
        )
        .flatMap((item) => [item.fromChainKey, item.toChainKey]),
    ])
    if (!mapKey || !related.has(mapNodeKey)) {
      messages.push('系统关联节点不属于当前范围')
    }
  }
  if (
    topicNodeKey &&
    !catalog.businessChains
      .find((item) => item.key === topicKey)
      ?.nodes.some((item) => item.key === topicNodeKey)
  ) {
    messages.push('业务专题节点不属于当前专题')
  }
  const chain = catalog.businessChains.find((item) => item.key === chainKey)
  const overviewSelected = chainKey === catalog.businessChainOverview.key
  const chainNode =
    chain && nodeKey
      ? chain.nodes.find((item) => item.key === nodeKey) || null
      : null
  const chainProjection = chain
    ? buildDevBusinessChainProjection({
        catalog,
        chainKey: chain.key,
        nodeKey: chainNode?.key || '',
      })
    : null
  const flow = catalog.flows.find((item) => item.key === flowKey)
  const activeView = view || defaultView

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
  if (nodeKey && chain && !chainNode) {
    messages.push(`业务链中不存在节点：${nodeKey}`)
  }
  if (flowKey && !flow) messages.push(`未知状态对象：${flowKey}`)
  if (
    flowKey &&
    chainProjection &&
    !chainProjection.machineKeys.includes(flowKey)
  ) {
    messages.push(`状态对象不属于所选业务链：${flowKey}`)
  }
  if (stateKey && !flowKey) messages.push('状态 key 缺少所属状态对象')
  if (stateKey && flow && !flow.states.some((item) => item.key === stateKey)) {
    messages.push(`状态对象中不存在状态：${stateKey}`)
  }
  const actionKey = searchParams.get(QUERY_KEYS.ruleAction)
  if (actionKey && (!flow || ![
    ...flow.actionRules.filter((rule) => !stateKey || rule.states.includes(stateKey)),
    ...flow.lifecycleRules,
  ].some((rule) => rule.key === actionKey))) {
    messages.push('办理动作不属于当前对象或选中状态')
  }
  if (
    processKey &&
    !catalog.processDefinitions.some((item) => item.key === processKey)
  ) {
    messages.push(`未知流程 variant：${processKey}`)
  }
  if (
    processKey &&
    chainProjection &&
    !chainProjection.processDefinitionKeys.includes(processKey)
  ) {
    messages.push(`流程定义不属于所选业务链：${processKey}`)
  }
  if (
    factKey &&
    !catalog.factDefinitions.some((item) => item.factKey === factKey)
  ) {
    messages.push(`未知 Fact Key：${factKey}`)
  }
  if (
    factKey &&
    chainProjection &&
    !chainProjection.factKeys.includes(factKey)
  ) {
    messages.push(`Fact 不属于所选业务链：${factKey}`)
  }
  if (
    searchParams.get(QUERY_KEYS.taskFilter) &&
    !['all', 'pending', 'exceptions'].includes(
      searchParams.get(QUERY_KEYS.taskFilter)
    )
  ) {
    messages.push('无效的任务筛选')
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
  const location = useLocation()
  const navigate = useNavigate()
  const topicsPage = location.pathname.replace(/\/+$/, '') === DEV_BUSINESS_TOPICS_ROUTE
  const rulesPage = location.pathname.replace(/\/+$/, '') === DEV_BUSINESS_RULES_ROUTE
  const defaultView = rulesPage ? 'states' : DEFAULT_VIEW
  const queryCanonicalization = useMemo(
    () => canonicalizeDevFlowStateSearchParams(searchParams, { defaultView }),
    [searchParams, defaultView]
  )
  const activeSearchParams = queryCanonicalization.searchParams
  const requestedView = cleanText(activeSearchParams.get(QUERY_KEYS.view))
  const view = requestedView || defaultView
  const viewRoute = resolveDevFlowViewRoute(view, { topics: topicsPage })
  const [customerExportOpen, setCustomerExportOpen] = useState(false)
  const [definitionSearchOpen, setDefinitionSearchOpen] = useState(false)
  const [printingCurrent, setPrintingCurrent] = useState(false)
  const [printingCustomer, setPrintingCustomer] = useState(false)
  const printRequestRef = useRef(0)
  const customerScope = useDevCustomerScope({
    searchParams,
    setSearchParams,
    normalize: customerExportOpen,
  })
  const customerReady = customerScope.status === 'ready'
  const requestedChainKey = cleanText(activeSearchParams.get(QUERY_KEYS.chain))
  const requestedNodeKey = cleanText(activeSearchParams.get(QUERY_KEYS.node))
  const requestedFlowKey = cleanText(activeSearchParams.get(QUERY_KEYS.flow))
  const requestedStateKey = cleanText(activeSearchParams.get(QUERY_KEYS.state))
  const requestedProcessKey = cleanText(
    activeSearchParams.get(QUERY_KEYS.process)
  )
  const requestedFactKey = cleanText(activeSearchParams.get(QUERY_KEYS.fact))
  const taskId = cleanText(activeSearchParams.get(QUERY_KEYS.taskId))
  const [taskDraft, setTaskDraft] = useState(location.state?.flowRestoreFrame?.draft ?? taskId)
  const [selectedTask, setSelectedTask] = useState(null)
  const [customerReviewPrintSnapshot, setCustomerReviewPrintSnapshot] =
    useState(null)
  const taskSelectionRef = useRef(taskId)
  const sessionTokenRef = useRef(getToken())
  const [sessionRevision, setSessionRevision] = useState(0)
  const primaryViewsRef = useRef({})
  const readingRestoreRef = useRef(location.state?.flowRestoreFrame || null)
  const pageRef = useRef(null)
  const chainReturnRef = useRef({
    [QUERY_KEYS.chain]: requestedChainKey || ALL_BUSINESS_CHAINS_KEY,
    [QUERY_KEYS.node]: requestedNodeKey || null,
  })

  useEffect(() => {
    const resetSession = () => {
      const token = getToken()
      if (sessionTokenRef.current === token) return
      sessionTokenRef.current = token
      primaryViewsRef.current = {}
      readingRestoreRef.current = null
      taskSelectionRef.current = ''
      setSelectedTask(null)
      setTaskDraft('')
      setSessionRevision((value) => value + 1)
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete(QUERY_KEYS.taskId)
          next.delete(QUERY_KEYS.financeFact)
          return next
        },
        { replace: true, state: { flowReturnFrames: [], flowRuleViews: {}, flowRestoreFrame: null, flowTaskContext: false } }
      )
    }
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, resetSession)
    window.addEventListener('storage', resetSession)
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, resetSession)
      window.removeEventListener('storage', resetSession)
    }
  }, [setSearchParams])

  useEffect(() => {
    if (taskSelectionRef.current === taskId) return
    taskSelectionRef.current = taskId
    setSelectedTask(null)
    setTaskDraft(taskId)
  }, [taskId])

  useEffect(() => {
    if (
      !Number.isSafeInteger(selectedTask?.id) ||
      String(selectedTask.id) !== taskId
    ) {
      return
    }
    const selectedTaskName = cleanText(selectedTask.task_name)
    if (selectedTaskName) setTaskDraft(selectedTaskName)
  }, [selectedTask, taskId])

  const updateParams = useCallback(
    (patch, options = {}) => {
      setSearchParams(patchParams(activeSearchParams, patch), {
        replace: options.replace === true,
        state: { ...location.state, ...options.state, flowRestoreFrame: null },
      })
    },
    [activeSearchParams, setSearchParams, location.state]
  )

  const invalidMessages = catalog
    ? invalidQueryMessages(activeSearchParams, catalog, defaultView)
    : []
  const valid = invalidMessages.length === 0
  const [taskRead, setTaskRead] = useState(null)
  const [taskReadRevision, setTaskReadRevision] = useState(0)
  const needsTaskDetail = Boolean(valid && taskId && !['chain', 'tracking', 'processes', 'finance_records', 'finance_rules'].includes(view) && String(selectedTask?.id || '') !== taskId)

  useEffect(() => {
    if (!needsTaskDetail) return undefined
    const controller = new AbortController()
    setTaskRead({ taskId, status: 'loading' })
    getWorkflowTask(Number(taskId), { signal: controller.signal })
      .then((task) => {
        if (!controller.signal.aborted) setSelectedTask(task)
      })
      .catch((error) => {
        if (controller.signal.aborted || isRpcAbortError(error)) return
        setTaskRead({ taskId, status: 'error', error: getActionErrorMessage(error, '读取当前任务', { fallback: '读取失败，请确认当前任务仍可查看后重试' }) })
      })
    return () => controller.abort()
  }, [needsTaskDetail, taskId, taskReadRevision, sessionRevision])

  useEffect(() => {
    if (!queryCanonicalization.changed || viewRoute !== location.pathname) return
    setSearchParams(queryCanonicalization.searchParams, {
      replace: true,
      state: location.state,
    })
  }, [queryCanonicalization, setSearchParams, location.state, location.pathname, viewRoute])

  useEffect(() => {
    if (!VIEW_KEYS.has(view) || viewRoute === location.pathname) return
    navigate({ pathname: viewRoute, search: location.search }, { replace: true, state: location.state })
  }, [view, viewRoute, location.pathname, location.search, location.state, navigate])

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
  const taskScoped = view === 'processes' ? false :
    location.state?.flowTaskContext ??
    (view === 'tracking' || (view !== 'chain' && Boolean(taskId)))
  const readingContext = useMemo(
    () =>
      catalog
        ? resolveDevFlowViewContext({
            catalog,
            searchParams: activeSearchParams,
            task: selectedTask,
            taskScoped,
            topics: topicsPage,
          })
        : null,
    [catalog, activeSearchParams, selectedTask, taskScoped, topicsPage]
  )
  const fulfillmentRelations = useMemo(() => catalog ? buildFulfillmentRelations(catalog) : [], [catalog])
  const allRelationActions = useMemo(() => catalog ? [
    ...catalog.businessChains.flatMap((item) => buildChainActionRelations(catalog, item)),
    ...fulfillmentRelations.flatMap((item) => item.actions.filter((action) => !action.step)),
  ] : [], [catalog, fulfillmentRelations])
  const stageRelation = !topicsPage && !taskScoped && (!requestedChainKey || overviewSelected) && !activeSearchParams.get(QUERY_KEYS.exception) && !activeSearchParams.get(QUERY_KEYS.roleTab)
    ? fulfillmentRelations.find((item) => item.stage.stage === activeSearchParams.get(QUERY_KEYS.roleStage))
    : null
  const chainProjection = useMemo(
    () => stageRelation ? projectFulfillmentRelations(catalog, stageRelation, readDevFlowRelationFilters(activeSearchParams), activeSearchParams.get(QUERY_KEYS.relationAction))
      : catalog && readingContext ? projectChainRelations(catalog, readingContext.chainKey, readingContext.nodeKey, taskScoped ? {} : readDevFlowRelationFilters(activeSearchParams), taskScoped ? null : activeSearchParams.get(QUERY_KEYS.relationAction))
        : catalog && !taskScoped ? projectAllActionRelations(catalog, allRelationActions, readDevFlowRelationFilters(activeSearchParams)) : null,
    [catalog, readingContext, stageRelation, activeSearchParams, taskScoped, allRelationActions]
  )
  const availableFlows = chainProjection?.flows || catalog?.flows || []
  const availableProcessDefinitions =
    chainProjection?.processDefinitions || catalog?.processDefinitions || []
  const availableFactDefinitions =
    chainProjection?.factDefinitions || catalog?.factDefinitions || []
  const flow =
    activeSearchParams.get(QUERY_KEYS.flow) === ''
      ? null
      : availableFlows.find((item) => item.key === requestedFlowKey) ||
        availableFlows[0] ||
        null
  const state =
    flow && requestedStateKey
      ? flow.states.find((item) => item.key === requestedStateKey)
      : null
  const definition =
    activeSearchParams.get(QUERY_KEYS.process) === ''
      ? null
      : availableProcessDefinitions.find(
          (item) => item.key === requestedProcessKey
        ) ||
        availableProcessDefinitions[0] ||
        null
  const fact =
    activeSearchParams.get(QUERY_KEYS.fact) === ''
      ? null
      : availableFactDefinitions.find(
          (item) => item.factKey === requestedFactKey
        ) ||
        availableFactDefinitions[0] ||
        null
  const customerOverlay = useMemo(() => {
    if (!catalog || !customerReady) return null
    return (
      catalog.overlays.find(
        (overlay) => overlay.customerKey === customerScope.customerKey
      ) || null
    )
  }, [catalog, customerReady, customerScope.customerKey])
  const customerReviewReady = Boolean(customerReady && customerOverlay)
  const customerReview = useMemo(() => {
    if (
      !catalog ||
      !valid ||
      !customerReviewReady ||
      (taskScoped && taskId && !readingContext)
    ) {
      return null
    }
    const chainKey =
      readingContext?.chainKey ||
      (overviewSelected ? catalog.businessChainOverview.key : chain?.key)
    if (!chainKey) return null
    return buildDevBusinessChainCustomerReview({
      catalog,
      chainKey,
      customerOverlay,
    })
  }, [
    catalog,
    chain?.key,
    customerOverlay,
    customerReviewReady,
    overviewSelected,
    readingContext,
    taskScoped,
    taskId,
    valid,
  ])
  const customerReviewScopeKey = customerReview
    ? [
        customerScope.customerKey,
        customerReview.releaseVersion,
        readingContext?.chainKey ||
          (overviewSelected ? catalog.businessChainOverview.key : chain?.key),
      ].join(':')
    : ''
  const customerReviewPrint =
    customerReviewPrintSnapshot?.scopeKey === customerReviewScopeKey
      ? customerReviewPrintSnapshot.review
      : null

  useEffect(() => {
    if (!catalog || !valid || viewRoute !== location.pathname) return
    const patch = {}
    if (!requestedView) patch[QUERY_KEYS.view] = defaultView
    if (view === 'chain' && !requestedChainKey) {
      patch[QUERY_KEYS.chain] = catalog.businessChainOverview.key
    }
    if (view === 'chain' && !overviewSelected && !requestedNodeKey && node) {
      patch[QUERY_KEYS.node] = node.key
    }
    if (view === 'states' && requestedFlowKey !== flow?.key && flow) {
      patch[QUERY_KEYS.flow] = flow.key
      patch[QUERY_KEYS.state] = null
    }
    if (
      ['runtime', 'processes'].includes(view) &&
      requestedProcessKey !== definition?.key &&
      definition
    ) {
      patch[QUERY_KEYS.process] = definition.key
    }
    if (['runtime', 'processes'].includes(view) && requestedProcessKey && !definition) {
      patch[QUERY_KEYS.process] = null
    }
    if (view === 'facts' && requestedFactKey !== fact?.factKey && fact) {
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
    defaultView,
    viewRoute,
    location.pathname,
  ])

  const selectTask = (nextTaskId, task, targetView) => {
    taskSelectionRef.current = String(nextTaskId)
    setSelectedTask(task || null)
    updateParams({
      [QUERY_KEYS.taskId]: String(nextTaskId),
      ...(targetView
        ? {
            [QUERY_KEYS.view]: targetView,
            [QUERY_KEYS.taskFilter]: null,
            [QUERY_KEYS.taskGroup]: null,
          }
        : {}),
    })
  }
  const clearTask = () => {
    taskSelectionRef.current = ''
    setSelectedTask(null)
    updateParams({ [QUERY_KEYS.taskId]: null })
  }
  const returnFrames = location.state?.flowReturnFrames || []
  useLayoutEffect(() => {
    const frame = readingRestoreRef.current || location.state?.flowRestoreFrame
    if (!frame || catalogState.status !== 'ready') return undefined
    readingRestoreRef.current = null
    // Async task reads and diagrams can grow after navigation has rendered.
    const observer = new ResizeObserver(restore)
    const inputs = ['wheel', 'pointerdown', 'keydown']
    function stop() {
      observer.disconnect()
      inputs.forEach((event) => window.removeEventListener(event, stop, true))
    }
    function restore() {
      window.scrollTo({ top: frame.scroll, behavior: 'instant' })
      if (Math.abs(window.scrollY - frame.scroll) > 1) return
      ;[...document.querySelectorAll('button,a')]
        .find((element) => element.getClientRects().length &&
          (element.getAttribute('aria-label') || element.textContent).trim() === frame.focus)
        ?.focus({ preventScroll: true })
      stop()
    }
    observer.observe(pageRef.current)
    inputs.forEach((event) => window.addEventListener(event, stop, true))
    restore()
    return stop
  }, [location.key, location.state?.flowRestoreFrame, catalogState.status])
  const captureReadingFrame = () => {
    const active = document.activeElement
    return {
      pathname: location.pathname,
      search: activeSearchParams.toString(),
      label: topicsPage && view === 'chain' ? '业务专题' : VIEW_META[view]?.label || '上一层',
      scroll: window.scrollY,
      focus: (active?.getAttribute('aria-label') || active?.textContent || '').trim(),
      taskScoped,
      draft: taskDraft,
    }
  }
  const backToReading = () => {
    const previous = returnFrames.at(-1)
    if (!previous) return
    readingRestoreRef.current = previous
    navigate({ pathname: previous.pathname, search: previous.search ? `?${previous.search}` : '' }, {
      state: {
        ...location.state,
        flowReturnFrames: returnFrames.slice(0, -1),
        flowTaskContext: previous.taskScoped,
        flowRestoreFrame: previous,
      },
    })
  }
  const openSurface = (topics, topicKey) => {
    navigate(buildDevFlowSurfaceLocation(activeSearchParams, { topics, topicKey }), {
      state: {
        flowReturnFrames: [...returnFrames, captureReadingFrame()],
        flowTaskContext: false,
        flowRestoreFrame: null,
      },
    })
  }
  const openView = (nextView, patch = {}, options = {}) => {
    if (options.replaceTool && nextView === view) return
    const allowedSelectionKeys = VIEW_SELECTION_QUERY_KEYS[nextView] || []
    const nextPatch = Object.fromEntries(
      SELECTION_QUERY_KEYS.map((key) => [key, null])
    )
    nextPatch[QUERY_KEYS.view] = nextView
    if (nextView === 'chain') {
      Object.assign(nextPatch, chainReturnRef.current)
    } else if (requestedChainKey) {
      nextPatch[QUERY_KEYS.chain] = requestedChainKey
      nextPatch[QUERY_KEYS.node] = requestedNodeKey || null
    }
    for (const [key, value] of Object.entries(patch)) {
      if (
        allowedSelectionKeys.includes(key) ||
        FLOW_READING_CONTEXT_KEYS.includes(key) ||
        key === QUERY_KEYS.taskId ||
        key === QUERY_KEYS.chain ||
        key === QUERY_KEYS.node
      ) {
        nextPatch[key] = value
      }
    }
    if (options.global) {
      [...FLOW_READING_CONTEXT_KEYS, QUERY_KEYS.role, QUERY_KEYS.relationMachine, QUERY_KEYS.relationPermission].forEach((key) => {
        nextPatch[key] = null
      })
    }
    const frame = captureReadingFrame()
    if (primaryViewKey(nextView) !== primaryViewKey(view)) {
      primaryViewsRef.current[primaryViewKey(view)] = {
        ...frame,
        focus: PRIMARY_VIEWS.find((item) => item.value === primaryViewKey(view))?.label || '业务规则',
      }
    }
    const frames = options.main
      ? []
      : options.replaceTool
        ? returnFrames
        : [...returnFrames, frame]
    const nextState = {
      ...location.state,
      flowRuleViews: {
        ...location.state?.flowRuleViews,
        ...(DEV_BUSINESS_RULE_VIEWS.includes(view) ? { [view]: frame } : {}),
      },
      flowReturnFrames: frames,
      flowRestoreFrame: null,
      flowTaskContext: options.global
        ? false
        : options.main && ['chain', 'tracking'].includes(nextView)
          ? nextView === 'tracking'
          : nextView === 'chain'
            ? false
            : frame.taskScoped,
    }
    const previousRule = nextState.flowRuleViews[nextView]
    if (rulesPage && options.replaceTool && previousRule) {
      const restored = restoreDevFlowPrimaryContext(previousRule.search, activeSearchParams, { independentKeys: [QUERY_KEYS.financeRule] })
      readingRestoreRef.current = restored.changed ? null : { ...previousRule, focus: VIEW_META[nextView].label }
      setSearchParams(restored.searchParams, { state: nextState })
      return
    }
    const leavesTopic = topicsPage && (options.global || (nextView === 'chain' && (
      patch[QUERY_KEYS.roleStage] || patch[QUERY_KEYS.roleTab] === 'exceptions'
    )))
    const nextPathname = resolveDevFlowViewRoute(nextView, { topics: topicsPage && !leavesTopic })
    if (nextPathname !== location.pathname) {
      navigate({ pathname: location.pathname, search: location.search }, {
        replace: true,
        state: { ...location.state, flowRestoreFrame: frame },
      })
      navigate({ pathname: nextPathname, search: `?${patchParams(activeSearchParams, nextPatch)}` }, { state: nextState })
    } else updateParams(nextPatch, { state: nextState })
  }
  const openPrimaryView = (nextPrimary) => {
    const currentPrimary = primaryViewKey(view)
    if (nextPrimary === currentPrimary) return
    primaryViewsRef.current[currentPrimary] = {
      ...captureReadingFrame(),
      focus: PRIMARY_VIEWS.find((item) => item.value === currentPrimary).label,
    }
    const previous = primaryViewsRef.current[nextPrimary]
    if (!previous) {
      openView(nextPrimary, {}, { main: true })
      return
    }
    const restored = restoreDevFlowPrimaryContext(previous.search, activeSearchParams)
    readingRestoreRef.current = restored.changed ? null : previous
    setTaskDraft(previous.draft)
    setSearchParams(restored.searchParams, {
      state: { ...location.state, flowReturnFrames: [], flowTaskContext: nextPrimary === 'tracking' },
    })
  }
  const clearChainContext = () => {
    if (topicsPage) {
      openView(view, { [QUERY_KEYS.chain]: null, [QUERY_KEYS.node]: null }, { global: true })
      return
    }
    updateParams(
      {
        [QUERY_KEYS.chain]: null,
        [QUERY_KEYS.node]: null,
        ...Object.fromEntries(
          [...FLOW_READING_CONTEXT_KEYS, QUERY_KEYS.role, QUERY_KEYS.relationMachine, QUERY_KEYS.relationPermission].map((key) => [key, null])
        ),
      },
      { state: { ...location.state, flowTaskContext: false } }
    )
  }
  const openGlobalDefinitionView = (nextView, patch = {}) =>
    openView(
      nextView,
      {
        [QUERY_KEYS.chain]: null,
        [QUERY_KEYS.node]: null,
        ...patch,
      },
      { global: true }
    )
  useEffect(() => {
    const finishPrint = () => {
      printRequestRef.current += 1
      setCustomerReviewPrintSnapshot(null)
      setPrintingCurrent(false)
      setPrintingCustomer(false)
    }
    window.addEventListener('afterprint', finishPrint)
    return () => window.removeEventListener('afterprint', finishPrint)
  }, [])

  useEffect(() => {
    setPrintingCurrent(false)
    setPrintingCustomer(false)
    setCustomerReviewPrintSnapshot(null)
    return () => {
      printRequestRef.current += 1
    }
  }, [searchParams])

  const printCurrentView = async () => {
    const request = ++printRequestRef.current
    setCustomerReviewPrintSnapshot(null)
    setPrintingCurrent(true)
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
    )
    if (request !== printRequestRef.current) return
    const pending = document.querySelector(
      '.erp-dev-flow-main .erp-dev-flow-loading, .erp-dev-flow-main .erp-markdown-mermaid:not([data-mermaid-status="rendered"]), .erp-dev-flow-main [data-business-flow]:not([data-graph-status="rendered"])'
    )
    if (pending) {
      setPrintingCurrent(false)
      message.info('页面内容尚未加载完成，请稍后导出')
      return
    }
    window.print()
  }

  const printCustomerReview = async () => {
    if (!customerReviewReady || !customerReview || !customerReviewScopeKey) {
      return
    }
    const request = ++printRequestRef.current
    setPrintingCustomer(true)
    setCustomerExportOpen(false)
    setPrintingCurrent(false)
    setCustomerReviewPrintSnapshot({
      scopeKey: customerReviewScopeKey,
      review: {
        ...customerReview,
        generatedAt: new Date().toISOString(),
      },
    })
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
    })
    const diagramStatus = () => {
      const root = document.querySelector('[data-customer-review-print-root]')
      if (!root) return 'pending'
      const diagrams = [
        ...root.querySelectorAll(
          '[data-customer-review-diagram] .erp-markdown-mermaid'
        ),
      ]
      if (
        diagrams.some((diagram) => diagram.dataset.mermaidStatus === 'error')
      ) {
        return 'error'
      }
      return diagrams.every(
        (diagram) => diagram.dataset.mermaidStatus === 'rendered'
      )
        ? 'rendered'
        : 'pending'
    }
    await new Promise((resolve) => {
      const startedAt = window.performance.now()
      const checkDiagram = () => {
        const status = diagramStatus()
        if (
          request !== printRequestRef.current ||
          status === 'rendered' ||
          status === 'error' ||
          window.performance.now() - startedAt >= 15_000
        ) {
          resolve()
          return
        }
        window.requestAnimationFrame(checkDiagram)
      }
      checkDiagram()
    })
    if (request !== printRequestRef.current) return
    if (diagramStatus() !== 'rendered') {
      setPrintingCustomer(false)
      setCustomerReviewPrintSnapshot(null)
      message.error('业务链图尚未生成，请稍后重新导出')
      return
    }
    window.print()
  }
  const specialistSelection =
    ['workflow', 'runtime'].includes(view) && taskId
      ? selectedTask?.source_no || selectedTask?.task_code
      : ''
  const ruleScopeLabel = chainProjection
    ? [chainProjection.contextLabel || chainProjection.chain?.label, chainProjection.node?.label].filter(Boolean).join(' · ')
    : ''
  const ruleTools = catalog ? (
    <section className="erp-dev-flow-rule-tools" aria-label="当前规则范围">
      {!taskScoped ? <BusinessRelationFilters
        catalog={catalog}
        actions={stageRelation?.actions || (chainProjection?.chain ? buildChainActionRelations(catalog, chainProjection.chain) : allRelationActions)}
        filters={readDevFlowRelationFilters(activeSearchParams)}
        onChange={(patch) => setSearchParams((previous) => patchDevFlowRelationFilters(previous, patch), { state: location.state })}
      /> : null}
      {ruleScopeLabel ? <span data-chain-projection-context={chainProjection.chain?.key || 'all'}>{ruleScopeLabel}</span> : null}
      {chainProjection ? <Button type="text" onClick={clearChainContext}>查看全部定义</Button> : null}
      {activeSearchParams.has(QUERY_KEYS.relationAction) ? <Button type="text" onClick={() => updateParams({ [QUERY_KEYS.relationAction]: null, [QUERY_KEYS.flow]: null, [QUERY_KEYS.state]: null })}>查看本环节全部动作</Button> : null}
    </section>
  ) : null

  const renderView = () => {
    if (!catalog) {
      return null
    }
    if (needsTaskDetail) {
      return taskRead?.taskId === taskId && taskRead.status === 'error' ? (
        <Alert showIcon type="error" message="任务读取失败" description={taskRead.error} action={<Button onClick={() => setTaskReadRevision((value) => value + 1)}>重试</Button>} />
      ) : <div className="erp-dev-flow-loading" role="status"><Spin />正在读取当前任务…</div>
    }
    if (
      ['states', 'facts'].includes(view) &&
      taskScoped &&
      taskId &&
      !readingContext
    ) {
      return (
        <Empty description="当前任务尚未关联唯一业务定义">
          <Button onClick={() => openView('tracking', {}, { main: true })}>
            定位当前任务
          </Button>
          <Button onClick={clearChainContext}>查看全部定义</Button>
        </Empty>
      )
    }
    if (view === 'chain') {
      if (topicsPage || overviewSelected) {
        return (
          <BusinessChainOverviewView
            catalog={catalog}
            topics={topicsPage}
            actions={allRelationActions}
            taskId={taskId}
            selectedTask={selectedTask}
            onSelectChain={(key) =>
              openView('chain', {
                [QUERY_KEYS.chain]: key,
                [QUERY_KEYS.node]: null,
                ...Object.fromEntries(
                  FLOW_READING_CONTEXT_KEYS.map((name) => [name, null])
                ),
              })
            }
            onOpenView={openView}
            onOpenTopics={(key) => openSurface(true, key)}
          />
        )
      }
      if (!chain || !node) return null
      return (
        <BusinessChainView
          key={chain.key}
          catalog={catalog}
          chain={chain}
          node={node}
          focusNode={Boolean(searchParams.get(QUERY_KEYS.node))}
          taskId={taskId}
          selectedTask={selectedTask}
          onSelectChain={(key) =>
            openView('chain', {
              [QUERY_KEYS.chain]: key,
              [QUERY_KEYS.node]: null,
              ...Object.fromEntries(
                FLOW_READING_CONTEXT_KEYS.map((name) => [name, null])
              ),
            })
          }
          onSelectNode={(key) => updateParams({ [QUERY_KEYS.node]: key })}
          onOpenView={openView}
        />
      )
    }
    if (view === 'finance_records') {
      return <FinanceTraceView key={sessionRevision} factID={Number(activeSearchParams.get(QUERY_KEYS.financeFact)) || null} onSelectFact={(id) => updateParams({ [QUERY_KEYS.financeFact]: id == null ? null : String(id) })} onOpenRules={() => openView('finance_rules')} />
    }
    if (view === 'finance_rules') {
      return <FinanceRulesView ruleKey={activeSearchParams.get(QUERY_KEYS.financeRule)} onSelectRule={(key) => updateParams({ [QUERY_KEYS.financeRule]: key })} onOpenRecords={() => openView('finance_records')} />
    }
    if (view === 'tracking') {
      return (
        <BusinessChainInstanceView
          taskId={taskId}
          onSelectTask={selectTask}
          onTaskLoaded={setSelectedTask}
          onOpenView={openView}
        />
      )
    }
    if (view === 'workflow') {
      if (!taskId) return <Empty description="先查询并选择一笔任务，再查看协同记录" />
      return (
        <WorkflowView
          projection={chainProjection}
          taskId={taskId}
          selectedTask={selectedTask}
          onBackToChain={undefined}
          onClearChainContext={clearChainContext}
          onLocateTask={() => openView('tracking', {}, { main: true })}
        />
      )
    }
    if (view === 'runtime' || view === 'processes') {
      if (view === 'runtime' && !taskId) return <Empty description="先查询并选择一笔任务，再查看运行轨迹" />
      return (
        <RuntimeView
          catalog={catalog}
          projection={chainProjection}
          definition={definition}
          taskId={view === 'processes' ? '' : taskId}
          selectedTask={view === 'processes' ? null : selectedTask}
          onSelectDefinition={(key) =>
            updateParams({ [QUERY_KEYS.process]: key ?? '' })
          }
          onBackToChain={undefined}
          onClearChainContext={clearChainContext}
          onBrowseDefinitions={() => openGlobalDefinitionView('processes')}
          ruleTools={ruleTools}
        />
      )
    }
    if (view === 'facts') {
      return (
        <FactsView
          catalog={catalog}
          projection={chainProjection}
          fact={fact}
          onSelectFact={(key) => updateParams({ [QUERY_KEYS.fact]: key ?? '' })}
          onOpenState={(key) =>
            openView('states', {
              [QUERY_KEYS.flow]: key,
              [QUERY_KEYS.state]: null,
            })
          }
          ruleTools={ruleTools}
        />
      )
    }
    return (
      <StateRulesView
        catalog={catalog}
        projection={chainProjection}
        flow={flow}
        state={state}
        onSelectFlow={(key) =>
          updateParams({
            [QUERY_KEYS.flow]: key ?? '',
            [QUERY_KEYS.state]: null,
            [QUERY_KEYS.ruleAction]: null,
          })
        }
        onSelectState={(key) => updateParams({ [QUERY_KEYS.state]: key, [QUERY_KEYS.ruleAction]: null })}
        ruleAction={activeSearchParams.get(QUERY_KEYS.ruleAction)}
        onSelectRuleAction={(key) => updateParams({ [QUERY_KEYS.ruleAction]: key })}
        onOpenView={openView}
        ruleTools={ruleTools}
      />
    )
  }

  return (
    <div
      ref={pageRef}
      className="erp-dev-flow-state-page erp-dev-workspace-page"
      data-dev-flow-state-observatory
      data-catalog-status={catalogState.status}
      data-flow-print-current={printingCurrent || undefined}
    >
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-flow-header"
        title={
          <Space align="center">
            <PartitionOutlined className="erp-dev-flow-header__icon" />
            <Title level={1}>{DEV_PAGE_TITLE_BY_ROUTE[location.pathname]}</Title>
          </Space>
        }
        navigation={
          !rulesPage ? (
            <>
              {!topicsPage ? (
                <DevTaskNav
                  compact
                  level="primary"
                  ariaLabel="业务链路方式"
                  items={PRIMARY_VIEWS}
                  value={primaryViewKey(view)}
                  disabled={catalogState.status === 'loading'}
                  onChange={openPrimaryView}
                />
              ) : view !== 'chain' && returnFrames.length === 0 ? (
                <Button onClick={() => openView('chain')}>专题关系</Button>
              ) : null}
              {primaryViewKey(view) !== 'rules' ? (
                <Tag>
                  {view === 'tracking' ||
                  view === 'finance_records' ||
                  (view === 'workflow' && taskId)
                    ? '运行记录'
                    : view === 'runtime' && taskId
                      ? '流程记录'
                      : '设计结构'}
                </Tag>
              ) : null}
              {primaryViewKey(view) === 'tracking' && view !== 'tracking' ? (
                <span>
                  {VIEW_META[view]?.label}
                  {specialistSelection ? ` · ${specialistSelection}` : ''}
                </span>
              ) : null}
              {chain &&
              primaryViewKey(view) !== 'rules' &&
              view !== 'finance_records' ? (
                <span className="erp-dev-flow-context-path">
                  {chain.label}
                  {node && view !== 'chain' ? ` / ${node.label}` : ''}
                </span>
              ) : null}
            </>
          ) : null
        }
      >
        <Space className="erp-dev-flow-header-actions">
          <Button onClick={() => setDefinitionSearchOpen(true)}>搜索定义</Button>
          <Dropdown
            disabled={!valid || !catalog || printingCustomer}
            menu={{
              items: [
                { key: 'current', label: '当前视图 · 打印 / 保存 PDF' },
                { key: 'customer', label: '客户校对稿…' },
              ],
              onClick: ({ key }) =>
                key === 'current'
                  ? printCurrentView()
                  : setCustomerExportOpen(true),
            }}
          >
            <Button
              aria-label="导出"
              icon={<ExportOutlined />}
              loading={printingCustomer}
            >
              导出 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      </DevPageHeader>

      {valid &&
      catalog &&
      (view !== 'chain' || returnFrames.length > 0) ? (
        <section className="erp-dev-flow-reading-nav">
          {returnFrames.length > 0 ? (
            <Button icon={<LeftOutlined aria-hidden />} onClick={backToReading}>
              返回 {returnFrames.at(-1).label}
            </Button>
          ) : null}
          {view !== 'chain' ? (
            <DevTaskNav
              compact
              level="secondary"
              ariaLabel="关联信息类型"
              items={primaryViewKey(view) === 'tracking' ? TRACKING_VIEWS : TECHNICAL_VIEWS}
              value={view}
              onChange={(key) => openView(key, {}, { replaceTool: true })}
            />
          ) : null}
        </section>
      ) : null}

      {valid && catalog && primaryViewKey(view) === 'tracking' && view !== 'finance_records' ? (
        <TaskFinder
          key={`finder-${sessionRevision}`}
          draft={taskDraft}
          onDraftChange={setTaskDraft}
          onClearTask={clearTask}
          onSelectTask={(id, task) => selectTask(id, task, 'tracking')}
          taskId={taskId}
        />
      ) : null}
      <Drawer
        title="搜索定义"
        width={860}
        open={definitionSearchOpen}
        onClose={() => setDefinitionSearchOpen(false)}
        destroyOnHidden
      >
        {catalog ? (
          <DefinitionSearch
            catalog={catalog}
            onOpenTaskLookup={(keyword) => {
              setTaskDraft(cleanText(keyword))
              setDefinitionSearchOpen(false)
              openView('tracking')
            }}
            onOpen={(item) => {
              setDefinitionSearchOpen(false)
              if (item.type === 'chain') {
                openView('chain', {
                  [QUERY_KEYS.chain]: item.key,
                  [QUERY_KEYS.node]: item.nodeKey || null,
                  ...Object.fromEntries(
                    FLOW_READING_CONTEXT_KEYS.map((key) => [key, null])
                  ),
                })
              } else if (item.type === 'runtime') {
                openGlobalDefinitionView('processes', {
                  [QUERY_KEYS.process]: item.key,
                })
              } else if (item.type === 'facts') {
                openGlobalDefinitionView('facts', {
                  [QUERY_KEYS.fact]: item.key,
                })
              } else if (item.type === 'states') {
                openGlobalDefinitionView('states', {
                  [QUERY_KEYS.flow]: item.key,
                  [QUERY_KEYS.state]: null,
                })
              } else openGlobalDefinitionView('workflow')
            }}
          />
        ) : null}
        <details className="erp-dev-disclosure erp-dev-flow-concepts">
          <summary>概念与数据边界</summary>
          <MemoryStrip />
        </details>
      </Drawer>
      <Modal
        title="客户校对稿"
        open={customerExportOpen}
        onCancel={() => {
          if (!printingCustomer) setCustomerExportOpen(false)
        }}
        closable={!printingCustomer}
        keyboard={!printingCustomer}
        maskClosable={!printingCustomer}
        cancelButtonProps={{ disabled: printingCustomer }}
        onOk={printCustomerReview}
        okText="打印 / 保存 PDF"
        confirmLoading={printingCustomer}
        okButtonProps={{ disabled: !customerReviewReady || !customerReview }}
      >
        <p>
          {taskScoped && taskId && !readingContext
            ? '当前任务尚未关联唯一业务链，暂不能导出校对稿。'
            : `导出范围：${
                customerReview?.documentTitle ||
                chainProjection?.chain.label ||
                chain?.label ||
                catalog?.businessChainOverview.label
              }`}
        </p>
        <DevCustomerScopeSelector
          scope={customerScope}
          onChange={customerScope.selectCustomer}
          label="客户"
          note="按所选客户配置生成设计校对稿；实际运行结果请导出当前视图。"
          invalidDescription="当前客户尚未登记校对预览，请选择已登记客户。"
        />
        {customerReady && !customerOverlay ? (
          <Alert
            type="warning"
            showIcon
            message="该客户没有业务链配置预览，暂不能导出校对稿"
          />
        ) : null}
      </Modal>
      <main
        key={`view-${sessionRevision}`}
        className="erp-dev-flow-main"
        data-flow-state-view={view}
      >
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
                  {topicsPage ? '恢复到业务专题' : '恢复到业务总图'}
                </Button>
              </Space>
            }
          />
        ) : null}
        {catalogState.status === 'ready' && catalog && valid
          ? renderView()
          : null}
      </main>
      <DevBusinessChainCustomerReviewPrint review={customerReviewPrint} />
    </div>
  )
}
