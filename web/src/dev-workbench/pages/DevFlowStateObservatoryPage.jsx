import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  InfoCircleOutlined,
  PartitionOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Popover, Space, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { StateRulesView } from '../components/flow-state/StateRulesView.jsx'
import { FactsView } from '../components/flow-state/FactsView.jsx'
import { RuntimeView } from '../components/flow-state/RuntimeView.jsx'
import { WorkflowView } from '../components/flow-state/WorkflowView.jsx'
import {
  BusinessChainOverviewView,
  BusinessChainView,
} from '../components/flow-state/BusinessChainViews.jsx'
import {
  Paragraph,
  Text,
  Title,
  VIEW_ITEMS,
  VIEW_META,
  cleanText,
  asArray,
  CatalogState,
  MemoryStrip,
  ContextStrip,
} from '../components/flow-state/FlowStateShared.jsx'
import SearchInput from '@/common/components/SearchInput'

import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
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
} from './devFlowStateQuery.mjs'
import '../styles/dev-flow-state-observatory.css'

const SOURCE_PATH = 'docs/architecture/业务链与运行轨迹边界.md'
const CATALOG_MODULE_PATH = '../config/devFlowStateCatalog.mjs'
const CATALOG_MODULES = import.meta.glob('../config/devFlowStateCatalog.mjs')

const KNOWN_QUERY_KEYS = new Set([
  ...Object.values(QUERY_KEYS),
  DEV_CUSTOMER_QUERY_KEY,
])

const VIEW_KEYS = new Set(VIEW_ITEMS.map((item) => item.value))

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

