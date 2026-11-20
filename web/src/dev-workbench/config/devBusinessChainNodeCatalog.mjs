import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { getPermissionCenterRoleName } from '../../erp/utils/permissionCenterAccess.mjs'
import { describeDevBusinessChainStep } from './devBusinessChainProjection.mjs'

export const CHAIN_NODE_VIEWS = Object.freeze([
  { value: 'steps', label: '业务步骤' },
  { value: 'tasks', label: '岗位任务' },
  { value: 'documents', label: '单据资料' },
  { value: 'exceptions', label: '异常处理' },
  { value: 'all', label: '全部' },
])
const unique = (items) => [...new Set(items)]
const roleDomain = {
  warehouse: 'inventory',
  engineering_data: 'engineering',
  pmc: 'production',
  shipment_finance_release: 'finance',
}
const exceptionChains = new Set([
  'production_exception',
  'purchase_quality_disposition',
  'outsourcing_quality_disposition',
  'purchase_posting_corrections',
])

// Names distinguish an action from its input, result and source-specific variants.
const labels = {
  'node:sales_order': '销售订单',
  'node:purchase_order': '采购订单',
  'node:material_request': '工程用料申请单',
  'node:purchase_receipt': '采购到货实点记录',
  'node:purchase_quality': '来料检验记录',
  'node:production_completion': '成品入库记录',
  'node:finished_quality': '成品检验结果',
  'node:packaging_confirmation': '包装用料确认记录',
  'node:packaging_execution': '查货包装结果',
  'node:outsourcing_quality': '委外回货检验记录',
  'node:finance_payment': '收付款单',
  'node:inventory_operation': '库存操作单',
  'node:production_exception_execution': '异常处置执行结果',
  'node:vendor_return_result': '退供应商处置记录',
  'step:sales_acceptance:requires:effective_bom': '完成订单工程资料',
  'step:sales_order:posts_fact:stock_reservation': '预留现有成品',
  'step:material_request:creates_source:generated_purchase_order':
    '生成厂商采购单',
  'step:material_request:requires:production_order': '核对生产发布条件',
  'step:purchase_approval:creates_fact_draft:purchase_receipt':
    '登记采购到货实点',
  'step:purchase_order:creates_fact_draft:purchase_receipt':
    '登记用料采购到货实点',
  'step:purchase_quality:creates_fact_draft:purchase_quality_correction':
    '创建来料纠正检验',
  'step:purchase_quality_correction:posts_fact:purchase_accepted':
    '判定纠正检验合格',
  'step:purchase_lot:creates_fact_draft:purchase_payable_draft':
    '生成采购应付草稿',
  'step:purchase_payable_draft:posts_fact:purchase_payable': '过账采购应付',
  'step:released_production_order:posts_fact:wip_batch': '建立生产在制批次',
  'step:production_completion:posts_fact:finished_goods_lot':
    '成品库存入账结果',
  'step:finished_goods_lot:requires:finished_quality': '判定成品检验合格',
  'step:finished_quality:requires:packaging_confirmation': '确认包装用料',
  'step:outsourcing_return:creates_fact_draft:outsourcing_quality':
    '创建委外回货检验草稿',
  'step:outsourcing_lot:creates_fact_draft:outsourcing_payable_draft':
    '生成委外回货应付草稿',
  'step:outsourcing_stage:creates_fact_draft:outsourcing_payable_draft':
    '生成委外工序应付草稿',
  'step:outsourcing_payable_draft:posts_fact:outsourcing_payable':
    '过账委外应付',
  'step:shipment_draft:starts_process:shipment_release_process':
    '提交出货财务放行',
  'step:shipment_release:posts_fact:shipped': '确认实际出货',
  'step:shipped:reverses:shipment_cancelled': '取消已出货单',
  'step:finance_payment:reverses:open_finance_fact': '冲正收付款',
  'step:finance_allocation:reverses:finance_payment': '撤销首款抵扣',
  'step:open_finance_fact:posts_fact:finance_credit_note': '创建账款红冲',
  'step:finance_credit_note:reverses:open_finance_fact': '撤销账款红冲',
  'step:finance_credit_note:posts_fact:settled_finance_fact': '红冲结清结果',
  'step:adjusted_inventory_lot:reverses:inventory_operation':
    '取消已过账库存操作',
  'step:production_exception_decision:starts_process:production_exception_process':
    '提交生产异常审批',
  'step:production_exception_execution:reworks:affected_wip': '可继续生产批次',
  'step:production_exception_execution:reworks:scrapped_wip': '原批报废结果',
  'step:affected_wip:derives:affected_production_fact': '后续正常生产事实',
  'step:production_exception_over_issue:derives:affected_production_fact':
    '超领额度使用结果',
  'step:rejected_purchase_quality:creates_fact_draft:purchase_disposition':
    '创建采购拒收处置',
  'step:purchase_disposition:returns:vendor_return_result': '确认退供应商处置',
  'step:purchase_disposition:creates_fact_draft:replacement_receipt':
    '确认补换来料实点',
  'step:rejected_outsourcing_quality:creates_fact_draft:outsourcing_disposition':
    '创建委外拒收处置',
  'step:outsourcing_disposition:returns:outsourcing_correction':
    '过账委外拒收处置',
  'step:outsourcing_correction:posts_fact:outsourcing_quarantine_lot':
    '委外库存处置结果',
  'step:posted_purchase_receipt:returns:purchase_return_correction':
    '创建采购退货草稿',
  'step:posted_purchase_receipt:creates_fact_draft:purchase_adjustment_correction':
    '创建采购入库调整草稿',
  'step:corrected_purchase_inventory:creates_fact_draft:corrected_purchase_finance':
    '按净入库生成应付草稿',
  'step:purchase_return_correction:reverses:posted_purchase_receipt':
    '冲正采购退货',
  'step:purchase_adjustment_correction:reverses:posted_purchase_receipt':
    '冲正采购入库调整',
}
const resultSteps = new Set([
  'production_completion:posts_fact:finished_goods_lot',
  'finance_credit_note:posts_fact:settled_finance_fact',
  'production_exception_execution:reworks:affected_wip',
  'production_exception_execution:reworks:scrapped_wip',
  'affected_wip:derives:affected_production_fact',
  'production_exception_over_issue:derives:affected_production_fact',
  'outsourcing_correction:posts_fact:outsourcing_quarantine_lot',
])

