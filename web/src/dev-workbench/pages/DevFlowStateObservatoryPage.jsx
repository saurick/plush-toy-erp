import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  PartitionOutlined,
  ReloadOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { useSearchParams } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import { getWorkflowTaskProcessContext } from '@/erp/api/workflowApi.mjs'
import {
  formatProcessStartedAt,
  getProcessLabel,
  getProcessNodeLabel,
  getProcessNodeStatusLabel,
  getProcessStatusLabel,
} from '@/erp/utils/processRuntimePresentation.mjs'
import '../styles/dev-flow-state-observatory.css'

const { Paragraph, Text, Title } = Typography

const SOURCE_PATH = 'docs/architecture/状态工作流事实边界.md'
const CATALOG_MODULE_PATH = '../config/devFlowStateCatalog.mjs'
const CATALOG_MODULES = import.meta.glob('../config/devFlowStateCatalog.mjs')

const QUERY_KEYS = Object.freeze({
  scope: 'scope',
  customer: 'customer',
  process: 'process',
  view: 'view',
  flow: 'flow',
  state: 'state',
  search: 'q',
  layers: 'layers',
  pathMode: 'path_mode',
  pathKind: 'path_kind',
  pathObjects: 'path_objects',
  taskId: 'task_id',
})

const VIEW_ITEMS = Object.freeze([
  {
    value: 'overview',
    label: '总览',
    description: '边界、目录规模与阅读入口',
  },
  {
    value: 'machine',
    label: '单机状态图',
    description: '一项状态对象的允许迁移',
  },
  {
    value: 'dictionary',
    label: '状态字典',
    description: '状态、初终态与进出路径',
  },
  {
    value: 'orchestration',
    label: '流程编排 / 客户差异',
    description: 'Product Core 定义与甲方预览',
  },
  {
    value: 'runtime',
    label: '运行轨迹 / 证据',
    description: '按 task_id 读取真实流程位置',
  },
])

const VIEW_KEYS = new Set(VIEW_ITEMS.map((item) => item.value))
const DEFAULT_VIEW = VIEW_ITEMS[0].value
const DEFAULT_LAYER_KEYS = Object.freeze(['business', 'state'])
const PATH_MODE_ITEMS = Object.freeze([
  { value: 'off', label: '关闭路径叠加' },
  { value: 'overlay', label: '在完整图中高亮' },
  { value: 'only', label: '仅看异常、纠正与恢复路径' },
])
const PATH_MODE_KEYS = new Set(PATH_MODE_ITEMS.map((item) => item.value))
const PATH_KIND_PRESENTATION = Object.freeze({
  blocked: '阻塞',
  rejected: '退回 / 拒绝',
  cancelled: '取消',
  reversed: '冲正',
  adjusted: '调整',
  returned: '退货 / 退回',
  rework: '返工',
  resumed: '恢复',
})

const LAYER_PRESENTATION = Object.freeze({
  business: { label: '业务', description: '业务动作和对象语义' },
  state: { label: '状态', description: '状态 key 与迁移方向' },
  role: { label: '岗位', description: '责任岗位和权限边界' },
  workflow: { label: 'Workflow', description: '协同任务和流程节点' },
  approval: { label: '审批', description: '审批责任与通过条件' },
  task: { label: '任务', description: '任务创建和办理位置' },
  exception: {
    label: '异常、纠正与恢复',
    description: '仅使用已登记 pathKinds，不按文案猜测',
  },
  notification: { label: '通知', description: '通知和提醒证据' },
  automation: { label: '自动', description: '受控自动动作' },
  fact: { label: 'Fact', description: '事实写入边界' },
})

const STATUS_TAG_COLOR = Object.freeze({
  active: 'green',
  blocked: 'red',
  completed: 'blue',
  waiting: 'default',
})

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function normalizeStringList(value) {
  return [
    ...new Set(
      asArray(value)
        .map((item) => cleanText(item))
        .filter(Boolean)
    ),
  ]
}

function normalizeEvidenceItem(value, index, prefix = 'evidence') {
  if (typeof value === 'string' && value.trim()) {
    return {
      key: `${prefix}-${index}-${value}`,
      label: value.trim(),
      path: value.trim(),
      note: '',
    }
  }
  if (!isRecord(value)) return null
  const path = firstText(
    value.path,
    value.ref,
    value.sourcePath,
    value.source_path,
    value.file
  )
  const note = firstText(
    value.note,
    value.summary,
    value.description,
    value.label
  )
  const label = firstText(value.label, value.title, path, note, value.key)
  if (!label) return null
  return {
    key: firstText(value.key, `${prefix}-${index}-${label}`),
    label,
    path,
    note: note === label ? '' : note,
  }
}

