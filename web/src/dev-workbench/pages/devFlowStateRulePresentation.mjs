const PATH_GROUP_ORDER = Object.freeze([
  'normal',
  'outcome',
  'pause_restore',
  'stop',
  'correction',
  'rework',
])

export const DEV_FLOW_STATE_PATH_GROUP_PRESENTATION = Object.freeze({
  outcome: Object.freeze({
    key: 'outcome',
    label: '结束结果另记',
    tone: 'outcome',
    diagramStroke: '#64748b',
    diagramStrokeWidth: 2.25,
    diagramStrokeDasharray: '',
    description: '结束状态与成功、驳回、取消或补偿结果分别读取。',
  }),
  normal: Object.freeze({
    key: 'normal',
    label: '正常推进',
    tone: 'normal',
    diagramStroke: '#2b8a3e',
    diagramStrokeWidth: 2.25,
    diagramStrokeDasharray: '',
    description: '按对象主生命周期进入下一状态。',
  }),
  pause_restore: Object.freeze({
    key: 'pause_restore',
    label: '暂停与恢复',
    tone: 'pause',
    diagramStroke: '#d46b08',
    diagramStrokeWidth: 2.5,
    diagramStrokeDasharray: '8 4',
    description: '暂停或继续同一协同与运行证据，不重写历史。',
  }),
  stop: Object.freeze({
    key: 'stop',
    label: '不通过与终止',
    tone: 'stop',
    diagramStroke: '#cf1322',
    diagramStrokeWidth: 2.75,
    diagramStrokeDasharray: '',
    description: '本层不再继续，但不会自动改写其他对象。',
  }),
  correction: Object.freeze({
    key: 'correction',
    label: '纠正与退回',
    tone: 'correction',
    diagramStroke: '#1677ff',
    diagramStrokeWidth: 2.5,
    diagramStrokeDasharray: '10 4',
    description: '保留既有历史，通过冲正、调整、退回或重开纠正。',
  }),
  rework: Object.freeze({
    key: 'rework',
    label: '返工与再处理',
    tone: 'rework',
    diagramStroke: '#722ed1',
    diagramStrokeWidth: 2.5,
    diagramStrokeDasharray: '3 4',
    description: '形成新的受控处理轮次，不把原完成节点改回未完成。',
  }),
})

export const DEV_FLOW_STATE_PATH_KIND_PRESENTATION = Object.freeze({
  blocked: Object.freeze({
    key: 'blocked',
    label: '阻塞',
    diagramLabel: '阻塞 · 暂停',
    color: 'orange',
    groupKey: 'pause_restore',
  }),
  resumed: Object.freeze({
    key: 'resumed',
    label: '恢复',
    diagramLabel: '恢复',
    color: 'green',
    groupKey: 'pause_restore',
  }),
  rejected: Object.freeze({
    key: 'rejected',
    label: '退回或拒绝',
    diagramLabel: '退回 · 不通过',
    color: 'red',
    groupKey: 'stop',
  }),
  cancelled: Object.freeze({
    key: 'cancelled',
    label: '取消',
    diagramLabel: '取消 · 终止',
    color: 'red',
    groupKey: 'stop',
  }),
  reversed: Object.freeze({
    key: 'reversed',
    label: '冲正',
    diagramLabel: '冲正',
    color: 'purple',
    groupKey: 'correction',
  }),
  adjusted: Object.freeze({
    key: 'adjusted',
    label: '调整',
    diagramLabel: '调整',
    color: 'gold',
    groupKey: 'correction',
  }),
  returned: Object.freeze({
    key: 'returned',
    label: '退回、退货或回货',
    diagramLabel: '退回或回货',
    color: 'blue',
    groupKey: 'correction',
  }),
  reopened: Object.freeze({
    key: 'reopened',
    label: '重开',
    diagramLabel: '重开',
    color: 'cyan',
    groupKey: 'correction',
  }),
  rework: Object.freeze({
    key: 'rework',
    label: '返工',
    diagramLabel: '返工 · 新轮次',
    color: 'magenta',
    groupKey: 'rework',
  }),
})