function invalidQueryMessages(searchParams, catalog) {
  const messages = []
  for (const key of new Set(searchParams.keys())) {
    if (!KNOWN_QUERY_KEYS.has(key)) messages.push(`未知 query 参数：${key}`)
    if (key !== DEV_CUSTOMER_QUERY_KEY && searchParams.getAll(key).length > 1) {
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
  const customerScope = useDevCustomerScope({
    searchParams,
    setSearchParams,
    normalize: view === 'chain',
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
  const [taskDraft, setTaskDraft] = useState(taskId)
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskLookupFocusRequest, setTaskLookupFocusRequest] = useState(0)
  const [customerReviewPrintSnapshot, setCustomerReviewPrintSnapshot] =
    useState(null)
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
  const projectionNodeKey = requestedNodeKey && node ? node.key : ''
  const chainProjection = useMemo(
    () =>
      catalog && chain
        ? buildDevBusinessChainProjection({
            catalog,
            chainKey: chain.key,
            nodeKey: projectionNodeKey,
          })
        : null,
    [catalog, chain, projectionNodeKey]
  )
  const availableFlows = chainProjection?.flows || catalog?.flows || []
  const availableProcessDefinitions =
    chainProjection?.processDefinitions || catalog?.processDefinitions || []
  const availableFactDefinitions =
    chainProjection?.factDefinitions || catalog?.factDefinitions || []
  const flow =
    availableFlows.find((item) => item.key === requestedFlowKey) ||
    availableFlows[0] ||
    null
  const state =
    flow && requestedStateKey
      ? flow.states.find((item) => item.key === requestedStateKey)
      : null
  const definition =
    availableProcessDefinitions.find(
      (item) => item.key === requestedProcessKey
    ) ||
    availableProcessDefinitions[0] ||
    null
  const fact =
    availableFactDefinitions.find(
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
    if (!catalog || !valid || view !== 'chain' || !customerReviewReady) {
      return null
    }
    const chainKey = overviewSelected
      ? catalog.businessChainOverview.key
      : chain?.key
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
    valid,
    view,
  ])
  const customerReviewScopeKey = customerReview
    ? [
        customerScope.customerKey,
        customerReview.version,
        customerReview.releaseVersion,
        overviewSelected ? catalog.businessChainOverview.key : chain?.key,
      ].join(':')
    : ''
  const customerReviewPrint =
    customerReviewPrintSnapshot?.scopeKey === customerReviewScopeKey
      ? customerReviewPrintSnapshot.review
      : null

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
    if (view === 'states' && requestedFlowKey !== flow?.key && flow) {
      patch[QUERY_KEYS.flow] = flow.key
      patch[QUERY_KEYS.state] = null
    }
    if (
      view === 'runtime' &&
      requestedProcessKey !== definition?.key &&
      definition
    ) {
      patch[QUERY_KEYS.process] = definition.key
    }
    if (view === 'runtime' && requestedProcessKey && !definition) {
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
    } else if (requestedChainKey) {
      nextPatch[QUERY_KEYS.chain] = requestedChainKey
      nextPatch[QUERY_KEYS.node] = requestedNodeKey || null
    }
    for (const [key, value] of Object.entries(patch)) {
      if (
        allowedSelectionKeys.includes(key) ||
        key === QUERY_KEYS.taskId ||
        key === QUERY_KEYS.chain ||
        key === QUERY_KEYS.node
      ) {
        nextPatch[key] = value
      }
    }
    updateParams(nextPatch)
  }
  const clearChainContext = () =>
    updateParams({
      [QUERY_KEYS.chain]: null,
      [QUERY_KEYS.node]: null,
    })
  const openGlobalDefinitionView = (nextView, patch = {}) =>
    openView(nextView, {
      [QUERY_KEYS.chain]: null,
      [QUERY_KEYS.node]: null,
      ...patch,
    })
  const printCustomerReview = async () => {
    if (!customerReviewReady || !customerReview || !customerReviewScopeKey) {
      return
    }
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
    if (!catalog) {
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
            onOpenView={openGlobalDefinitionView}
            onPrintCustomerReview={printCustomerReview}
            customerReviewReady={customerReviewReady}
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
          onOpenView={openGlobalDefinitionView}
          onPrintCustomerReview={printCustomerReview}
          customerReviewReady={customerReviewReady}
        />
      )
    }
    if (view === 'workflow') {
      return (
        <WorkflowView
          projection={chainProjection}
          taskId={taskId}
          draft={taskDraft}
          selectedTask={selectedTask}
          onDraftChange={setTaskDraft}
          onClearTask={clearTask}
          onSelectTask={selectTask}
          onBackToChain={() => openView('chain')}
          onClearChainContext={clearChainContext}
        />
      )
    }
    if (view === 'runtime') {
      return (
        <RuntimeView
          catalog={catalog}
          projection={chainProjection}
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
          onBackToChain={() => openView('chain')}
          onClearChainContext={clearChainContext}
        />
      )
    }
    if (view === 'facts') {
      return (
        <FactsView
          catalog={catalog}
          projection={chainProjection}
          fact={fact}
          onSelectFact={(key) => updateParams({ [QUERY_KEYS.fact]: key })}
          onOpenState={(key) =>
            openView('states', {
              [QUERY_KEYS.flow]: key,
              [QUERY_KEYS.state]: null,
            })
          }
          onBackToChain={() => openView('chain')}
          onClearChainContext={clearChainContext}
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
          updateParams({ [QUERY_KEYS.flow]: key, [QUERY_KEYS.state]: null })
        }
        onSelectState={(key) => updateParams({ [QUERY_KEYS.state]: key })}
        onOpenView={openView}
        onBackToChain={() => openView('chain')}
        onClearChainContext={clearChainContext}
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
              先看客户、产品等基础信息和销售、采购等业务单据怎样沿 11
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
      {catalogState.status === 'ready' && catalog && view === 'chain' ? (
        <>
          <DevCustomerScopeSelector
            scope={customerScope}
            onChange={customerScope.selectCustomer}
            label="甲方校对稿"
            note="选择只绑定甲方校对稿的客户配置预览；通用业务链仍来自 Product Core，不代表配置已发布或甲方已验收。"
            invalidDescription="当前甲方没有登记校对预览；甲方校对稿导出已停止，通用业务链与运行观察仍可使用。"
          />
          {customerReady && !customerOverlay ? (
            <Alert
              type="warning"
              showIcon
              message="所选甲方没有业务链配置预览"
              description="甲方校对稿导出已停止；请先登记只读客户配置预览，不能用产品通用设计冒充客户版本。"
            />
          ) : null}
        </>
      ) : null}
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
              openGlobalDefinitionView('workflow')
            }}
            onOpen={(item) => {
              if (item.type === 'chain') {
                openView('chain', {
                  [QUERY_KEYS.chain]: item.key,
                  [QUERY_KEYS.node]: item.nodeKey || null,
                })
              } else if (item.type === 'runtime') {
                openGlobalDefinitionView('runtime', {
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
            view === 'chain' && overviewSelected
              ? catalog.businessChainOverview
              : chain
          }
          node={view === 'chain' && overviewSelected ? null : node}
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
      <DevBusinessChainCustomerReviewPrint review={customerReviewPrint} />
    </div>
  )
}