function normalizeEvidence(...values) {
  const items = values.flatMap((value) => asArray(value))
  const seen = new Set()
  return items
    .map((item, index) => normalizeEvidenceItem(item, index))
    .filter((item) => {
      if (!item) return false
      const identity = `${item.path}\u0000${item.label}\u0000${item.note}`
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
}

function uniqueEvidenceSources(...values) {
  const seen = new Set()
  return normalizeEvidence(...values).filter((item) => {
    const identity = firstText(item.path, item.label, item.note, item.key)
    if (!identity || seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function normalizeTransition(value, index) {
  if (!isRecord(value)) return null
  const from = firstText(value.from, value.fromState, value.from_state)
  const to = firstText(value.to, value.toState, value.to_state)
  if (!from || !to) return null
  const key = firstText(value.key, `${from}-to-${to}-${index}`)
  return {
    key,
    from,
    to,
    label: firstText(value.label, value.name, key),
    guard: firstText(value.guard, value.condition),
    action: firstText(value.action, value.command),
    permission: normalizeStringList(
      Array.isArray(value.permission)
        ? value.permission
        : [value.permission, value.permissionKey, value.permission_key]
    ).join('、'),
    factBoundary: firstText(
      value.factBoundary,
      value.fact_boundary,
      value.boundary
    ),
    pathKinds: normalizeStringList(value.pathKinds || value.path_kinds),
    pathKindWhen: firstText(value.pathKindWhen, value.path_kind_when),
    automatic:
      typeof value.automatic === 'boolean'
        ? value.automatic
        : typeof value.auto === 'boolean'
          ? value.auto
          : null,
    evidence: normalizeEvidence(
      value.sourceRefs,
      value.source_refs,
      value.evidence
    ),
  }
}

function normalizeState(value, index, initialStates, terminalStates) {
  if (typeof value === 'string' && value.trim()) {
    const key = value.trim()
    return {
      key,
      label: key,
      summary: '',
      initial: initialStates.has(key),
      terminal: terminalStates.has(key),
      evidence: [],
    }
  }
  if (!isRecord(value)) return null
  const key = firstText(value.key, value.value, value.status, `state-${index}`)
  if (!key) return null
  return {
    key,
    label: firstText(value.label, value.name, key),
    summary: firstText(value.summary, value.description),
    initial: value.initial === true || initialStates.has(key),
    terminal: value.terminal === true || terminalStates.has(key),
    evidence: normalizeEvidence(
      value.sourceRefs,
      value.source_refs,
      value.evidence
    ),
  }
}

function normalizeFlow(value, index) {
  if (!isRecord(value)) return null
  const key = firstText(value.key, `flow-${index}`)
  const initialStates = new Set(
    normalizeStringList(
      value.initialStates || value.initial_states || value.initial
    )
  )
  const terminalStates = new Set(
    normalizeStringList(
      value.terminalStates || value.terminal_states || value.terminal
    )
  )
  const states = asArray(value.states)
    .map((state, stateIndex) =>
      normalizeState(state, stateIndex, initialStates, terminalStates)
    )
    .filter(Boolean)
  states.forEach((state) => {
    if (state.initial) initialStates.add(state.key)
    if (state.terminal) terminalStates.add(state.key)
  })
  const transitions = asArray(value.transitions)
    .map(normalizeTransition)
    .filter(Boolean)
  const evidence = normalizeEvidence(
    value.sourceRefs,
    value.source_refs,
    value.evidence
  )
  const searchText = [
    key,
    value.label,
    value.summary,
    value.kind,
    value.scopeKey,
    ...states.flatMap((state) => [state.key, state.label, state.summary]),
    ...transitions.flatMap((transition) => [
      transition.key,
      transition.label,
      transition.from,
      transition.to,
      transition.guard,
      transition.action,
      transition.permission,
      transition.factBoundary,
      ...transition.pathKinds,
      transition.pathKindWhen,
    ]),
    ...evidence.flatMap((item) => [item.label, item.path, item.note]),
  ]
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase('zh-CN')
  return {
    key,
    label: firstText(value.label, value.name, key),
    scopeKey: firstText(value.scopeKey, value.scope_key, 'product-core'),
    kind: firstText(value.kind, value.type, 'state_machine'),
    summary: firstText(value.summary, value.description),
    previewOnly: value.previewOnly === true || value.preview_only === true,
    runtimeAuthority: firstText(
      value.runtimeAuthority,
      value.runtime_authority
    ),
    initialStates: [...initialStates],
    terminalStates: [...terminalStates],
    states,
    transitions,
    guard: firstText(value.guard),
    action: firstText(value.action),
    permission: normalizeStringList(
      Array.isArray(value.permission) ? value.permission : [value.permission]
    ).join('、'),
    factBoundary: firstText(value.factBoundary, value.fact_boundary),
    evidence,
    allowsGenericStatusWrite: value.allowsGenericStatusWrite === true,
    searchText,
  }
}

function normalizeScope(value, index) {
  if (typeof value === 'string' && value.trim()) {
    return {
      key: value.trim(),
      label: value.trim(),
      description: '',
      kind: '',
    }
  }
  if (!isRecord(value)) return null
  const key = firstText(value.key, value.value, `scope-${index}`)
  if (!key) return null
  return {
    key,
    label: firstText(value.label, value.name, key),
    description: firstText(value.description, value.summary),
    kind: firstText(value.kind, value.type),
  }
}

function normalizeFlowLayer(value, index) {
  if (typeof value === 'string' && value.trim()) {
    const key = value.trim()
    return {
      key,
      label: LAYER_PRESENTATION[key]?.label || key,
      description: LAYER_PRESENTATION[key]?.description || '',
      boundary: '',
    }
  }
  if (!isRecord(value)) return null
  const key = firstText(value.key, value.value, `layer-${index}`)
  if (!key) return null
  return {
    key,
    label: firstText(
      value.label,
      value.name,
      LAYER_PRESENTATION[key]?.label,
      key
    ),
    description: firstText(
      value.description,
      value.summary,
      LAYER_PRESENTATION[key]?.description
    ),
    boundary: firstText(value.boundary, value.guardrail),
  }
}

function normalizeCustomerOverlay(value, index) {
  if (!isRecord(value)) return null
  const definition = isRecord(value.definition) ? value.definition : {}
  const key = firstText(value.key, value.customerKey, `customer-${index}`)
  return {
    key,
    label: firstText(value.label, value.name, value.customerLabel, key),
    scopeKey: firstText(value.scopeKey, value.scope_key, value.customerKey),
    summary: firstText(value.summary, value.description),
    previewOnly: value.previewOnly !== false,
    runtimeAuthority: firstText(
      value.runtimeAuthority,
      value.runtime_authority
    ),
    comparison: value.comparison,
    definition,
    businessFlows: asArray(value.businessFlows || value.business_flows),
    stateMachines: asArray(value.stateMachines || value.state_machines),
    processPolicies: asArray(value.processPolicies || value.process_policies),
    runtimeProcessSelections: asArray(
      value.runtimeProcessSelections || value.runtime_process_selections
    ),
    evidence: normalizeEvidence(
      value.sourceRefs,
      value.source_refs,
      value.evidence,
      definition.sourceRefs,
      definition.source_refs,
      definition.evidence
    ),
  }
}

function normalizeProcessNode(value, index) {
  if (!isRecord(value)) return null
  const key = firstText(value.key, `node-${index}`)
  return {
    key,
    label: firstText(value.label, value.name, key),
    type: firstText(value.type, value.nodeType, value.node_type),
    ownerPool: firstText(
      value.ownerPool,
      value.owner_pool,
      value.ownerRole,
      value.owner_role
    ),
    action: firstText(value.action, value.command),
    permission: normalizeStringList(
      Array.isArray(value.permission) ? value.permission : [value.permission]
    ).join('、'),
    factBoundary: firstText(value.factBoundary, value.fact_boundary),
    evidence: normalizeEvidence(
      value.sourceRefs,
      value.source_refs,
      value.evidence
    ),
  }
}

function normalizeProcessDefinition(value, index) {
  if (!isRecord(value)) return null
  const processKey = firstText(
    value.processKey,
    value.process_key,
    value.key,
    `process-${index}`
  )
  const variantKey = firstText(value.variantKey, value.variant_key, 'default')
  const key = firstText(value.key, `${processKey}:${variantKey}`)
  const nodes = asArray(value.nodes).map(normalizeProcessNode).filter(Boolean)
  const nodeKeys = new Set(nodes.map((node) => node.key))
  const edges = asArray(value.edges)
    .map((edge, edgeIndex) => {
      if (!isRecord(edge)) return null
      const from = firstText(edge.from, edge.fromNode, edge.from_node)
      const to = firstText(edge.to, edge.toNode, edge.to_node)
      if (!from || !to || !nodeKeys.has(from) || !nodeKeys.has(to)) {
        return null
      }
      return {
        key: firstText(edge.key, `${from}->${to}-${edgeIndex}`),
        from,
        to,
      }
    })
    .filter(Boolean)
  return {
    key,
    processKey,
    processVersion: firstText(
      value.processVersion,
      value.process_version,
      value.version
    ),
    variantKey,
    businessRefType: firstText(value.businessRefType, value.business_ref_type),
    label: firstText(value.label, value.name, processKey),
    initial: firstText(value.initial, value.initialNode, value.initial_node),
    terminal: firstText(
      value.terminal,
      value.terminalNode,
      value.terminal_node
    ),
    nodes,
    edges,
    readOnly: value.readOnly === true,
    runtimeAuthority: firstText(
      value.runtimeAuthority,
      value.runtime_authority
    ),
    evidence: normalizeEvidence(
      value.sourceRefs,
      value.source_refs,
      value.evidence
    ),
  }
}

function deriveScopes(flows, customerOverlays) {
  const keys = [
    ...flows.map((flow) => flow.scopeKey),
    ...customerOverlays.map((overlay) => overlay.scopeKey),
  ].filter(Boolean)
  return [...new Set(keys)].map((key) => ({
    key,
    label: key,
    description: '',
    kind: '',
  }))
}

function adaptCatalogModule(moduleValue) {
  const raw = moduleValue?.DEV_FLOW_STATE_CATALOG || moduleValue?.default
  if (!isRecord(raw)) {
    throw new Error('状态目录模块没有导出 DEV_FLOW_STATE_CATALOG')
  }
  if (raw.readOnly !== true) {
    throw new Error('状态目录没有声明只读边界')
  }
  const flows = asArray(raw.flows).map(normalizeFlow).filter(Boolean)
  if (flows.some((flow) => flow.allowsGenericStatusWrite)) {
    throw new Error('状态目录包含通用状态写入能力，观察台已拒绝加载')
  }
  const flowLayers = asArray(raw.flowLayers)
    .map(normalizeFlowLayer)
    .filter(Boolean)
  const customerOverlays = asArray(raw.customerOverlays || raw.overlays)
    .map(normalizeCustomerOverlay)
    .filter(Boolean)
  const processDefinitions = asArray(raw.processDefinitions)
    .map(normalizeProcessDefinition)
    .filter(Boolean)
  const pathKinds = normalizeStringList(
    raw.pathKinds || moduleValue?.DEV_FLOW_PATH_KINDS
  )
  if (pathKinds.length === 0) {
    throw new Error('状态目录没有声明受限 pathKinds')
  }
  const allowedPathKinds = new Set(pathKinds)
  const unknownPathKinds = flows.flatMap((flow) =>
    flow.transitions.flatMap((transition) =>
      transition.pathKinds.filter((pathKind) => !allowedPathKinds.has(pathKind))
    )
  )
  if (unknownPathKinds.length > 0) {
    throw new Error(
      `状态目录包含未知 pathKinds: ${unknownPathKinds.join('、')}`
    )
  }
  const declaredScopes = asArray(raw.scopes).map(normalizeScope).filter(Boolean)
  return {
    version: firstText(raw.version, 'unknown'),
    route: firstText(raw.route),
    readOnly: true,
    runtimeAuthority: firstText(raw.runtimeAuthority, raw.runtime_authority),
    scopes:
      declaredScopes.length > 0
        ? declaredScopes
        : deriveScopes(flows, customerOverlays),
    flowLayers,
    pathKinds,
    customerOverlays,
    processDefinitions,
    flows,
  }
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
      CATALOG_MODULES[CATALOG_MODULE_PATH] ||
      Object.values(CATALOG_MODULES).at(0)
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
          catalog: adaptCatalogModule(moduleValue),
          error: '',
        })
      })
      .catch((error) => {
        if (!active) return
        setState({
          status: 'error',
          catalog: null,
          error: getActionErrorMessage(error, '读取流程状态目录'),
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
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      next.delete(key)
      return
    }
    next.set(key, String(value))
  })
  return next
}

function countEvidence(flows) {
  return uniqueEvidenceSources(
    ...flows.map((flow) => flow.evidence),
    ...flows.flatMap((flow) => flow.states.map((state) => state.evidence)),
    ...flows.flatMap((flow) =>
      flow.transitions.map((transition) => transition.evidence)
    )
  ).length
}

function formatDefinitionValue(value) {
  if (value === true) return '是'
  if (value === false) return '否'
  if (value === null || value === undefined || value === '') return '未声明'
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('、') : '未声明'
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${formatDefinitionValue(item)}`)
      .join('；')
  }
  return String(value)
}

function escapeMermaid(value) {
  return String(value || '')
    .replace(/[\r\n]+/gu, ' ')
    .replace(/"/gu, "'")
    .replace(/[{}[\]]/gu, '')
    .trim()
}

function compactGraphText(value, maxLength = 16) {
  const characters = Array.from(cleanText(value))
  if (characters.length <= maxLength) return characters.join('')
  return `${characters.slice(0, Math.max(1, maxLength - 1)).join('')}…`
}

function graphFactBoundaryLabel(value) {
  const boundary = cleanText(value)
  if (!boundary) return ''
  if (/workflow/iu.test(boundary)) return '仅工作流'
  if (/orchestration|process/iu.test(boundary)) return '仅编排'
  if (/source[_\s-]?document|单据/iu.test(boundary)) return '仅单据'
  if (/master[_\s-]?data|主数据/iu.test(boundary)) return '主数据'
  if (/read[_\s-]?only|projection|投影/iu.test(boundary)) return '只读投影'
  if (/inventory|库存/iu.test(boundary)) return '库存 Fact'
  if (/finance|财务/iu.test(boundary)) return '财务 Fact'
  if (/quality|质检/iu.test(boundary)) return '质检 Fact'
  return '领域 Fact'
}

function graphTransitionLabel(transition, targetState) {
  if (transition.pathKinds.length > 0) {
    return (
      transition.pathKinds
        .map((pathKind) => PATH_KIND_PRESENTATION[pathKind])
        .filter(Boolean)
        .join(' / ') ||
      targetState?.label ||
      '流转'
    )
  }
  return targetState?.label || '流转'
}

function transitionMatchesPathKind(transition, pathKind) {
  return (
    transition.pathKinds.length > 0 &&
    (!pathKind || transition.pathKinds.includes(pathKind))
  )
}

function transitionLayerValues(transition, activeLayers, statesByKey) {
  const targetState = statesByKey.get(transition.to)
  const transitionText = [
    transition.key,
    transition.action,
    transition.permission,
    transition.guard,
    transition.from,
    transition.to,
  ].join(' ')
  const primary = []
  const semantic = []
  const addUnique = (target, value) => {
    const text = compactGraphText(value, 12)
    if (text && !primary.includes(text) && !semantic.includes(text)) {
      target.push(text)
    }
  }

  if (activeLayers.has('business')) {
    addUnique(primary, graphTransitionLabel(transition, targetState))
  }
  if (
    activeLayers.has('approval') &&
    /approve|approval|审批/iu.test(transitionText)
  ) {
    addUnique(semantic, '审批')
  }
  if (activeLayers.has('exception') && transition.pathKinds.length > 0) {
    addUnique(
      semantic,
      transition.pathKinds
        .map((pathKind) => PATH_KIND_PRESENTATION[pathKind])
        .filter(Boolean)
        .join('/')
    )
  }
  if (activeLayers.has('fact')) {
    addUnique(semantic, graphFactBoundaryLabel(transition.factBoundary))
  }
  if (activeLayers.has('automation') && transition.automatic !== null) {
    addUnique(semantic, transition.automatic ? '自动' : '人工')
  }
  if (
    activeLayers.has('notification') &&
    transition.evidence.some((item) =>
      /notification|notify|remind|通知|提醒/iu.test(
        `${item.path} ${item.label} ${item.note}`
      )
    )
  ) {
    addUnique(semantic, '通知')
  }
  if (
    (activeLayers.has('workflow') || activeLayers.has('task')) &&
    /workflow|task|任务/iu.test(transitionText)
  ) {
    addUnique(semantic, '任务')
  }

  return [...primary, ...semantic].slice(0, 3)
}

function buildFlowMermaid(flow, layerKeys, pathMode = 'off', pathKind = '') {
  if (!flow || flow.states.length === 0) return ''
  const activeLayers = new Set(layerKeys)
  const nodeIdByKey = new Map()
  const statesByKey = new Map(flow.states.map((state) => [state.key, state]))
  const transitions =
    pathMode === 'only'
      ? flow.transitions.filter((transition) =>
          transitionMatchesPathKind(transition, pathKind)
        )
      : flow.transitions
  if (pathMode === 'only' && transitions.length === 0) return ''
  const visibleStateKeys =
    pathMode === 'only'
      ? new Set(
          transitions.flatMap((transition) => [transition.from, transition.to])
        )
      : null
  const visibleStates = visibleStateKeys
    ? flow.states.filter((state) => visibleStateKeys.has(state.key))
    : flow.states
  const lines = ['flowchart LR']
  visibleStates.forEach((state, index) => {
    const nodeId = `state_${index}`
    nodeIdByKey.set(state.key, nodeId)
    const labelParts = [
      compactGraphText(state.label, 12),
      activeLayers.has('state') && state.key !== state.label
        ? compactGraphText(state.key, 16)
        : '',
    ].filter(Boolean)
    const label = escapeMermaid(labelParts.join(' · '))
    if (state.initial) {
      lines.push(`  ${nodeId}(["${label}"])`)
    } else if (state.terminal) {
      lines.push(`  ${nodeId}(("${label}"))`)
    } else {
      lines.push(`  ${nodeId}["${label}"]`)
    }
  })
  const highlightedLinks = []
  transitions.forEach((transition, linkIndex) => {
    const from = nodeIdByKey.get(transition.from)
    const to = nodeIdByKey.get(transition.to)
    if (!from || !to) return
    const label = escapeMermaid(
      compactGraphText(
        transitionLayerValues(transition, activeLayers, statesByKey).join(
          ' · '
        ),
        28
      )
    )
    lines.push(
      label ? `  ${from} -->|"${label}"| ${to}` : `  ${from} --> ${to}`
    )
    if (
      pathMode === 'overlay' &&
      transitionMatchesPathKind(transition, pathKind)
    ) {
      highlightedLinks.push(linkIndex)
    }
  })
  if (highlightedLinks.length > 0) {
    lines.push(
      `  linkStyle ${highlightedLinks.join(',')} stroke:#d4380d,stroke-width:3px`
    )
  }
  return lines.join('\n')
}

function EvidenceList({ items, emptyText = '目录未声明来源证据' }) {
  if (!items.length) {
    return <Text type="secondary">{emptyText}</Text>
  }
  return (
    <ul className="erp-dev-flow-state-evidence-list">
      {items.map((item) => (
        <li key={item.key}>
          {item.path ? <code>{item.path}</code> : <span>{item.label}</span>}
          {item.note ? <small>{item.note}</small> : null}
        </li>
      ))}
    </ul>
  )
}

function EvidenceDisclosure({
  items,
  label = '查看实现依据',
  context = 'general',
}) {
  const uniqueItems = uniqueEvidenceSources(items)
  if (!uniqueItems.length) return null
  return (
    <details
      className="erp-dev-flow-state-evidence-disclosure"
      data-evidence-disclosure={context}
    >
      <summary>
        <span>{label}</span>
        <small>{uniqueItems.length} 个来源，按需展开</small>
      </summary>
      <EvidenceList items={uniqueItems} />
    </details>
  )
}

function DefinitionFacts({ flow }) {
  if (!flow) return null
  return (
    <dl className="erp-dev-flow-state-facts">
      <div>
        <dt>状态对象 key</dt>
        <dd>
          <code>{flow.key}</code>
        </dd>
      </div>
      <div>
        <dt>初态</dt>
        <dd>{formatDefinitionValue(flow.initialStates)}</dd>
      </div>
      <div>
        <dt>终态</dt>
        <dd>{formatDefinitionValue(flow.terminalStates)}</dd>
      </div>
      <div>
        <dt>Guard</dt>
        <dd>{flow.guard || '由各迁移分别声明'}</dd>
      </div>
      <div>
        <dt>Action</dt>
        <dd>{flow.action || '由各迁移分别声明'}</dd>
      </div>
      <div>
        <dt>Permission</dt>
        <dd>{flow.permission || '由各迁移分别声明'}</dd>
      </div>
      <div>
        <dt>Fact boundary</dt>
        <dd>{flow.factBoundary || '目录未声明'}</dd>
      </div>
      <div>
        <dt>运行权威</dt>
        <dd>{flow.runtimeAuthority || '目录未声明'}</dd>
      </div>
    </dl>
  )
}

function TransitionCards({ transitions }) {
  if (!transitions.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="当前状态对象没有登记迁移"
      />
    )
  }
  return (
    <div className="erp-dev-flow-state-transition-list">
      {transitions.map((transition) => (
        <article className="erp-dev-flow-state-transition" key={transition.key}>
          <div className="erp-dev-flow-state-transition__head">
            <span>
              <strong>{transition.label}</strong>
              {transition.pathKinds.map((pathKind) => (
                <Tag color="volcano" key={pathKind}>
                  {PATH_KIND_PRESENTATION[pathKind] || pathKind}
                </Tag>
              ))}
            </span>
            <code>
              {transition.from} → {transition.to}
            </code>
          </div>
          <dl>
            <div>
              <dt>Guard</dt>
              <dd>{transition.guard || '未声明'}</dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd>{transition.action || '未声明'}</dd>
            </div>
            <div>
              <dt>Permission</dt>
              <dd>{transition.permission || '未声明'}</dd>
            </div>
            <div>
              <dt>Fact boundary</dt>
              <dd>{transition.factBoundary || '未声明'}</dd>
            </div>
            {transition.pathKindWhen ? (
              <div>
                <dt>路径适用条件</dt>
                <dd>{transition.pathKindWhen}</dd>
              </div>
            ) : null}
          </dl>
          <EvidenceDisclosure
            context={`transition-${transition.key}`}
            label="查看此迁移的 canonical 依据"
            items={transition.evidence}
          />
        </article>
      ))}
    </div>
  )
}