const GROUP_PRIORITY = Object.freeze({
  normal: 0,
  outcome: 0,
  pause_restore: 1,
  stop: 2,
  correction: 3,
  rework: 4,
})

const TERMINAL_POLICY_LABELS = Object.freeze({
  explicit: '有明确终态',
  none_reactivatable: '无固定终态，可按规则重新启用',
  none_object_specific: '终止方式由对象专属规则决定',
  none_derived_projection: '只读阶段投影，不构成统一状态机',
  none_multi_revision_switch: '多版本受控切换，无单一终态',
})

export const DEV_FLOW_STATE_TRANSITION_FILTERS = Object.freeze({
  all: 'all',
  standard: 'standard',
  exceptional: 'exceptional',
  related: 'related',
})

export function buildDevFlowRecordRelationship(flow) {
  if (flow?.factBoundary !== 'immutable_red_entry_fact') return null
  const original = flow.states.find((item) => item.key === 'POSTED')
  const reversal = flow.states.find((item) => item.key === 'REVERSED')
  if (!original || !reversal || flow.transitions.length > 0) return null
  return {
    nodes: [
      { ...original, label: '原记录', role: original.label, kind: 'fact_ledger', summary: '已过账的原记录继续留存，不能更新或删除。' },
      { ...reversal, label: reversal.label, kind: 'fact_ledger', summary: '另建反向记录，引用原记录并保留纠正依据。' },
    ],
    edges: [{
      key: 'reversal-reference',
      from: reversal.key,
      to: original.key,
      label: '引用原记录',
      condition: '箭头表示两条记录的引用关系；原记录不会转换为反向记录。',
    }],
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function unique(values) {
  return [...new Set(values)]
}

function escapeMermaidText(value) {
  return String(value ?? '')
    .trim()
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', ' ')
}

function getRequiredStateID(stateIDs, stateKey, location) {
  const stateID = stateIDs.get(cleanText(stateKey))
  if (!stateID) {
    throw new Error(
      `invalid dev flow state reference at ${location}: ${stateKey || '(empty)'}`
    )
  }
  return stateID
}

function getDevFlowStateHumanCondition(value) {
  const condition = cleanText(value)
  const mappings = new Map([
    [
      '仅当 production_fact.fact_type=REWORK；其它事实类型不是返工路径。',
      '仅当本次生产事实登记为“返工”时；其他类型仍按正常过账路径理解。',
    ],
    [
      '仅人工调整 operation_type=MANUAL_ADJUSTMENT 进入审批链。',
      '仅当本次库存操作属于“人工调整”时，才进入审批链。',
    ],
    [
      '仅人工调整 operation_type=MANUAL_ADJUSTMENT 的批准后过账。',
      '仅当已批准的库存操作属于“人工调整”时，过账才归入调整路径。',
    ],
  ])
  return mappings.get(condition) || condition
}

export function getDevFlowStateHumanActionLabel(value) {
  const action = cleanText(value)
  const mappings = [
    [/save_sales_order_engineering/iu, '保存工程资料进度'],
    [/boss_review_engineering_material_request/iu, '老板审核用料'],
    [/finance_review_engineering_material_request/iu, '财务审核与审批'],
    [/post_purchase_rejection_disposition/iu, '过账拒收处置'],
    [/archive.*bom/iu, '归档版本'],
    [/ChangeInventoryLotStatus/iu, '调整批次状态'],
    [/execute_production_wip_action:SPLIT_BATCH/iu, '拆分在制批次'],
    [/execute_production_wip_action:START_OPERATION/iu, '开始生产或委外工序'],
    [/updateProductionWIPBatchQualityStatus/iu, '记录在制品质检结果'],
    [
      /(?:execute_production_exception|ExecuteProductionException)/iu,
      '执行异常处置',
    ],
    [/reverse|reversal|red[_-]?entry/iu, '冲正'],
    [/cancel/iu, '取消'],
    [/reject/iu, '退回或拒绝'],
    [/resume|unblock/iu, '恢复'],
    [/block/iu, '阻塞'],
    [/submit/iu, '提交'],
    [/activate/iu, '生效'],
    [/approve|pass/iu, '批准或通过'],
    [/release/iu, '放行'],
    [/withdraw/iu, '撤回'],
    [/confirm/iu, '确认'],
    [/post/iu, '过账'],
    [/complete|finish/iu, '完成'],
    [/ship/iu, '出货'],
    [/return/iu, '退回'],
    [/rework/iu, '返工'],
    [/adjust/iu, '调整'],
    [/close|settle/iu, '关闭或结清'],
    [/start.*process/iu, '启动流程'],
  ]
  return (
    mappings.find(([pattern]) => pattern.test(action))?.[1] || '按登记规则转换'
  )
}

export function getDevFlowStatePathKindPresentation(pathKind) {
  const presentation = DEV_FLOW_STATE_PATH_KIND_PRESENTATION[pathKind]
  if (!presentation) {
    throw new Error(`unsupported dev flow state path kind: ${pathKind}`)
  }
  return presentation
}

function hasStandardPath(transition) {
  if (transition.outcomeDimensionKey) return asArray(transition.outcomeKeys).includes('succeeded')
  return asArray(transition.pathKinds).length === 0 || transition.includesStandardPath === true
}

function hasExceptionalPath(transition) {
  return asArray(transition.pathKinds).length > 0 || asArray(transition.outcomeKeys).some((key) => key !== 'succeeded')
}

export function getDevFlowStateTransitionPresentation(flow, transition) {
  const pathKinds = asArray(transition?.pathKinds).map(
    getDevFlowStatePathKindPresentation
  )
  const rawCondition = cleanText(transition.pathKindWhen)
  const outcomeDimension = asArray(flow.dimensions).find((item) => item.key === transition.outcomeDimensionKey)
  const groupKey = outcomeDimension ? 'outcome' : transition.includesStandardPath ? 'normal' : pathKinds.reduce(
    (current, item) =>
      GROUP_PRIORITY[item.groupKey] > GROUP_PRIORITY[current]
        ? item.groupKey
        : current,
    'normal'
  )
  const group = DEV_FLOW_STATE_PATH_GROUP_PRESENTATION[groupKey]
  const targetOutgoing = asArray(flow?.transitions).filter(
    (item) => item.from === transition.to
  )
  const targetState = asArray(flow?.states).find(
    (item) => item.key === transition.to
  )
  const targetLabel = targetState?.label || transition.to
  const targetIsTerminal = asArray(flow?.terminalStates).includes(transition.to)
  let destinationSummary = `进入“${targetLabel}”状态。`
  if (targetIsTerminal && targetOutgoing.length === 0) {
    destinationSummary = `进入“${targetLabel}”终态，当前目录未登记离开路径。`
  } else if (targetIsTerminal) {
    destinationSummary = `进入“${targetLabel}”终态；另有 ${targetOutgoing.length} 条专用离开路径。`
  } else if (targetOutgoing.length > 0) {
    destinationSummary = `进入“${targetLabel}”，仍有 ${targetOutgoing.length} 条允许的后续转换。`
  } else {
    destinationSummary = `进入“${targetLabel}”；当前目录未登记后续转换。`
  }

  return Object.freeze({
    key: transition.key,
    actionLabel: cleanText(transition.label) || getDevFlowStateHumanActionLabel(transition.action),
    conditional: Boolean(rawCondition || outcomeDimension),
    condition: outcomeDimension ? `${transition.outcomeKeys.map((key) => outcomeDimension.states.find((item) => item.key === key).label).join('、')}分别留证；结束不代表成功，按实际结果判断。` : getDevFlowStateHumanCondition(rawCondition),
    destinationSummary,
    group,
    groupKey,
    isExceptional: hasExceptionalPath(transition),
    pathKinds: Object.freeze(pathKinds),
    targetIsTerminal,
    targetOutgoingCount: targetOutgoing.length,
  })
}

export function getDevFlowStateTransitionDiagramLabel(transition) {
  const actionLabel = cleanText(transition?.label) || getDevFlowStateHumanActionLabel(transition?.action)
  const pathKinds = asArray(transition?.pathKinds).map(
    getDevFlowStatePathKindPresentation
  )
  if (pathKinds.length === 0) return actionLabel
  if (cleanText(transition.pathKindWhen)) return `${actionLabel}（${pathKinds.map((item) => item.label).join('、')}按条件）`

  const labels = pathKinds.map((item) => item.diagramLabel)
  if (!labels.some((label) => label.includes(actionLabel))) {
    labels.unshift(actionLabel)
  }
  return unique(labels).join(' · ')
}

export function buildDevFlowStateRuleMermaid(
  flow,
  { filter = DEV_FLOW_STATE_TRANSITION_FILTERS.all, stateKey = '' } = {}
) {
  if (!flow) return ''

  const transitions = filterDevFlowStateTransitions(flow, stateKey, filter)
  const scoped = filter !== DEV_FLOW_STATE_TRANSITION_FILTERS.all
  const included = new Set(transitions.flatMap((item) => [item.from, item.to]))
  if (stateKey) included.add(stateKey)
  const states = asArray(flow.states).filter((item) => !scoped || included.has(item.key))
  const stateIDs = new Map()
  states.forEach((state, index) => {
    const stateKey = cleanText(state?.key)
    if (!stateKey || stateIDs.has(stateKey)) {
      throw new Error(
        `invalid dev flow state key: ${stateKey || '(empty or duplicate)'}`
      )
    }
    stateIDs.set(stateKey, `S${index}`)
  })

  const initialStates = asArray(flow.initialStates).filter((key) => !scoped || included.has(key))
  const terminalStates = asArray(flow.terminalStates).filter((key) => !scoped || included.has(key))
  const lines = ['flowchart LR']
  if (initialStates.length > 0) lines.push('  STATE_START(["开始"])')
  states.forEach((state) => {
    lines.push(
      `  ${stateIDs.get(cleanText(state.key))}["${escapeMermaidText(state.label || state.key)}"]`
    )
  })
  if (terminalStates.length > 0) lines.push('  STATE_END(["结束"])')

  let edgeIndex = 0
  const transitionEdgesByGroup = new Map(
    PATH_GROUP_ORDER.map((groupKey) => [groupKey, []])
  )
  const appendEdge = (source) => {
    lines.push(source)
    edgeIndex += 1
  }

  initialStates.forEach((stateKey, index) => {
    const targetID = getRequiredStateID(
      stateIDs,
      stateKey,
      `initialStates[${index}]`
    )
    appendEdge(`  STATE_START --> ${targetID}`)
  })

  transitions.forEach((transition, index) => {
    const sourceID = getRequiredStateID(
      stateIDs,
      transition?.from,
      `transitions[${index}].from`
    )
    const targetID = getRequiredStateID(
      stateIDs,
      transition?.to,
      `transitions[${index}].to`
    )
    const presentation = getDevFlowStateTransitionPresentation(flow, transition)
    transitionEdgesByGroup.get(presentation.groupKey).push(edgeIndex)
    appendEdge(
      `  ${sourceID} -->|"${escapeMermaidText(getDevFlowStateTransitionDiagramLabel(transition))}"| ${targetID}`
    )
  })

  terminalStates.forEach((stateKey, index) => {
    const sourceID = getRequiredStateID(
      stateIDs,
      stateKey,
      `terminalStates[${index}]`
    )
    appendEdge(`  ${sourceID} --> STATE_END`)
  })

  PATH_GROUP_ORDER.forEach((groupKey) => {
    const edgeIndexes = transitionEdgesByGroup.get(groupKey)
    if (edgeIndexes.length === 0) return
    const group = DEV_FLOW_STATE_PATH_GROUP_PRESENTATION[groupKey]
    const dashStyle = group.diagramStrokeDasharray
      ? `,stroke-dasharray:${group.diagramStrokeDasharray}`
      : ''
    lines.push(
      `  linkStyle ${edgeIndexes.join(',')} stroke:${group.diagramStroke},stroke-width:${group.diagramStrokeWidth}px${dashStyle}`
    )
  })

  return lines.join('\n')
}

export function buildDevFlowStateRuleSummary(flow) {
  const transitions = asArray(flow?.transitions)
  const exceptionalTransitionCount = transitions.filter(hasExceptionalPath).length
  return Object.freeze({
    stateCount: asArray(flow?.states).length,
    transitionCount: transitions.length,
    exceptionalTransitionCount,
    terminalCount: asArray(flow?.terminalStates).length,
    terminalPolicyLabel:
      TERMINAL_POLICY_LABELS[flow?.terminalPolicy] || '按对象专属规则判断',
  })
}

export function buildDevFlowStateNodeSummary(flow, state) {
  const transitions = asArray(flow?.transitions)
  const incoming = transitions.filter((item) => item.to === state?.key)
  const outgoing = transitions.filter((item) => item.from === state?.key)
  const initial = asArray(flow?.initialStates).includes(state?.key)
  const terminal = asArray(flow?.terminalStates).includes(state?.key)
  const positionLabel =
    initial && terminal
      ? '独立状态'
      : initial
        ? '初始状态'
        : terminal
          ? '终态'
          : '中间状态'
  return Object.freeze({
    incoming: Object.freeze(incoming),
    incomingExceptionalCount: incoming.filter(hasExceptionalPath).length,
    initial,
    outgoing: Object.freeze(outgoing),
    outgoingExceptionalCount: outgoing.filter(hasExceptionalPath).length,
    positionLabel,
    terminal,
  })
}

export function listDevFlowStatePathGroups(flow) {
  const groupKeys = new Set()
  for (const transition of asArray(flow?.transitions)) {
    if (transition.outcomeDimensionKey) {
      groupKeys.add('outcome')
      continue
    }
    const pathKinds = asArray(transition.pathKinds)
    if (hasStandardPath(transition)) groupKeys.add('normal')
    for (const pathKind of pathKinds) {
      groupKeys.add(getDevFlowStatePathKindPresentation(pathKind).groupKey)
    }
  }
  return Object.freeze(
    PATH_GROUP_ORDER.filter((key) => groupKeys.has(key)).map(
      (key) => DEV_FLOW_STATE_PATH_GROUP_PRESENTATION[key]
    )
  )
}

export function filterDevFlowStateTransitions(
  flow,
  stateKey,
  filterKey = DEV_FLOW_STATE_TRANSITION_FILTERS.all
) {
  const transitions = asArray(flow?.transitions)
  if (filterKey === DEV_FLOW_STATE_TRANSITION_FILTERS.standard) {
    return transitions.filter(hasStandardPath)
  }
  if (filterKey === DEV_FLOW_STATE_TRANSITION_FILTERS.exceptional) {
    return transitions.filter(hasExceptionalPath)
  }
  if (filterKey === DEV_FLOW_STATE_TRANSITION_FILTERS.related && stateKey) {
    return transitions.filter(
      (item) => item.from === stateKey || item.to === stateKey
    )
  }
  return transitions
}

export function buildDevFlowStateRelatedViews(catalog, flow) {
  const chains = []
  for (const chain of asArray(catalog?.businessChains)) {
    for (const node of asArray(chain.nodes)) {
      if (!asArray(node.machineKeys).includes(flow?.key)) continue
      chains.push(
        Object.freeze({
          key: `${chain.key}:${node.key}`,
          type: 'chain',
          chainKey: chain.key,
          chainLabel: chain.label,
          nodeKey: node.key,
          nodeLabel: node.label,
        })
      )
    }
  }

  const facts = asArray(catalog?.factDefinitions)
    .filter((item) => item.machineKey === flow?.key)
    .map((item) =>
      Object.freeze({
        key: item.factKey,
        type: 'facts',
        label: item.label,
        factKey: item.factKey,
      })
    )

  const direct = []
  if (['workflow_task', 'business_projection'].includes(flow?.scopeKey)) {
    direct.push(
      Object.freeze({
        key: 'workflow',
        type: 'workflow',
        label: '查看责任与任务',
      })
    )
  }
  if (flow?.scopeKey === 'process_runtime') {
    direct.push(
      Object.freeze({
        key: 'runtime',
        type: 'runtime',
        label: '查看具体运行路径',
      })
    )
  }

  return Object.freeze({
    chains: Object.freeze(chains),
    direct: Object.freeze(direct),
    facts: Object.freeze(facts),
  })
}