const payableConcepts = {
  'step:purchase_lot:creates_fact_draft:purchase_payable_draft': [
    'create_payable',
    '生成应付草稿',
  ],
  'step:outsourcing_lot:creates_fact_draft:outsourcing_payable_draft': [
    'create_payable',
    '生成应付草稿',
  ],
  'step:outsourcing_stage:creates_fact_draft:outsourcing_payable_draft': [
    'create_payable',
    '生成应付草稿',
  ],
  'step:purchase_payable_draft:posts_fact:purchase_payable': [
    'post_payable',
    '过账应付',
  ],
  'step:outsourcing_payable_draft:posts_fact:outsourcing_payable': [
    'post_payable',
    '过账应付',
  ],
}

export function businessChainRoleLabel(catalog, key) {
  const label = getPermissionCenterRoleName({ role_key: key })
  if (label !== '已配置岗位') return label
  const pool = catalog.processDefinitions
    .flatMap((definition) => definition.nodes)
    .find((node) => node.ownerPool === key)
  if (!pool) {
    throw new Error(`Missing chain design responsibility label: ${key}`)
  }
  return `${pool.label}分工`
}

function processEvidence(catalog, node, definition) {
  const { source } = node
  const task = node.type === 'task'
  const command = source.type === 'domain_command'
  const scoped = node.steps
    .flatMap((step) => step.stateTransitionRefs)
    .filter((ref) => ref.machineKey !== 'workflow.task')
  const matching = catalog.flows.flatMap((flow) =>
    flow.transitions
      .filter((rule) => [source.key, source.action].includes(rule.action))
      .map((rule) => ({
        machineKey: flow.key,
        transitionKey: rule.key,
        from: rule.from,
        to: rule.to,
        actionKey: rule.action,
      }))
  )
  const refs = command
    ? matching.length
      ? matching
      : scoped.length === 1
        ? scoped
        : []
    : []
  const otherStates = (field) =>
    command
      ? node.steps
          .flatMap((step) => step[field])
          .filter(
            (ref) =>
              ref.machineKey !== 'workflow.task' &&
              !scoped.some((item) => item.machineKey === ref.machineKey)
          )
      : []
  const step = {
    key: node.id,
    label: node.label,
    condition: node.definition,
    stateTransitionRefs: refs,
    preconditionStateRefs: otherStates('preconditionStateRefs'),
    resultStateRefs: otherStates('resultStateRefs'),
  }
  if (task) {
    node.definition = `${node.roles.map((key) => businessChainRoleLabel(catalog, key)).join('、')}在「${definition.label}」中办理「${node.label}」，按办理结果流向对应下游。`
  }
  const detail = describeDevBusinessChainStep(catalog, step)
  node.atomicEvidence = {
    ...detail,
    step,
    chainLabel: definition.label,
    condition: task
      ? node.definition
      : unique(node.steps.map((item) => item.condition).filter(Boolean)).join(
          '；'
        ) || node.definition,
    guards: refs
      .map(
        (ref) =>
          catalog.flows
            .find((flow) => flow.key === ref.machineKey)
            .transitions.find((rule) => rule.key === ref.transitionKey).guard
      )
      .filter(Boolean),
    responsibility: node.roles.length
      ? `${node.roles.map((key) => businessChainRoleLabel(catalog, key)).join('、')}${task || node.entry ? '办理' : '办理任务后由系统处理'}`
      : '系统处理',
    results: task
      ? [
          '任务办理结果由流程记录；业务状态和库存、账款变化由下游登记的业务动作分别完成。',
        ]
      : detail.results,
  }
  node.machineKeys = task
    ? ['workflow.task']
    : unique(
        [...refs, ...step.preconditionStateRefs, ...step.resultStateRefs].map(
          (ref) => ref.machineKey
        )
      )
  node.statePreviewStart = refs[0]?.from
}