function OverviewView({ catalog, flows, onOpenFlow }) {
  const stateCount = flows.reduce(
    (count, flow) => count + flow.states.length,
    0
  )
  const transitionCount = flows.reduce(
    (count, flow) => count + flow.transitions.length,
    0
  )
  return (
    <div className="erp-dev-flow-state-view-stack">
      <section className="erp-dev-flow-state-summary-grid">
        <article>
          <span>状态对象</span>
          <strong>{flows.length}</strong>
          <small>当前范围与搜索结果</small>
        </article>
        <article>
          <span>状态</span>
          <strong>{stateCount}</strong>
          <small>不跨层合并同名状态</small>
        </article>
        <article>
          <span>允许迁移</span>
          <strong>{transitionCount}</strong>
          <small>只读合同，不提供写按钮</small>
        </article>
        <article>
          <span>来源证据</span>
          <strong>{countEvidence(flows)}</strong>
          <small>代码、文档和测试引用</small>
        </article>
      </section>

      <Alert
        showIcon
        type="info"
        message="一张观察台，多个状态真源"
        description="Source Document、Workflow Task、ProcessRuntime 与 Fact/Ledger 各自保留唯一真源。本页只帮助定位和比较，不把它们压成万能状态字典。"
      />

      <section className="erp-dev-flow-state-layer-coverage">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text strong>九类流覆盖</Text>
            <Text type="secondary">
              这些是观察维度，不是九台同构状态机；岗位 / owner 在流程编排的
              Product Core 节点详情中查看。
            </Text>
          </div>
          <Tag>{catalog.flowLayers.length} 类</Tag>
        </div>
        <div>
          {catalog.flowLayers.map((layer) => (
            <article key={layer.key}>
              <div>
                <strong>{layer.label}</strong>
                <code>{layer.key}</code>
              </div>
              <p>{layer.description || '目录未声明说明。'}</p>
              <small>{layer.boundary || '目录未声明边界。'}</small>
            </article>
          ))}
        </div>
      </section>

      {flows.length > 0 ? (
        <section
          className="erp-dev-flow-state-flow-grid"
          aria-label="可观察状态对象"
        >
          {flows.map((flow) => (
            <article key={flow.key}>
              <div className="erp-dev-flow-state-flow-card__head">
                <Tag color={flow.previewOnly ? 'cyan' : 'green'}>
                  {flow.previewOnly ? '仅预览' : flow.kind}
                </Tag>
                <code>{flow.key}</code>
              </div>
              <h3>{flow.label}</h3>
              <p>{flow.summary || '目录未补充说明。'}</p>
              <div className="erp-dev-flow-state-flow-card__metrics">
                <span>{flow.states.length} 个状态</span>
                <span>{flow.transitions.length} 条迁移</span>
              </div>
              <Button
                type="link"
                onClick={() => onOpenFlow(flow.key, 'machine')}
              >
                打开单机状态图
              </Button>
            </article>
          ))}
        </section>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="没有匹配的状态机"
        />
      )}

      <section className="erp-dev-flow-state-source-panel">
        <div>
          <DatabaseOutlined aria-hidden="true" />
          <strong>目录版本</strong>
        </div>
        <code>{catalog.version}</code>
        <span>
          Catalog 不拥有运行态；运行轨迹必须通过后端命名只读 API 取得。
        </span>
      </section>
    </div>
  )
}