export function governBusinessChainNodes(catalog, nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    node.searchLabels = unique([
      node.label,
      ...node.steps.map((step) => step.label),
    ])
    node.label = labels[node.id] || node.label
    node.definition =
      node.atomicEvidence?.condition ||
      node.source.summary ||
      node.source.condition ||
      ''
    node.catalogKind = 'node'
    node.exception =
      exceptionChains.has(node.chainKey) ||
      node.steps.some((step) =>
        ['reverses', 'reworks'].includes(
          catalog.businessChains
            .find((chain) => chain.key === node.chainKey)
            ?.edges.find((edge) => edge.key === step.edgeKey)?.kind
        )
      )
    if (node.splitInto) node.catalogKind = 'group'
    if (node.processNode) {
      const definition = catalog.processDefinitions.find(
        (item) => item.key === node.processNode.definitionKey
      )
      node.variantLabel = definition.label
      const triggers = definition.edges
        .filter((edge) => edge.to === node.source.key)
        .map((edge) => definition.nodes.find((item) => item.key === edge.from))
        .filter((item) => item.ownerPool)
      if (node.source.type === 'domain_command' && triggers.length) {
        node.roles = unique(triggers.map((item) => item.ownerPool))
      }
      if (node.source.permission?.includes(PermissionCode.WORKFLOW_TASK_REJECT)) {
        node.exception = true
      }
      if (node.source.type === 'domain_command') {
        node.type = node.entry ? 'business_action' : 'system'
        node.definition = node.entry
          ? '人员提交后进入此流程分支。'
          : '由本流程中的任务办理结果触发，调用领域动作；不能跳过前置任务直接生效。'
      } else if (node.source.type === 'end') {
        node.type = 'result'
        node.label =
          node.label === '结束'
            ? `${definition.label.split('（')[0]}完成`
            : node.label
        node.definition =
          '此节点表示当前流程分支结束；业务事实是否已生效，按上游具体业务动作核对。'
      }
      if (node.roles.length === 1) {
        node.domain =
          roleDomain[node.roles[0]] ||
          {
            sales: 'sales',
            engineering: 'engineering',
            purchase: 'purchase',
            quality: 'quality',
            finance: 'finance',
            production: 'production',
          }[node.roles[0]] ||
          node.domain
      }
      // Task evidence and each domain command are separate reading units.
      processEvidence(catalog, node, definition)
      if (node.chainKey === 'delivery_to_settlement') node.domain = 'delivery'
      node.conceptKey = `${node.chainKey}:process:${node.source.key}`
    } else if (node.id.startsWith('node:')) {
      if (node.source.layer === 'process_runtime') {
        node.splitInto = catalog.processDefinitions
          .filter((definition) =>
            node.source.processDefinitionKeys.includes(definition.key)
          )
          .map(
            (definition) =>
              `process:${node.chainKey}:${definition.key}:${definition.initial}`
          )
        node.splitMode = 'branches'
      }
      if (node.type === 'task') {
        const tasks = (node.relatedNodeIds || [])
          .map((id) => byId.get(id))
          .filter((item) => item?.type === 'task' && item.processNode)
        if (tasks.length === 1) node.representedBy = tasks[0].id
        else if (tasks.length) node.splitInto = tasks.map((item) => item.id)
        node.type = 'group'
      }
      if (
        node.id === 'node:finance_payment' ||
        node.id === 'node:finance_credit_note'
      ) {
        node.type = 'document'
      }
    } else if (node.id.startsWith('step:')) {
      if (
        resultSteps.has(node.source.key) ||
        node.source.responsibility.mode === 'derived'
      ) {
        node.type = 'result'
      }
      const processRefs = (node.relatedNodeIds || [])
        .map((id) => byId.get(id))
        .filter(Boolean)
      if (
        !node.splitInto &&
        processRefs.length &&
        !(
          node.source.key.includes(':starts_process:') &&
          processRefs.every((item) => item.type === 'task')
        )
      ) {
        const commands = processRefs.filter(
          (item) => item.source.type === 'domain_command'
        )
        const eventRefs = node.steps
          .flatMap((step) => step.stateTransitionRefs)
          .filter((ref) => ref.machineKey !== 'workflow.task')
        const exact = commands.filter(
          (item) =>
            eventRefs.length &&
            eventRefs.every(
              (ref) =>
                ref.actionKey === item.source.action ||
                ref.actionKey === item.source.key
            )
        )
        if (exact.length === 1 && node.chainKey !== 'production_exception') {
          node.representedBy = exact[0].id
        } else if (exact.length > 1) {
          node.splitInto = exact.map((item) => item.id)
        } else {
          node.splitInto = processRefs.map((item) => item.id)
        }
        node.splitMode = 'branches'
      }
    }
    if (node.id === 'step:material_request:requires:production_order') {
      node.type = 'rule'
    }
    if (
      [
        'step:shipment_draft:starts_process:shipment_release_process',
        'step:shipment_release:posts_fact:shipped',
        'step:shipped:reverses:shipment_cancelled',
      ].includes(node.id)
    ) {
      node.domain = 'delivery'
    }
    if (
      node.id === 'step:finished_quality:requires:packaging_confirmation' ||
      (node.parentId &&
        node.roles.includes('warehouse') &&
        node.machineKeys.includes('fact.production_wip_batch'))
    ) {
      node.domain = 'production'
    }
    if (node.id === 'step:released_production_order:posts_fact:wip_batch') {
      node.type = 'system'
      node.definition =
        '生产订单发布后由系统建立在制执行；不代表已领料、开工或成品入库。'
    }
    if (node.id.startsWith('step:') && node.type === 'result') {
      node.representedBy = `node:${node.source.toNodeKey}`
    }
    if (payableConcepts[node.id]) {
      const [conceptKey, conceptLabel] = payableConcepts[node.id]
      node.conceptKey = conceptKey
      node.conceptLabel = conceptLabel
      node.variantLabel = node.label
    }
    if (node.splitInto || node.type === 'group') {
      node.catalogKind = 'group'
      node.type = 'group'
    }
    if (node.representedBy) node.catalogKind = 'reference'
    if (node.type === 'result') {
      node.definition ||= '此节点表示办理结果；查看上游可了解由哪个动作形成。'
    }
  }
  // Exact state steps and ProcessRuntime commands describe the same event in the same chain.
  // Keep both source identities for view coordinates, but offer and expand one current reading node.
  for (const node of nodes.filter(
    (item) => item.atomicEvidence && !item.parentId && !item.processNode
  )) {
    const refs = node.steps.flatMap((step) => step.stateTransitionRefs)
    const candidates = nodes.filter(
      (item) =>
        item.processNode &&
        item.chainKey === node.chainKey &&
        refs.length === 1 &&
        [item.source.key, item.source.action].includes(refs[0].actionKey)
    )
    if (candidates.length !== 1) continue
    node.representedBy = candidates[0].id
    node.catalogKind = 'reference'
    candidates[0].atomicEvidence = {
      ...node.atomicEvidence,
      responsibility: `${candidates[0].roles.map((key) => businessChainRoleLabel(catalog, key)).join('、')}办理任务后由系统处理`,
    }
    candidates[0].machineKeys = node.machineKeys
    candidates[0].statePreviewStart = node.statePreviewStart
  }
  const concepts = new Map()
  for (const node of nodes.filter(
    (item) => item.conceptKey === 'submit_finance_payment'
  )) {
    if (!concepts.has(node.conceptKey)) concepts.set(node.conceptKey, node)
    else {
      node.representedBy = concepts.get(node.conceptKey).id
      node.catalogKind = 'reference'
    }
  }
  for (const node of nodes) {
    node.roleLabels = node.roles.map((key) =>
      businessChainRoleLabel(catalog, key)
    )
    node.sourceRefs = unique([
      ...(node.sourceRefs || []),
      ...(node.source.sourceRefs || []),
      ...node.steps.flatMap((step) => step.sourceRefs || []),
    ])
    if (node.representedBy) {
      const target = byId.get(node.representedBy)
      target.searchLabels = unique([
        ...target.searchLabels,
        ...node.searchLabels,
      ])
      target.relatedNodeIds = unique([
        ...(target.relatedNodeIds || []),
        ...(node.relatedNodeIds || []),
        node.id,
      ]).filter((id) => id !== target.id)
      target.sourceRefs = unique([
        ...(target.sourceRefs || []),
        ...node.sourceRefs,
      ])
    }
  }
}