function MachineView({ flow, layerKeys, pathMode, pathKind }) {
  const visibleTransitions = useMemo(
    () =>
      pathMode === 'only'
        ? flow?.transitions.filter((transition) =>
            transitionMatchesPathKind(transition, pathKind)
          ) || []
        : flow?.transitions || [],
    [flow, pathKind, pathMode]
  )
  const mermaid = useMemo(
    () => buildFlowMermaid(flow, layerKeys, pathMode, pathKind),
    [flow, layerKeys, pathKind, pathMode]
  )
  if (!flow) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="没有匹配的状态机"
      />
    )
  }
  return (
    <div className="erp-dev-flow-state-view-stack">
      <section className="erp-dev-flow-state-definition">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text className="erp-dev-flow-state-eyebrow">单机状态图</Text>
            <Title level={2}>{flow.label}</Title>
          </div>
          <Space wrap>
            {flow.previewOnly ? <Tag color="cyan">仅预览</Tag> : null}
            <Tag color="green">只读合同</Tag>
            {pathMode !== 'off' ? (
              <Tag color="volcano">
                {PATH_MODE_ITEMS.find((item) => item.value === pathMode)?.label}
              </Tag>
            ) : null}
          </Space>
        </div>
        <DefinitionFacts flow={flow} />
      </section>

      <section className="erp-dev-flow-state-diagram">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text strong>允许迁移</Text>
            <Text type="secondary">
              图内只保留短状态名和短语义；完整条件、权限与来源在下方查看。
            </Text>
          </div>
          <Tag>{flow.states.length} 个状态</Tag>
        </div>
        {mermaid ? (
          <div className="erp-dev-flow-state-mermaid erp-dev-docs-markdown">
            <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              pathMode === 'only'
                ? '当前对象没有命中的异常、纠正或恢复路径'
                : '状态目录尚未提供可画的节点'
            }
          />
        )}
      </section>

      <section className="erp-dev-flow-state-definition">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text strong>迁移详情</Text>
            <Text type="secondary">
              Guard、Action、Permission 与 Fact boundary 保持分列。
            </Text>
          </div>
        </div>
        <TransitionCards transitions={visibleTransitions} />
        <EvidenceDisclosure
          context="machine"
          label="查看本状态机的实现依据"
          items={uniqueEvidenceSources(
            flow.evidence,
            ...flow.states.map((state) => state.evidence),
            ...flow.transitions.map((transition) => transition.evidence)
          )}
        />
      </section>
    </div>
  )
}

function GlobalStateTree({
  scopes,
  flows,
  selectedFlow,
  selectedState,
  onSelect,
}) {
  const groups = scopes
    .map((scope) => ({
      scope,
      flows: flows.filter((flow) => flow.scopeKey === scope.key),
    }))
    .filter((group) => group.flows.length > 0)
  if (!groups.length) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="状态字典为空" />
    )
  }
  return (
    <div className="erp-dev-flow-state-global-tree" role="tree">
      {groups.map((group) => (
        <section
          key={group.scope.key}
          role="group"
          aria-label={group.scope.label}
        >
          <div className="erp-dev-flow-state-global-tree__scope">
            <strong>{group.scope.label}</strong>
            <Tag>{group.flows.length} 个对象</Tag>
          </div>
          {group.flows.map((machine) => {
            const machineSelected = machine.key === selectedFlow?.key
            return (
              <div
                className="erp-dev-flow-state-global-tree__machine"
                key={machine.key}
              >
                <button
                  type="button"
                  role="treeitem"
                  aria-expanded={machineSelected}
                  aria-selected={machineSelected && !selectedState}
                  className={
                    machineSelected
                      ? 'erp-dev-flow-state-machine-item erp-dev-flow-state-machine-item--active'
                      : 'erp-dev-flow-state-machine-item'
                  }
                  onClick={() => onSelect(machine.key, '')}
                >
                  <span>
                    <strong>{machine.label}</strong>
                    <code>{machine.key}</code>
                  </span>
                  <span>
                    <Tag>{machine.states.length}</Tag>
                    {machine.terminalStates.length === 0 ? (
                      <Tag color="gold">无终态</Tag>
                    ) : null}
                  </span>
                </button>
                {machineSelected ? (
                  <div role="group" aria-label={`${machine.label} 状态`}>
                    {machine.states.map((state) => {
                      const stateSelected = state.key === selectedState?.key
                      return (
                        <button
                          type="button"
                          role="treeitem"
                          aria-selected={stateSelected}
                          className={
                            stateSelected
                              ? 'erp-dev-flow-state-state-item erp-dev-flow-state-state-item--active'
                              : 'erp-dev-flow-state-state-item'
                          }
                          key={state.key}
                          onClick={() => onSelect(machine.key, state.key)}
                        >
                          <span>
                            <strong>{state.label}</strong>
                            <code>{state.key}</code>
                          </span>
                          <span>
                            {state.initial ? (
                              <Tag color="green">初态</Tag>
                            ) : null}
                            {state.terminal ? (
                              <Tag color="blue">终态</Tag>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function DictionaryView({
  scopes,
  flows,
  flow,
  requestedStateKey,
  onSelectFlowState,
}) {
  const selectedState =
    flow?.states.find((state) => state.key === requestedStateKey) ||
    (!requestedStateKey ? flow?.states[0] : null)
  if (!flow) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="没有匹配的状态对象"
      />
    )
  }
  const incoming = selectedState
    ? flow.transitions.filter(
        (transition) => transition.to === selectedState.key
      )
    : []
  const outgoing = selectedState
    ? flow.transitions.filter(
        (transition) => transition.from === selectedState.key
      )
    : []
  return (
    <div className="erp-dev-flow-state-dictionary-layout">
      <section className="erp-dev-flow-state-state-tree">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text strong>全局状态字典树</Text>
            <Text type="secondary">状态域 → 状态对象 → 状态</Text>
          </div>
          <Tag>{flows.length} 个对象</Tag>
        </div>
        <GlobalStateTree
          scopes={scopes}
          flows={flows}
          selectedFlow={flow}
          selectedState={selectedState}
          onSelect={onSelectFlowState}
        />
      </section>

      <section className="erp-dev-flow-state-state-detail">
        {requestedStateKey && !selectedState ? (
          <Alert
            showIcon
            type="warning"
            message="深链中的状态不存在"
            description={
              <Button
                size="small"
                onClick={() => onSelectFlowState(flow.key, '')}
              >
                返回第一个已登记状态
              </Button>
            }
          />
        ) : selectedState ? (
          <>
            <div className="erp-dev-flow-state-section-head">
              <div>
                <Text className="erp-dev-flow-state-eyebrow">状态详情</Text>
                <Title level={2}>{selectedState.label}</Title>
              </div>
              <Space wrap>
                {selectedState.initial ? <Tag color="green">初态</Tag> : null}
                {selectedState.terminal ? <Tag color="blue">终态</Tag> : null}
              </Space>
            </div>
            <dl className="erp-dev-flow-state-facts">
              <div>
                <dt>Key</dt>
                <dd>
                  <code>{selectedState.key}</code>
                </dd>
              </div>
              <div>
                <dt>初态</dt>
                <dd>{selectedState.initial ? '是' : '否'}</dd>
              </div>
              <div>
                <dt>终态</dt>
                <dd>{selectedState.terminal ? '是' : '否'}</dd>
              </div>
              <div>
                <dt>说明</dt>
                <dd>{selectedState.summary || '目录未声明'}</dd>
              </div>
            </dl>
            <div className="erp-dev-flow-state-state-paths">
              <section>
                <Text strong>进入此状态</Text>
                <TransitionCards transitions={incoming} />
              </section>
              <section>
                <Text strong>离开此状态</Text>
                <TransitionCards transitions={outgoing} />
              </section>
            </div>
            <EvidenceDisclosure
              context="state"
              label="查看当前状态的实现依据"
              items={uniqueEvidenceSources(
                flow.evidence,
                selectedState.evidence,
                ...incoming.map((transition) => transition.evidence),
                ...outgoing.map((transition) => transition.evidence)
              )}
            />
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请选择状态"
          />
        )}
      </section>
    </div>
  )
}

function buildProcessMermaid(definition) {
  if (!definition || definition.nodes.length === 0) return ''
  const nodeIdByKey = new Map()
  const lines = ['flowchart LR']
  definition.nodes.forEach((node, index) => {
    const nodeId = `process_node_${index}`
    nodeIdByKey.set(node.key, nodeId)
    const label = escapeMermaid(
      [node.label, node.type ? `(${node.type})` : ''].filter(Boolean).join(' ')
    )
    if (node.key === definition.initial) {
      lines.push(`  ${nodeId}(["${label}"])`)
    } else if (node.key === definition.terminal) {
      lines.push(`  ${nodeId}(("${label}"))`)
    } else {
      lines.push(`  ${nodeId}["${label}"]`)
    }
  })
  definition.edges.forEach((edge) => {
    const from = nodeIdByKey.get(edge.from)
    const to = nodeIdByKey.get(edge.to)
    if (from && to) lines.push(`  ${from} --> ${to}`)
  })
  return lines.join('\n')
}

function ProcessDefinitionPanel({ definition }) {
  const mermaid = useMemo(() => buildProcessMermaid(definition), [definition])
  if (!definition) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Product Core 尚未登记流程定义"
      />
    )
  }
  return (
    <div className="erp-dev-flow-state-process-layout">
      <section className="erp-dev-flow-state-process-diagram">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text className="erp-dev-flow-state-eyebrow">
              Product Core 编排
            </Text>
            <Title level={2}>{definition.label}</Title>
            <Text type="secondary">
              {definition.processKey} · {definition.variantKey}
            </Text>
          </div>
          <Space wrap>
            <Tag>{definition.processVersion || '版本未声明'}</Tag>
            <Tag color="green">只读定义</Tag>
          </Space>
        </div>
        <dl className="erp-dev-flow-state-facts">
          <div>
            <dt>Process key</dt>
            <dd>
              <code>{definition.processKey}</code>
            </dd>
          </div>
          <div>
            <dt>Variant</dt>
            <dd>
              <code>{definition.variantKey}</code>
            </dd>
          </div>
          <div>
            <dt>初始节点</dt>
            <dd>{definition.initial || '未声明'}</dd>
          </div>
          <div>
            <dt>结束节点</dt>
            <dd>{definition.terminal || '未声明'}</dd>
          </div>
          <div>
            <dt>业务引用</dt>
            <dd>{definition.businessRefType || '未声明'}</dd>
          </div>
          <div>
            <dt>运行权威</dt>
            <dd>{definition.runtimeAuthority || '未声明'}</dd>
          </div>
        </dl>
        {mermaid ? (
          <div className="erp-dev-flow-state-mermaid erp-dev-docs-markdown">
            <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前定义没有可画的显式节点与边"
          />
        )}
        <EvidenceDisclosure
          context="process"
          label="查看本流程的实现依据"
          items={uniqueEvidenceSources(
            definition.evidence,
            ...definition.nodes.map((node) => node.evidence)
          )}
        />
      </section>
      <section className="erp-dev-flow-state-process-nodes">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text strong>节点责任与领域边界</Text>
            <Text type="secondary">
              Owner、Action、Permission 与 Fact boundary 分列。
            </Text>
          </div>
          <Tag>{definition.nodes.length} 个节点</Tag>
        </div>
        <div className="erp-dev-flow-state-process-node-list">
          {definition.nodes.map((node) => (
            <article key={node.key}>
              <div>
                <strong>{node.label}</strong>
                <Tag>{node.type || '类型未声明'}</Tag>
              </div>
              <code>{node.key}</code>
              <dl>
                <div>
                  <dt>Owner</dt>
                  <dd>{node.ownerPool || '未声明'}</dd>
                </div>
                <div>
                  <dt>Action</dt>
                  <dd>{node.action || '无写动作'}</dd>
                </div>
                <div>
                  <dt>Permission</dt>
                  <dd>{node.permission || '未声明'}</dd>
                </div>
                <div>
                  <dt>Fact boundary</dt>
                  <dd>{node.factBoundary || '未声明'}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function CustomerPreviewItems({ title, items, onOpenCanonical = null }) {
  if (!items.length) return null
  return (
    <section className="erp-dev-flow-state-customer-preview-group">
      <div className="erp-dev-flow-state-section-head">
        <Text strong>{title}</Text>
        <Tag>{items.length}</Tag>
      </div>
      <div>
        {items.map((item, index) => {
          const key = firstText(item.key, `${title}-${index}`)
          const comparison = isRecord(item.comparison) ? item.comparison : null
          const status = firstText(item.status, 'preview_only')
          const statusLabel =
            {
              registered_preview_selection: '已登记选择',
              unknown_process: '未知流程',
              unknown_variant: '未知 variant',
              identity_mismatch: '身份不匹配',
              preview_only: '仅预览',
            }[status] || status
          const processLabel =
            item.processKey && item.variantKey
              ? `${item.processKey} · ${item.variantKey}`
              : ''
          const canonicalProcessKey = firstText(
            item.canonicalProcessDefinition?.key
          )
          return (
            <article key={key}>
              <div>
                <strong>
                  {firstText(item.label, item.name, processLabel, key)}
                </strong>
                <Tag color="cyan" title={status}>
                  {statusLabel}
                </Tag>
              </div>
              <code>{key}</code>
              {item.guardrail ? <p>{item.guardrail}</p> : null}
              {comparison ? (
                <small>
                  与 Product Core：
                  {firstText(comparison.status, '未比较')}
                  {comparison.canonicalMachineKey
                    ? ` · ${comparison.canonicalMachineKey}`
                    : ''}
                </small>
              ) : null}
              {onOpenCanonical ? (
                <Button
                  size="small"
                  disabled={!canonicalProcessKey}
                  onClick={() => onOpenCanonical(canonicalProcessKey)}
                >
                  {canonicalProcessKey
                    ? '打开 Product Core 图'
                    : '未匹配 Product Core 定义'}
                </Button>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function CustomerOrchestrationView({
  processDefinitions,
  requestedProcessKey,
  onSelectProcess,
  overlays,
  requestedCustomerKey,
  onSelectCustomer,
}) {
  const selectedProcess =
    processDefinitions.find(
      (definition) => definition.key === requestedProcessKey
    ) || (!requestedProcessKey ? processDefinitions.at(0) : null)
  const selectedOverlay =
    overlays.find((overlay) => overlay.key === requestedCustomerKey) ||
    (!requestedCustomerKey ? overlays.at(0) : null)
  return (
    <div className="erp-dev-flow-state-view-stack">
      <Alert
        showIcon
        type="warning"
        message="流程编排 / 客户差异只读"
        description="Product Core 定义来自后端合同；甲方包只能选择已登记 variant 并比较 preview 差异，不能在这里增加节点、改顺序、提升权限或绕过领域动作。"
      />

      <section className="erp-dev-flow-state-orchestration-section">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text strong>Product Core 流程定义</Text>
            <Text type="secondary">
              只展示目录明确登记的 process variant 与显式边。
            </Text>
          </div>
          <Select
            aria-label="选择 Product Core 流程"
            value={selectedProcess?.key}
            placeholder="选择 Product Core 流程"
            notFoundContent="没有流程定义"
            options={processDefinitions.map((definition) => ({
              value: definition.key,
              label: `${definition.label} · ${definition.variantKey}`,
            }))}
            onChange={onSelectProcess}
          />
        </div>
        {requestedProcessKey && !selectedProcess ? (
          <Alert showIcon type="warning" message="深链中的流程定义不存在" />
        ) : (
          <ProcessDefinitionPanel definition={selectedProcess} />
        )}
      </section>

      <section className="erp-dev-flow-state-orchestration-section">
        <div className="erp-dev-flow-state-section-head">
          <div>
            <Text strong>甲方包选择与差异</Text>
            <Text type="secondary">
              runtimeProcessSelections、业务流、状态机与流程策略均来自登记包。
            </Text>
          </div>
          <Select
            aria-label="选择甲方包"
            value={selectedOverlay?.key}
            placeholder="选择甲方包"
            notFoundContent="没有已登记甲方包"
            options={overlays.map((overlay) => ({
              value: overlay.key,
              label: overlay.label,
            }))}
            onChange={onSelectCustomer}
          />
        </div>
        {requestedCustomerKey && !selectedOverlay ? (
          <Alert showIcon type="warning" message="深链中的甲方包不存在" />
        ) : selectedOverlay ? (
          <div className="erp-dev-flow-state-customer-grid">
            <article key={selectedOverlay.key}>
              <div className="erp-dev-flow-state-customer-card__head">
                <div>
                  <TeamOutlined aria-hidden="true" />
                  <strong>{selectedOverlay.label}</strong>
                </div>
                <Tag color={selectedOverlay.previewOnly ? 'cyan' : 'green'}>
                  {selectedOverlay.previewOnly ? '仅预览' : '已登记'}
                </Tag>
              </div>
              <code>{selectedOverlay.key}</code>
              <p>
                {selectedOverlay.summary ||
                  '目录未补充差异说明；以下内容直接来自已登记客户包。'}
              </p>
              <div className="erp-dev-flow-state-customer-metrics">
                {[
                  {
                    label: '运行选择',
                    value: selectedOverlay.runtimeProcessSelections.length,
                  },
                  {
                    label: '业务流',
                    value: selectedOverlay.businessFlows.length,
                  },
                  {
                    label: '状态机',
                    value: selectedOverlay.stateMachines.length,
                  },
                  {
                    label: '流程策略',
                    value: selectedOverlay.processPolicies.length,
                  },
                ].map((item) => (
                  <span key={item.label}>
                    <strong>{item.value}</strong>
                    <small>{item.label}</small>
                  </span>
                ))}
              </div>
              <dl className="erp-dev-flow-state-customer-comparison">
                <div>
                  <dt>运行权威</dt>
                  <dd>{selectedOverlay.runtimeAuthority || '仅用于比较'}</dd>
                </div>
                <div>
                  <dt>实现依据</dt>
                  <dd>
                    {uniqueEvidenceSources(selectedOverlay.evidence).length}{' '}
                    个来源
                  </dd>
                </div>
              </dl>
              <EvidenceDisclosure
                context="customer"
                label="查看客户包实现依据"
                items={selectedOverlay.evidence}
              />
            </article>
            <div className="erp-dev-flow-state-customer-preview-stack">
              <CustomerPreviewItems
                title="运行流程选择"
                items={selectedOverlay.runtimeProcessSelections}
                onOpenCanonical={onSelectProcess}
              />
              <CustomerPreviewItems
                title="业务流预览"
                items={selectedOverlay.businessFlows}
              />
              <CustomerPreviewItems
                title="状态机比较"
                items={selectedOverlay.stateMachines}
              />
              <CustomerPreviewItems
                title="流程策略"
                items={selectedOverlay.processPolicies}
              />
            </div>
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="没有已登记的甲方差异"
          />
        )}
      </section>
    </div>
  )
}

function useRuntimeContext(taskIdValue) {
  const [state, setState] = useState({
    status: 'idle',
    context: null,
    error: '',
  })

  useEffect(() => {
    const text = cleanText(taskIdValue)
    if (!text) {
      setState({ status: 'idle', context: null, error: '' })
      return undefined
    }
    const taskId = Number(text)
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      setState({
        status: 'error',
        context: null,
        error: 'task_id 必须是大于 0 的整数',
      })
      return undefined
    }
    const controller = new AbortController()
    setState({ status: 'loading', context: null, error: '' })
    getWorkflowTaskProcessContext(taskId, { signal: controller.signal })
      .then((context) => {
        if (controller.signal.aborted) return
        setState({ status: 'ready', context, error: '' })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          context: null,
          error: getActionErrorMessage(error, '读取任务流程位置', {
            fallback: '读取任务流程位置失败，请确认已登录且具备任务查看权限',
          }),
        })
      })
    return () => controller.abort()
  }, [taskIdValue])

  return state
}

function RuntimeView({
  taskIdValue,
  taskIdDraft,
  onTaskIdDraftChange,
  onSubmitTaskId,
}) {
  const runtime = useRuntimeContext(taskIdValue)
  const { context } = runtime
  const processInstance = context?.process_instance
  const nodes = asArray(context?.nodes)
  return (
    <div className="erp-dev-flow-state-view-stack">
      <Alert
        showIcon
        type="info"
        message="只读取真实 ProcessRuntime 位置"
        description="查询经过 workflow.get_task_process_context、管理员登录态、任务可见性和持久化锚点校验；不从任务标题、文案或 payload 猜节点。"
      />
      <form
        className="erp-dev-flow-state-runtime-search"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmitTaskId()
        }}
      >
        <label htmlFor="dev-flow-state-task-id">任务 task_id</label>
        <Input
          id="dev-flow-state-task-id"
          inputMode="numeric"
          prefix={<SearchOutlined />}
          value={taskIdDraft}
          placeholder="输入已有任务 ID"
          onChange={(event) => onTaskIdDraftChange(event.target.value)}
        />
        <Button
          htmlType="submit"
          type="primary"
          loading={runtime.status === 'loading'}
        >
          读取真实位置
        </Button>
      </form>

      {runtime.status === 'idle' ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="输入 task_id 后读取运行轨迹与证据"
        />
      ) : null}
      {runtime.status === 'loading' ? (
        <div
          className="erp-dev-flow-state-loading"
          role="status"
          aria-live="polite"
        >
          <Spin />
          <span>正在读取真实流程位置…</span>
        </div>
      ) : null}
      {runtime.status === 'error' ? (
        <Alert
          showIcon
          type="error"
          message="运行轨迹读取失败"
          description={
            <>
              <p>{runtime.error}</p>
              <p>
                本页不会退回演示数据。请先登录管理员会话，并确认拥有该任务的查看权限。
              </p>
            </>
          }
        />
      ) : null}
      {runtime.status === 'ready' && context ? (
        <>
          <section className="erp-dev-flow-state-runtime-summary">
            <div className="erp-dev-flow-state-section-head">
              <div>
                <Text className="erp-dev-flow-state-eyebrow">真实运行位置</Text>
                <Title level={2}>{getProcessLabel(processInstance)}</Title>
              </div>
              <Tag color={STATUS_TAG_COLOR[processInstance.status]}>
                {getProcessStatusLabel(processInstance)}
              </Tag>
            </div>
            <dl className="erp-dev-flow-state-facts">
              <div>
                <dt>task_id</dt>
                <dd>
                  <code>{taskIdValue}</code>
                </dd>
              </div>
              <div>
                <dt>流程 key</dt>
                <dd>
                  <code>{processInstance.process_key}</code>
                </dd>
              </div>
              <div>
                <dt>流程版本</dt>
                <dd>{processInstance.process_version}</dd>
              </div>
              <div>
                <dt>发起时间</dt>
                <dd>{formatProcessStartedAt(processInstance.started_at)}</dd>
              </div>
              <div>
                <dt>来源类型</dt>
                <dd>{context.source?.type || '未声明'}</dd>
              </div>
              <div>
                <dt>来源单号</dt>
                <dd>{context.source?.no || '未声明'}</dd>
              </div>
            </dl>
          </section>
          <section className="erp-dev-flow-state-runtime-nodes">
            <div className="erp-dev-flow-state-section-head">
              <div>
                <Text strong>节点轨迹</Text>
                <Text type="secondary">
                  只按后端返回节点展示，不补造节点间连线。
                </Text>
              </div>
              <Tag>{nodes.length} 个节点</Tag>
            </div>
            <ol>
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
                  <span className="erp-dev-flow-state-runtime-node__icon">
                    {node.status === 'completed' ? (
                      <CheckCircleOutlined />
                    ) : node.status === 'blocked' ? (
                      <ExclamationCircleOutlined />
                    ) : (
                      <ClockCircleOutlined />
                    )}
                  </span>
                  <span>
                    <strong>{getProcessNodeLabel(node)}</strong>
                    <code>{node.node_key}</code>
                  </span>
                  <Tag color={STATUS_TAG_COLOR[node.status]}>
                    {getProcessNodeStatusLabel(node)}
                  </Tag>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </div>
  )
}

function CatalogState({ state, onRetry }) {
  if (state.status === 'loading') {
    return (
      <div
        className="erp-dev-flow-state-loading"
        role="status"
        aria-live="polite"
      >
        <Spin />
        <span>正在加载流程状态目录…</span>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <Alert
        showIcon
        type="error"
        message="流程状态目录不可用"
        description={
          <Space direction="vertical" size={10}>
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

export default function DevFlowStateObservatoryPage() {
  const catalogState = useFlowStateCatalog()
  const { catalog } = catalogState
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedScopeKey = cleanText(searchParams.get(QUERY_KEYS.scope))
  const requestedView = cleanText(searchParams.get(QUERY_KEYS.view))
  const requestedFlowKey = cleanText(searchParams.get(QUERY_KEYS.flow))
  const requestedStateKey = cleanText(searchParams.get(QUERY_KEYS.state))
  const requestedProcessKey = cleanText(searchParams.get(QUERY_KEYS.process))
  const requestedCustomerKey = cleanText(searchParams.get(QUERY_KEYS.customer))
  const keyword = cleanText(searchParams.get(QUERY_KEYS.search))
  const requestedPathMode = cleanText(searchParams.get(QUERY_KEYS.pathMode))
  const requestedPathKind = cleanText(searchParams.get(QUERY_KEYS.pathKind))
  const requestedPathObjects = cleanText(
    searchParams.get(QUERY_KEYS.pathObjects)
  )
  const taskIdValue = cleanText(searchParams.get(QUERY_KEYS.taskId))
  const [taskIdDraft, setTaskIdDraft] = useState(taskIdValue)

  useEffect(() => setTaskIdDraft(taskIdValue), [taskIdValue])

  const updateSearchParams = useCallback(
    (patch, options = {}) => {
      setSearchParams(patchParams(searchParams, patch), {
        replace: options.replace === true,
      })
    },
    [searchParams, setSearchParams]
  )

  const scopes = catalog?.scopes || []
  const scopeOptions = [
    { key: 'all', label: '全部状态域', description: '按目录状态域分组查看' },
    ...scopes,
  ]
  const scopeIsValid =
    !requestedScopeKey ||
    scopeOptions.some((scope) => scope.key === requestedScopeKey)
  const scopeKey = requestedScopeKey || 'all'
  const viewIsValid = !requestedView || VIEW_KEYS.has(requestedView)
  const view = requestedView || DEFAULT_VIEW
  const showsCatalogFilters = ['overview', 'machine', 'dictionary'].includes(
    view
  )
  const showsFlowSelector = ['machine', 'dictionary'].includes(view)
  const showsMachineControls = view === 'machine'
  const availableLayerKeys = new Set(
    (catalog?.flowLayers || []).map((layer) => layer.key)
  )
  const layerParamPresent = searchParams.has(QUERY_KEYS.layers)
  const rawRequestedLayerKeys = cleanText(searchParams.get(QUERY_KEYS.layers))
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
  const layersAreValid = rawRequestedLayerKeys.every((key) =>
    availableLayerKeys.has(key)
  )
  const requestedLayerKeys = rawRequestedLayerKeys.filter((key) =>
    availableLayerKeys.has(key)
  )
  const layerKeys = layerParamPresent
    ? requestedLayerKeys
    : DEFAULT_LAYER_KEYS.filter((key) => availableLayerKeys.has(key))
  const pathModeIsValid =
    !requestedPathMode || PATH_MODE_KEYS.has(requestedPathMode)
  const pathMode = requestedPathMode || 'off'
  const availablePathKinds = new Set(catalog?.pathKinds || [])
  const pathKindIsValid =
    !requestedPathKind || availablePathKinds.has(requestedPathKind)
  const pathObjectsAreValid =
    !requestedPathObjects || requestedPathObjects === 'with'
  const invalidFilterMessages = [
    showsCatalogFilters && !scopeIsValid
      ? `未知状态域：${requestedScopeKey}`
      : '',
    !viewIsValid ? `未知视图：${requestedView}` : '',
    showsMachineControls && !layersAreValid ? '叠加层参数包含未登记值' : '',
    showsMachineControls && !pathModeIsValid
      ? `未知路径呈现模式：${requestedPathMode}`
      : '',
    showsMachineControls && !pathKindIsValid
      ? `未知路径类型：${requestedPathKind}`
      : '',
    showsMachineControls && !pathObjectsAreValid
      ? `未知对象路径筛选：${requestedPathObjects}`
      : '',
  ].filter(Boolean)
  const filtersAreValid = invalidFilterMessages.length === 0
  const normalizedKeyword = keyword.toLocaleLowerCase('zh-CN')
  const filteredFlows = useMemo(
    () =>
      filtersAreValid
        ? (catalog?.flows || []).filter(
            (flow) =>
              (scopeKey === 'all' || flow.scopeKey === scopeKey) &&
              (!normalizedKeyword ||
                flow.searchText.includes(normalizedKeyword)) &&
              (!showsMachineControls ||
                requestedPathObjects !== 'with' ||
                flow.transitions.some((transition) =>
                  transitionMatchesPathKind(transition, requestedPathKind)
                ))
          )
        : [],
    [
      catalog?.flows,
      filtersAreValid,
      normalizedKeyword,
      requestedPathKind,
      requestedPathObjects,
      showsMachineControls,
      scopeKey,
    ]
  )
  const selectedFlow =
    filteredFlows.find((flow) => flow.key === requestedFlowKey) ||
    (!requestedFlowKey ? filteredFlows[0] : null)
  const unknownFlow =
    showsFlowSelector &&
    filtersAreValid &&
    Boolean(requestedFlowKey) &&
    !filteredFlows.some((flow) => flow.key === requestedFlowKey)

  const openFlow = useCallback(
    (flowKey, nextView = view) => {
      updateSearchParams({
        [QUERY_KEYS.flow]: flowKey,
        [QUERY_KEYS.state]: null,
        [QUERY_KEYS.view]: nextView,
      })
    },
    [updateSearchParams, view]
  )

  const handleLayerChange = (nextLayerKeys) => {
    updateSearchParams({
      [QUERY_KEYS.layers]: nextLayerKeys.join(','),
    })
  }

  const renderView = () => {
    if (!catalog) return null
    if (view === 'overview') {
      return (
        <OverviewView
          catalog={catalog}
          flows={filteredFlows}
          onOpenFlow={openFlow}
        />
      )
    }
    if (view === 'machine') {
      return (
        <MachineView
          flow={selectedFlow}
          layerKeys={layerKeys}
          pathMode={pathMode}
          pathKind={requestedPathKind}
        />
      )
    }
    if (view === 'dictionary') {
      return (
        <DictionaryView
          scopes={scopes}
          flows={filteredFlows}
          flow={selectedFlow}
          requestedStateKey={requestedStateKey}
          onSelectFlowState={(flowKey, stateKey) =>
            updateSearchParams({
              [QUERY_KEYS.flow]: flowKey,
              [QUERY_KEYS.state]: stateKey || null,
            })
          }
        />
      )
    }
    if (view === 'orchestration') {
      return (
        <CustomerOrchestrationView
          processDefinitions={catalog.processDefinitions}
          requestedProcessKey={requestedProcessKey}
          onSelectProcess={(processKey) =>
            updateSearchParams({
              [QUERY_KEYS.process]: processKey,
            })
          }
          overlays={catalog.customerOverlays}
          requestedCustomerKey={requestedCustomerKey}
          onSelectCustomer={(customerKey) =>
            updateSearchParams({
              [QUERY_KEYS.customer]: customerKey,
            })
          }
        />
      )
    }
    return (
      <RuntimeView
        taskIdValue={taskIdValue}
        taskIdDraft={taskIdDraft}
        onTaskIdDraftChange={setTaskIdDraft}
        onSubmitTaskId={() =>
          updateSearchParams({
            [QUERY_KEYS.taskId]: cleanText(taskIdDraft) || null,
            [QUERY_KEYS.view]: 'runtime',
          })
        }
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

      <header className="erp-dev-flow-state-header">
        <div className="erp-dev-flow-state-header__copy">
          <Space align="center" size={10} wrap>
            <PartitionOutlined className="erp-dev-flow-state-header__icon" />
            <Title level={1} className="erp-dev-flow-state-title">
              流程与状态观察台 / Flow &amp; State Observatory
            </Title>
            <Tag color="green">仅开发环境 / DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-flow-state-summary">
            只读观察，不改写任何业务状态。按 Product Core
            与甲方差异定位状态合同、流程位置和来源证据。
          </Paragraph>
        </div>
        <div className="erp-dev-flow-state-readonly">
          <SafetyCertificateOutlined aria-hidden="true" />
          <span>
            <strong>Read only</strong>
            <small>
              无状态写入 · 无任意跳转 · Workflow done 不等于 Fact posted
            </small>
          </span>
        </div>
      </header>

      <section className="erp-dev-flow-state-view-nav">
        <DevTaskNav
          compact
          level="primary"
          ariaLabel="流程状态观察视图"
          items={VIEW_ITEMS}
          value={view}
          disabled={catalogState.status === 'loading'}
          onChange={(nextView) =>
            updateSearchParams({ [QUERY_KEYS.view]: nextView })
          }
        />
      </section>

      {showsCatalogFilters ? (
        <section
          className="erp-dev-flow-state-controls"
          aria-label="当前视图筛选"
        >
          <div className="erp-dev-flow-state-control">
            <label htmlFor="dev-flow-state-scope">状态域</label>
            <Select
              id="dev-flow-state-scope"
              value={scopeKey}
              options={scopeOptions.map((scope) => ({
                value: scope.key,
                label: scope.label,
                title: scope.description,
              }))}
              onChange={(nextScope) =>
                updateSearchParams({
                  [QUERY_KEYS.scope]: nextScope,
                  [QUERY_KEYS.flow]: null,
                  [QUERY_KEYS.state]: null,
                })
              }
            />
          </div>
          <div className="erp-dev-flow-state-control">
            <label htmlFor="dev-flow-state-search">搜索</label>
            <Input
              id="dev-flow-state-search"
              allowClear
              prefix={<SearchOutlined />}
              value={keyword}
              placeholder="搜索业务流、状态、迁移或证据"
              onChange={(event) =>
                updateSearchParams(
                  { [QUERY_KEYS.search]: event.target.value || null },
                  { replace: true }
                )
              }
            />
          </div>
          {showsFlowSelector ? (
            <div className="erp-dev-flow-state-control">
              <label htmlFor="dev-flow-state-flow">业务流 / 状态对象</label>
              <Select
                id="dev-flow-state-flow"
                showSearch
                optionFilterProp="label"
                value={selectedFlow?.key}
                placeholder="选择状态对象"
                notFoundContent="没有匹配的状态对象"
                options={filteredFlows.map((flow) => ({
                  value: flow.key,
                  label: `${flow.label} · ${flow.key}`,
                }))}
                onChange={(flowKey) => openFlow(flowKey)}
              />
            </div>
          ) : null}
          {showsMachineControls ? (
            <>
              <div className="erp-dev-flow-state-control">
                <label htmlFor="dev-flow-state-path-mode">路径呈现</label>
                <Select
                  id="dev-flow-state-path-mode"
                  value={pathModeIsValid ? pathMode : undefined}
                  status={pathModeIsValid ? undefined : 'error'}
                  options={PATH_MODE_ITEMS}
                  onChange={(nextMode) =>
                    updateSearchParams({
                      [QUERY_KEYS.pathMode]:
                        nextMode === 'off' ? null : nextMode,
                    })
                  }
                />
              </div>
              {pathMode !== 'off' || requestedPathObjects === 'with' ? (
                <div className="erp-dev-flow-state-control">
                  <label htmlFor="dev-flow-state-path-kind">路径类型</label>
                  <Select
                    id="dev-flow-state-path-kind"
                    value={
                      pathKindIsValid ? requestedPathKind || 'all' : undefined
                    }
                    status={pathKindIsValid ? undefined : 'error'}
                    options={[
                      { value: 'all', label: '全部已登记类型' },
                      ...(catalog?.pathKinds || []).map((pathKind) => ({
                        value: pathKind,
                        label: PATH_KIND_PRESENTATION[pathKind] || pathKind,
                      })),
                    ]}
                    onChange={(nextPathKind) =>
                      updateSearchParams({
                        [QUERY_KEYS.pathKind]:
                          nextPathKind === 'all' ? null : nextPathKind,
                        [QUERY_KEYS.flow]:
                          requestedPathObjects === 'with'
                            ? null
                            : requestedFlowKey || null,
                        [QUERY_KEYS.state]: null,
                      })
                    }
                  />
                </div>
              ) : null}
              <div className="erp-dev-flow-state-control">
                <span>对象派生筛选</span>
                <Checkbox
                  checked={requestedPathObjects === 'with'}
                  onChange={(event) =>
                    updateSearchParams({
                      [QUERY_KEYS.pathObjects]: event.target.checked
                        ? 'with'
                        : null,
                      [QUERY_KEYS.flow]: null,
                      [QUERY_KEYS.state]: null,
                    })
                  }
                >
                  仅显示包含命中路径的对象
                </Checkbox>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {showsMachineControls ? (
        <section
          className="erp-dev-flow-state-layers"
          aria-labelledby="dev-flow-state-layer-title"
          data-flow-layer-controls
        >
          <div>
            <Text strong id="dev-flow-state-layer-title">
              叠加层
            </Text>
            <Text type="secondary">
              默认只开业务与状态；叠加层只增加短提示，不把完整技术详情塞进图中。
            </Text>
          </div>
          <Checkbox.Group value={layerKeys} onChange={handleLayerChange}>
            {(catalog?.flowLayers || []).map((layer) => (
              <Checkbox
                value={layer.key}
                key={layer.key}
                title={layer.description}
              >
                {layer.label}
              </Checkbox>
            ))}
          </Checkbox.Group>
        </section>
      ) : null}

      <main className="erp-dev-flow-state-main" data-flow-state-view={view}>
        <CatalogState
          state={catalogState}
          onRetry={() => catalogState.reload()}
        />
        {catalogState.status === 'ready' && catalog?.flows.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="流程状态目录为空"
          />
        ) : null}
        {catalogState.status === 'ready' && !filtersAreValid ? (
          <Alert
            showIcon
            type="warning"
            message="深链筛选参数未登记，已按 fail closed 拒绝放宽"
            description={invalidFilterMessages.join('；')}
          />
        ) : null}
        {catalogState.status === 'ready' && unknownFlow ? (
          <Alert
            showIcon
            type="warning"
            message="深链中的状态对象不存在或不在当前范围"
            description={
              filteredFlows[0] ? (
                <Button
                  size="small"
                  onClick={() => openFlow(filteredFlows[0].key)}
                >
                  打开第一个匹配对象
                </Button>
              ) : (
                '请切换范围或清除搜索条件。'
              )
            }
          />
        ) : null}
        {catalogState.status === 'ready' && filtersAreValid && !unknownFlow
          ? renderView()
          : null}
      </main>
    </div>
  )
}