export function buildBusinessChainNodeEntries(nodes) {
  const groups = new Map()
  for (const node of nodes.filter((item) => item.catalogKind !== 'reference')) {
    // Branches share one library heading, never one graph identity or inferred execution order.
    const key = node.conceptKey || node.id
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: node.conceptLabel || node.label,
        nodes: [],
      })
    }
    groups.get(key).nodes.push(node)
  }
  return [...groups.values()]
}

function matchesView(node, view) {
  if (view === 'steps') {
    return (
      node.catalogKind === 'node' &&
      ['business_action', 'task', 'system'].includes(node.type)
    )
  }
  if (view === 'tasks') return node.type === 'task'
  if (view === 'documents') {
    return ['document', 'master', 'record'].includes(node.type)
  }
  if (view === 'exceptions') {
    return node.exception && node.catalogKind === 'node'
  }
  return true
}

export function filterBusinessChainEntries(
  library,
  filters = {},
  allowedIds = null
) {
  const {
    view = 'steps',
    search = '',
    domain = '',
    type = '',
    chain = '',
    role = '',
  } = filters
  const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return library.entries
    .map((entry) => ({
      ...entry,
      nodes: entry.nodes.filter(
        (node) =>
          matchesView(node, view) &&
          (!domain || node.domain === domain) &&
          (!type || node.type === type) &&
          (!chain || node.chainKey === chain) &&
          (!role || node.roles.includes(role)) &&
          (!allowedIds || allowedIds.has(node.id)) &&
          terms.every((term) =>
            [
              node.label,
              node.chainLabel,
              node.variantLabel,
              node.definition,
              ...node.searchLabels,
              ...node.roleLabels,
            ]
              .join(' ')
              .toLocaleLowerCase()
              .includes(term)
          )
      ),
    }))
    .filter((entry) => entry.nodes.length)
}

export function businessChainFacetOptions(
  library,
  filters,
  field,
  options,
  allowedIds = null
) {
  return options.map((option) => ({
    ...option,
    count: filterBusinessChainEntries(
      library,
      { ...filters, [field]: option.value },
      allowedIds
    ).length,
  }))
}
