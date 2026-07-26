import {
  getCustomerPackage,
  listCustomerPackageKeys,
} from '../../../../config/customers/index.mjs'
import { DEV_STATUS_FLOWS_ROUTE } from './devRoutes.mjs'
import { BUSINESS_STATUS_OPTIONS } from './workflowStatus.mjs'

export const DEV_FLOW_STATE_ROUTE = DEV_STATUS_FLOWS_ROUTE
export const DEV_FLOW_STATE_CATALOG_VERSION = 'dev-flow-state-catalog/v1'

const STATUS_BOUNDARY_DOC = 'docs/architecture/状态工作流事实边界.md'
const STATUS_INDEX_DOC = 'docs/architecture/状态字典与生命周期索引.md'

const evidence = (kind, ref, summary) =>
  Object.freeze({
    kind,
    ref,
    summary,
    status: 'current_source',
  })

const state = (key, label, summary = '') => ({ key, label, summary })

const transition = (
  from,
  to,
  {
    guard,
    action,
    permission = [],
    factBoundary,
    sourceRefs = [],
    evidence: transitionEvidence = [],
  }
) => ({
  key: `${from}->${to}`,
  from,
  to,
  guard,
  action,
  permission,
  factBoundary,
  sourceRefs,
  evidence: transitionEvidence,
})

const unique = (values = []) => [...new Set(values)]

function exactNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function freezeStrings(values = []) {
  return Object.freeze([...values])
}

function normalizeEvidence(items = [], ownerKey = '') {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${ownerKey} must declare evidence`)
  }
  return Object.freeze(
    items.map((item) => {
      if (
        !item ||
        !exactNonEmptyString(item.kind) ||
        !exactNonEmptyString(item.ref) ||
        !exactNonEmptyString(item.summary)
      ) {
        throw new Error(`${ownerKey} has invalid evidence`)
      }
      return Object.freeze({ ...item })
    })
  )
}

function normalizeFlow(definition) {
  if (
    !definition ||
    !exactNonEmptyString(definition.key) ||
    !exactNonEmptyString(definition.scopeKey) ||
    !exactNonEmptyString(definition.kind) ||
    !exactNonEmptyString(definition.label) ||
    !exactNonEmptyString(definition.factBoundary)
  ) {
    throw new Error('flow definition is incomplete')
  }

  const sourceRefs = freezeStrings(unique(definition.sourceRefs || []))
  if (sourceRefs.length === 0) {
    throw new Error(`${definition.key} must declare sourceRefs`)
  }
  const flowEvidence = normalizeEvidence(definition.evidence, definition.key)
  const rawStates = Array.isArray(definition.states) ? definition.states : []
  const stateKeys = rawStates.map((item) => item?.key)
  if (
    stateKeys.length === 0 ||
    stateKeys.some((key) => !exactNonEmptyString(key)) ||
    new Set(stateKeys).size !== stateKeys.length
  ) {
    throw new Error(`${definition.key} has invalid states`)
  }
  if (rawStates.some((item) => !item || !exactNonEmptyString(item.label))) {
    throw new Error(`${definition.key} has a state without a label`)
  }

  const initialStates = unique(definition.initialStates || [])
  const terminalStates = unique(definition.terminalStates || [])
  const knownStateKeys = new Set(stateKeys)
  if (
    [...initialStates, ...terminalStates].some(
      (key) => !knownStateKeys.has(key)
    )
  ) {
    throw new Error(`${definition.key} references an unknown state`)
  }

  const states = Object.freeze(
    rawStates.map((item) =>
      Object.freeze({
        key: item.key,
        label: item.label,
        summary: item.summary || '',
        initial: initialStates.includes(item.key),
        terminal: terminalStates.includes(item.key),
        sourceRefs: freezeStrings(
          item.sourceRefs?.length ? item.sourceRefs : sourceRefs
        ),
        evidence: normalizeEvidence(
          item.evidence?.length ? item.evidence : flowEvidence,
          `${definition.key}:${item.key}`
        ),
      })
    )
  )

  const rawTransitions = Array.isArray(definition.transitions)
    ? definition.transitions
    : []
  const transitionKeys = new Set()
  const transitions = Object.freeze(
    rawTransitions.map((item) => {
      if (
        !item ||
        !knownStateKeys.has(item.from) ||
        !knownStateKeys.has(item.to) ||
        !exactNonEmptyString(item.guard) ||
        !exactNonEmptyString(item.action) ||
        !exactNonEmptyString(item.factBoundary)
      ) {
        throw new Error(`${definition.key} has an invalid transition`)
      }
      const key = `${item.from}->${item.to}`
      if (transitionKeys.has(key)) {
        throw new Error(`${definition.key} has duplicate transition ${key}`)
      }
      transitionKeys.add(key)
      if (
        /(^|[._-])(set|update|upsert)[._-]?status($|[._-])/iu.test(item.action)
      ) {
        throw new Error(
          `${definition.key} cannot expose generic status mutation`
        )
      }
      return Object.freeze({
        key,
        from: item.from,
        to: item.to,
        guard: item.guard,
        action: item.action,
        permission: freezeStrings(unique(item.permission || [])),
        factBoundary: item.factBoundary,
        sourceRefs: freezeStrings(
          item.sourceRefs?.length ? item.sourceRefs : sourceRefs
        ),
        evidence: normalizeEvidence(
          item.evidence?.length ? item.evidence : flowEvidence,
          `${definition.key}:${key}`
        ),
      })
    })
  )

  if (definition.kind === 'taxonomy' && transitions.length > 0) {
    throw new Error(`${definition.key} taxonomy cannot invent transitions`)
  }
  if (definition.kind === 'projection' && transitions.length > 0) {
    throw new Error(`${definition.key} projection cannot invent transitions`)
  }
  const transitionAuthority =
    definition.transitionAuthority ||
    (definition.kind === 'runtime'
      ? 'process_runtime'
      : definition.kind === 'state_machine'
        ? 'backend_contract'
        : '')
  if (!transitionAuthority) {
    throw new Error(`${definition.key} must declare transitionAuthority`)
  }
  const terminalPolicy =
    definition.terminalPolicy ||
    (definition.kind === 'projection'
      ? 'none_derived_projection'
      : definition.kind === 'taxonomy' && terminalStates.length === 0
        ? 'none_object_specific'
        : 'explicit')
  if (
    terminalPolicy === 'explicit' &&
    ['state_machine', 'runtime'].includes(definition.kind) &&
    terminalStates.length === 0
  ) {
    throw new Error(
      `${definition.key} must declare terminal states or an explicit no-terminal policy`
    )
  }
  if (terminalPolicy.startsWith('none_') && terminalStates.length > 0) {
    throw new Error(
      `${definition.key} no-terminal policy conflicts with terminal states`
    )
  }

  const permissions = unique(transitions.flatMap((item) => item.permission))

  return Object.freeze({
    key: definition.key,
    machineKey: definition.key,
    scopeKey: definition.scopeKey,
    kind: definition.kind,
    label: definition.label,
    summary: definition.summary || '',
    readOnly: true,
    previewOnly: false,
    runtimeAuthority: 'backend_domain_contract',
    authority: 'observed_backend_contract',
    allowsActionExecution: false,
    allowsGenericStatusWrite: false,
    unknownStatePolicy: 'fail_closed',
    transitionAuthority,
    terminalPolicy,
    linearLifecycle: definition.linearLifecycle !== false,
    initialStates: freezeStrings(initialStates),
    terminalStates: freezeStrings(terminalStates),
    states,
    transitions,
    guard: definition.guard || '合法动作由后端领域合同判定。',
    action: null,
    permission: freezeStrings(permissions),
    factBoundary: definition.factBoundary,
    sourceRefs,
    evidence: flowEvidence,
  })
}

const sourceDocumentEvidence = [
  evidence(
    'doc',
    STATUS_BOUNDARY_DOC,
    'Source Document 表达业务承诺，不替代库存、出货或财务事实。'
  ),
  evidence(
    'doc',
    STATUS_INDEX_DOC,
    '状态索引登记源单 canonical key 与目标生命周期。'
  ),
]

const factEvidence = [
  evidence(
    'doc',
    STATUS_BOUNDARY_DOC,
    'Fact 与 Ledger 只能由对应领域 usecase 写入和纠错。'
  ),
  evidence('doc', STATUS_INDEX_DOC, '状态索引登记各事实对象的精确状态集合。'),
]

function draftPostedCancelledDefinition({
  key,
  label,
  sourceRefs,
  postAction,
  cancelAction,
  postPermission,
  cancelPermission,
}) {
  return {
    key,
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label,
    summary: `${label}从草稿过账；取消会保留正式冲销或处置证据。`,
    states: [
      state('DRAFT', '草稿'),
      state('POSTED', '已过账'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['CANCELLED'],
    transitions: [
      transition('DRAFT', 'POSTED', {
        guard: '来源、数量、版本和幂等条件由领域 usecase 校验。',
        action: postAction,
        permission: [postPermission],
        factBoundary: 'fact_ledger',
      }),
      transition('DRAFT', 'CANCELLED', {
        guard: '草稿取消必须提供领域动作要求的正式参数。',
        action: cancelAction,
        permission: [cancelPermission],
        factBoundary: 'fact_ledger',
      }),
      transition('POSTED', 'CANCELLED', {
        guard: '已过账取消必须在领域事务内反向处理已生效影响。',
        action: cancelAction,
        permission: [cancelPermission],
        factBoundary: 'fact_ledger',
      }),
    ],
    guard: '状态只能由命名领域动作推进，不提供通用状态写入口。',
    factBoundary: 'fact_ledger',
    sourceRefs,
    evidence: [
      ...factEvidence,
      evidence('code', sourceRefs[0], `${label}状态与命名 usecase。`),
      evidence('code', sourceRefs[1], `${label}事务与精确状态门禁。`),
    ],
  }
}

function immutableRedEntryDefinition({ key, label, sourceRefs, summary }) {
  return {
    key,
    scopeKey: 'fact_ledger',
    kind: 'taxonomy',
    label,
    summary,
    states: [state('POSTED', '已过账'), state('REVERSED', '反向记录')],
    initialStates: ['POSTED', 'REVERSED'],
    terminalStates: ['POSTED', 'REVERSED'],
    transitions: [],
    transitionAuthority: 'object-specific',
    guard: '原记录不可变；REVERSED 是引用原记录的新反向事实，不是原行改状态。',
    factBoundary: 'immutable_red_entry_fact',
    sourceRefs,
    evidence: [
      ...factEvidence,
      evidence('code', sourceRefs[0], `${label}状态和命名 usecase。`),
      evidence('code', sourceRefs[1], `${label}以不可变反向记录纠错。`),
    ],
  }
}

const FLOW_DEFINITIONS = [
  {
    key: 'source.sales_order',
    scopeKey: 'source_document',
    kind: 'state_machine',
    label: '销售订单',
    summary: '销售承诺从草稿、提交、生效到关闭或取消。',
    states: [
      state('draft', '草稿'),
      state('submitted', '已提交'),
      state('active', '已生效'),
      state('closed', '已关闭'),
      state('canceled', '已取消'),
    ],
    initialStates: ['draft'],
    terminalStates: ['closed', 'canceled'],
    transitions: [
      transition('draft', 'submitted', {
        guard: '草稿提交必须由正式销售订单受理流程发起。',
        action: 'start_sales_order_acceptance_process',
        permission: ['sales_order.submit'],
        factBoundary: 'source_document_only',
      }),
      transition('submitted', 'active', {
        guard: '销售审批节点完成后，由 ProcessRuntime 白名单命令生效。',
        action: 'SalesOrderUsecase.ActivateSalesOrderForProcessCommand',
        permission: ['sales_order.activate', 'workflow.task.approve'],
        factBoundary: 'source_document_only',
      }),
      transition('draft', 'canceled', {
        guard: '仅允许通过销售订单取消 usecase。',
        action: 'cancel_sales_order',
        permission: ['sales_order.cancel'],
        factBoundary: 'source_document_only',
      }),
      transition('submitted', 'canceled', {
        guard: '仅允许通过销售订单取消 usecase。',
        action: 'cancel_sales_order',
        permission: ['sales_order.cancel'],
        factBoundary: 'source_document_only',
      }),
      transition('active', 'closed', {
        guard: '关闭条件由销售订单领域 usecase 校验。',
        action: 'close_sales_order',
        permission: ['sales_order.close'],
        factBoundary: 'source_document_only',
      }),
      transition('active', 'canceled', {
        guard: '取消条件由销售订单领域 usecase 校验。',
        action: 'cancel_sales_order',
        permission: ['sales_order.cancel'],
        factBoundary: 'source_document_only',
      }),
    ],
    guard: '只有 draft 可编辑；状态变化不能证明任何 Fact 已过账。',
    factBoundary: 'source_document_only',
    sourceRefs: [
      'server/internal/core/status/sales_order.go',
      'server/internal/biz/sales_order.go',
      'server/internal/service/jsonrpc_sales_order_lifecycle.go',
    ],
    evidence: [
      ...sourceDocumentEvidence,
      evidence(
        'code',
        'server/internal/core/status/sales_order.go',
        '销售订单状态集合与合法转换 helper。'
      ),
    ],
  },
  {
    key: 'source.purchase_order',
    scopeKey: 'source_document',
    kind: 'state_machine',
    label: '采购订单',
    summary: '采购承诺从草稿、提交、批准到关闭或取消。',
    states: [
      state('draft', '草稿'),
      state('submitted', '已提交'),
      state('approved', '已批准'),
      state('closed', '已关闭'),
      state('canceled', '已取消'),
    ],
    initialStates: ['draft'],
    terminalStates: ['closed', 'canceled'],
    transitions: [
      transition('draft', 'submitted', {
        guard: '采购草稿经正式提交动作冻结。',
        action: 'submit_purchase_order',
        permission: ['purchase.order.update'],
        factBoundary: 'source_document_only',
      }),
      transition('submitted', 'approved', {
        guard: '采购审批节点完成后执行唯一批准命令。',
        action: 'PurchaseOrderUsecase.ApprovePurchaseOrderForProcessCommand',
        permission: ['workflow.task.approve'],
        factBoundary: 'source_document_only',
      }),
      transition('draft', 'canceled', {
        guard: '取消条件由采购订单领域 usecase 校验。',
        action: 'cancel_purchase_order',
        permission: ['purchase.order.update'],
        factBoundary: 'source_document_only',
      }),
      transition('submitted', 'canceled', {
        guard: '取消条件由采购订单领域 usecase 校验。',
        action: 'cancel_purchase_order',
        permission: ['purchase.order.update'],
        factBoundary: 'source_document_only',
      }),
      transition('approved', 'closed', {
        guard: '关闭条件由采购订单领域 usecase 校验。',
        action: 'close_purchase_order',
        permission: ['purchase.order.update'],
        factBoundary: 'source_document_only',
      }),
      transition('approved', 'canceled', {
        guard: '取消条件由采购订单领域 usecase 校验。',
        action: 'cancel_purchase_order',
        permission: ['purchase.order.update'],
        factBoundary: 'source_document_only',
      }),
    ],
    guard: '采购批准仍只是业务承诺，不生成采购入库或库存事实。',
    factBoundary: 'source_document_only',
    sourceRefs: [
      'server/internal/core/status/purchase_order.go',
      'server/internal/biz/purchase_order.go',
      'server/internal/service/jsonrpc_purchase_order_lifecycle.go',
    ],
    evidence: [
      ...sourceDocumentEvidence,
      evidence(
        'code',
        'server/internal/core/status/purchase_order.go',
        '采购订单状态集合与合法转换 helper。'
      ),
    ],
  },
  {
    key: 'source.outsourcing_order',
    scopeKey: 'source_document',
    kind: 'state_machine',
    label: '委外订单',
    summary: '委外承诺从草稿、提交、确认到关闭或取消。',
    states: [
      state('draft', '草稿'),
      state('submitted', '已提交'),
      state('confirmed', '已确认'),
      state('closed', '已关闭'),
      state('canceled', '已取消'),
    ],
    initialStates: ['draft'],
    terminalStates: ['closed', 'canceled'],
    transitions: [
      transition('draft', 'submitted', {
        guard: '仅正式委外提交动作可推进。',
        action: 'submit_outsourcing_order',
        permission: ['outsourcing.order.update'],
        factBoundary: 'source_document_only',
      }),
      transition('submitted', 'confirmed', {
        guard: '仅正式委外确认动作可推进。',
        action: 'confirm_outsourcing_order',
        permission: ['outsourcing.order.confirm'],
        factBoundary: 'source_document_only',
      }),
      transition('draft', 'canceled', {
        guard: '取消条件由委外订单 usecase 校验。',
        action: 'cancel_outsourcing_order',
        permission: ['outsourcing.order.update'],
        factBoundary: 'source_document_only',
      }),
      transition('submitted', 'canceled', {
        guard: '取消条件由委外订单 usecase 校验。',
        action: 'cancel_outsourcing_order',
        permission: ['outsourcing.order.update'],
        factBoundary: 'source_document_only',
      }),
      transition('confirmed', 'closed', {
        guard: '关闭条件由委外订单 usecase 校验。',
        action: 'close_outsourcing_order',
        permission: ['outsourcing.order.update'],
        factBoundary: 'source_document_only',
      }),
      transition('confirmed', 'canceled', {
        guard: '取消条件由委外订单 usecase 校验。',
        action: 'cancel_outsourcing_order',
        permission: ['outsourcing.order.update'],
        factBoundary: 'source_document_only',
      }),
    ],
    guard: '委外确认不等于委外发料、回货、质检或应付事实。',
    factBoundary: 'source_document_only',
    sourceRefs: [
      'server/internal/biz/outsourcing_order.go',
      'server/internal/service/jsonrpc_outsourcing_order_lifecycle.go',
    ],
    evidence: [
      ...sourceDocumentEvidence,
      evidence(
        'code',
        'server/internal/biz/outsourcing_order.go',
        '委外订单状态常量、合法转换和 usecase 动作。'
      ),
    ],
  },
  {
    key: 'source.production_order',
    scopeKey: 'source_document',
    kind: 'state_machine',
    label: '生产订单',
    summary: '生产承诺从草稿发布，随后关闭或受事实门禁取消。',
    states: [
      state('DRAFT', '草稿'),
      state('RELEASED', '已发布'),
      state('CLOSED', '已关闭'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['CLOSED', 'CANCELLED'],
    transitions: [
      transition('DRAFT', 'RELEASED', {
        guard: '发布会冻结正式生产需求并校验当前版本。',
        action: 'release_production_order',
        permission: ['pmc.plan.update'],
        factBoundary: 'source_document_only',
      }),
      transition('RELEASED', 'CLOSED', {
        guard: '关闭前校验 WIP、事实和关联任务门禁。',
        action: 'close_production_order',
        permission: ['pmc.plan.update'],
        factBoundary: 'source_document_only',
      }),
      transition('DRAFT', 'CANCELLED', {
        guard: '取消必须提供正式原因并走生产订单 receipt。',
        action: 'cancel_production_order',
        permission: ['pmc.plan.update'],
        factBoundary: 'source_document_only',
      }),
      transition('RELEASED', 'CANCELLED', {
        guard: '存在生效事实、WIP 或关联任务时失败关闭。',
        action: 'cancel_production_order',
        permission: ['pmc.plan.update'],
        factBoundary: 'source_document_only',
      }),
    ],
    guard: '状态变化受 version、幂等 receipt 和事实关联门禁约束。',
    factBoundary: 'source_document_only',
    sourceRefs: [
      'server/internal/biz/production_order.go',
      'server/internal/data/production_order_repo.go',
      'server/internal/service/jsonrpc_production_order.go',
    ],
    evidence: [
      ...sourceDocumentEvidence,
      evidence(
        'code',
        'server/internal/biz/production_order.go',
        '生产订单 canonical 状态和命令。'
      ),
      evidence(
        'code',
        'server/internal/data/production_order_repo.go',
        '发布、关闭和取消的 CAS 与事实门禁。'
      ),
    ],
  },
  {
    key: 'source.order_item',
    scopeKey: 'source_document',
    kind: 'taxonomy',
    label: '销售 / 采购订单行',
    summary: '订单行共享开放、关闭、取消词汇，但不存在跨源单的通用迁移器。',
    states: [
      state('open', '开放'),
      state('closed', '已关闭'),
      state('canceled', '已取消'),
    ],
    initialStates: ['open'],
    terminalStates: ['closed', 'canceled'],
    transitions: [],
    transitionAuthority: 'object-specific',
    linearLifecycle: false,
    guard: '行状态由所属源单 usecase 维护；目录不得伪造统一行级动作。',
    factBoundary: 'source_document_item_only',
    sourceRefs: [
      'server/internal/core/status/sales_order.go',
      'server/internal/core/status/purchase_order.go',
    ],
    evidence: [
      ...sourceDocumentEvidence,
      evidence(
        'code',
        'server/internal/core/status/sales_order.go',
        '销售订单行状态集合。'
      ),
      evidence(
        'code',
        'server/internal/core/status/purchase_order.go',
        '采购订单行状态集合。'
      ),
    ],
  },
  {
    key: 'master.bom',
    scopeKey: 'masterdata_lifecycle',
    kind: 'state_machine',
    label: 'BOM 版本',
    summary: 'BOM 版本可以从草稿激活或归档，并允许归档版本重新激活。',
    states: [
      state('DRAFT', '草稿'),
      state('ACTIVE', '生效'),
      state('ARCHIVED', '已归档'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: [],
    terminalPolicy: 'none_reactivatable',
    transitions: [
      transition('DRAFT', 'ACTIVE', {
        guard: '激活前校验 BOM 头、明细和引用完整性。',
        action: 'activate_bom_version',
        permission: ['bom.activate'],
        factBoundary: 'master_data_only',
      }),
      transition('DRAFT', 'ARCHIVED', {
        guard: '归档只改变版本生命周期，不删除引用。',
        action: 'archive_bom_version',
        permission: ['bom.update'],
        factBoundary: 'master_data_only',
      }),
      transition('ACTIVE', 'ARCHIVED', {
        guard: '归档只改变版本生命周期，不删除引用。',
        action: 'archive_bom_version',
        permission: ['bom.update'],
        factBoundary: 'master_data_only',
      }),
      transition('ARCHIVED', 'ACTIVE', {
        guard: '重新激活仍需通过 BOM 领域校验。',
        action: 'activate_bom_version',
        permission: ['bom.activate'],
        factBoundary: 'master_data_only',
      }),
    ],
    guard: 'BOM 生命周期不生成采购、生产、库存或成本事实。',
    factBoundary: 'master_data_only',
    sourceRefs: [
      'server/internal/biz/inventory.go',
      'server/internal/service/jsonrpc_bom.go',
      'server/internal/service/jsonrpc_bom_version.go',
    ],
    evidence: [
      evidence(
        'doc',
        STATUS_INDEX_DOC,
        '状态索引登记 BOM DRAFT / ACTIVE / ARCHIVED 合同。'
      ),
      evidence(
        'code',
        'server/internal/biz/inventory.go',
        'BOM 状态集合、创建初态和显式转换。'
      ),
    ],
  },
  {
    key: 'master.lifecycle',
    scopeKey: 'masterdata_lifecycle',
    kind: 'taxonomy',
    label: '通用主数据生命周期词汇',
    summary: '启用、停用、归档只是跨对象词汇，不构成统一状态机。',
    states: [
      state('active', '启用'),
      state('inactive', '停用'),
      state('archived', '归档'),
    ],
    initialStates: [],
    terminalStates: [],
    transitions: [],
    transitionAuthority: 'object-specific',
    linearLifecycle: false,
    guard: '每个主数据对象使用自己的 usecase 和引用门禁，目录只读。',
    factBoundary: 'master_data_only',
    sourceRefs: [STATUS_INDEX_DOC],
    evidence: [
      evidence('doc', STATUS_INDEX_DOC, '状态树明确主数据生命周期为对象专属。'),
    ],
  },
  {
    key: 'workflow.task',
    scopeKey: 'workflow_task',
    kind: 'state_machine',
    label: 'Workflow 协同任务',
    summary: '任务只表达岗位协同是否可执行、阻塞、完成或退回。',
    states: [
      state('ready', '可执行'),
      state('blocked', '阻塞'),
      state('done', '已完成'),
      state('rejected', '已退回'),
    ],
    initialStates: ['ready'],
    terminalStates: ['done', 'rejected'],
    transitions: [
      transition('ready', 'blocked', {
        guard: '必须提供非空阻塞原因、version 和幂等键。',
        action: 'block_task_action',
        permission: ['workflow.task.update'],
        factBoundary: 'workflow_only',
      }),
      transition('ready', 'done', {
        guard: '同时校验任务类型、责任池、owner/assignee、version 和幂等。',
        action: 'complete_task_action',
        permission: ['workflow.task.complete', 'workflow.task.approve'],
        factBoundary: 'workflow_only',
      }),
      transition('ready', 'rejected', {
        guard: '必须提供非空退回原因、version 和幂等键。',
        action: 'reject_task_action',
        permission: ['workflow.task.reject'],
        factBoundary: 'workflow_only',
      }),
      transition('blocked', 'ready', {
        guard: '必须提供新的解除说明并清理旧阻塞原因。',
        action: 'resume_task_action',
        permission: ['workflow.task.update'],
        factBoundary: 'workflow_only',
      }),
    ],
    guard: 'task done 不等于 Fact posted；终态任务不重开。',
    factBoundary: 'workflow_only',
    sourceRefs: [
      'server/internal/biz/workflow_metadata.go',
      'server/internal/biz/workflow.go',
      'server/internal/service/jsonrpc_workflow_task.go',
    ],
    evidence: [
      evidence(
        'code',
        'server/internal/biz/workflow_metadata.go',
        '四状态 registry、唯一转换图、终态和动作权限。'
      ),
      evidence(
        'doc',
        STATUS_BOUNDARY_DOC,
        'Workflow 任务合同、API 边界和 Fact 禁区。'
      ),
    ],
  },
  {
    key: 'workflow.business_projection',
    scopeKey: 'business_projection',
    kind: 'projection',
    label: 'Workflow 业务进度投影',
    summary: '跨来源共用的阶段词汇，不是所有来源共享的线性状态机。',
    states: BUSINESS_STATUS_OPTIONS.map((item) =>
      state(item.key, item.label, item.summary)
    ),
    initialStates: [],
    terminalStates: [],
    transitions: [],
    transitionAuthority: 'derived-only',
    linearLifecycle: false,
    guard: '只有受控任务动作、ProcessRuntime 或领域 usecase 可以生产投影。',
    factBoundary: 'read_only_projection',
    sourceRefs: [
      'server/internal/biz/workflow_metadata.go',
      'server/internal/data/model/schema/workflow_business_state.go',
      'web/src/erp/config/workflowStatus.mjs',
    ],
    evidence: [
      evidence(
        'code',
        'server/internal/biz/workflow_metadata.go',
        '业务投影 canonical taxonomy。'
      ),
      evidence(
        'doc',
        STATUS_BOUNDARY_DOC,
        '业务进度投影不替代真实出货、对账或结算。'
      ),
      evidence(
        'ui_mapping',
        'web/src/erp/config/workflowStatus.mjs',
        '共享中文展示映射，不是运行时写入真源。'
      ),
    ],
  },
  {
    key: 'process.instance',
    scopeKey: 'process_runtime',
    kind: 'runtime',
    label: 'ProcessRuntime 实例',
    summary: '流程实例只能运行、完成或阻塞。',
    states: [
      state('active', '运行中'),
      state('completed', '已完成'),
      state('blocked', '已阻塞'),
    ],
    initialStates: ['active'],
    terminalStates: ['completed', 'blocked'],
    transitions: [
      transition('active', 'completed', {
        guard: '所有节点按冻结流程合同结算后，由 runtime 完成实例。',
        action: 'ProcessRuntimeUsecase.CompleteProcessInstance',
        permission: [],
        factBoundary: 'orchestration_only',
      }),
      transition('active', 'blocked', {
        guard: '节点或领域命令失败关闭时，runtime 原子阻塞实例。',
        action: 'ProcessRuntimeUsecase.BlockProcessInstance',
        permission: [],
        factBoundary: 'orchestration_only',
      }),
    ],
    guard: '实例状态由 runtime 内部推进，外部没有通用 set_status。',
    factBoundary: 'orchestration_only',
    sourceRefs: [
      'server/internal/biz/process_runtime.go',
      'server/internal/data/process_runtime_repo.go',
      'server/internal/data/model/schema/process_instance.go',
    ],
    evidence: [
      evidence(
        'code',
        'server/internal/biz/process_runtime.go',
        '流程实例状态、节点类型和运行时合同。'
      ),
      evidence(
        'doc',
        STATUS_BOUNDARY_DOC,
        'ProcessRuntime 只编排白名单领域命令。'
      ),
    ],
  },
  {
    key: 'process.node',
    scopeKey: 'process_runtime',
    kind: 'runtime',
    label: 'ProcessRuntime 节点 attempt',
    summary: '节点 attempt 从等待激活，随后完成或阻塞。',
    states: [
      state('waiting', '等待中'),
      state('active', '运行中'),
      state('completed', '已完成'),
      state('blocked', '已阻塞'),
    ],
    initialStates: ['waiting'],
    terminalStates: ['completed', 'blocked'],
    transitions: [
      transition('waiting', 'active', {
        guard: '由 runtime 根据上游结果和冻结定义激活。',
        action: 'ProcessRuntimeUsecase.ActivateProcessNodeInstance',
        permission: [],
        factBoundary: 'orchestration_only',
      }),
      transition('active', 'completed', {
        guard: '必须具备节点 outcome；领域命令还需 durable result 证据。',
        action: 'ProcessRuntimeUsecase.CompleteProcessNodeInstance',
        permission: [],
        factBoundary: 'orchestration_only',
      }),
      transition('active', 'blocked', {
        guard: '阻塞原因、version 与领域命令 fingerprint 必须一致。',
        action: 'ProcessRuntimeUsecase.BlockProcessNodeAndInstance',
        permission: [],
        factBoundary: 'orchestration_only',
      }),
    ],
    guard: 'node completed 只表示节点结算，不替代领域 Fact。',
    factBoundary: 'orchestration_only',
    sourceRefs: [
      'server/internal/biz/process_runtime.go',
      'server/internal/data/process_runtime_repo.go',
      'server/internal/data/model/schema/process_node_instance.go',
    ],
    evidence: [
      evidence(
        'code',
        'server/internal/biz/process_runtime.go',
        '节点状态、类型、attempt、outcome 和 durable command 证据。'
      ),
      evidence('doc', STATUS_BOUNDARY_DOC, '节点完成与领域事实必须分别取证。'),
    ],
  },
  ...[
    {
      key: 'fact.purchase_receipt',
      label: '采购入库',
      postAction: 'post_purchase_receipt',
      cancelAction: 'cancel_purchase_receipt',
      postPermission: ['purchase.receipt.create'],
      cancelPermission: ['purchase.receipt.create'],
    },
    {
      key: 'fact.purchase_return',
      label: '采购退货',
      postAction: 'post_purchase_return',
      cancelAction: 'cancel_purchase_return',
      postPermission: ['purchase.return.post'],
      cancelPermission: ['purchase.return.cancel'],
    },
    {
      key: 'fact.purchase_receipt_adjustment',
      label: '采购入库调整',
      postAction: 'post_purchase_receipt_adjustment',
      cancelAction: 'cancel_purchase_receipt_adjustment',
      postPermission: ['purchase.receipt.adjustment.post'],
      cancelPermission: ['purchase.receipt.adjustment.cancel'],
    },
  ].map((item) => ({
    key: item.key,
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: item.label,
    summary: `${item.label}使用草稿、过账和取消的正式事实生命周期。`,
    states: [
      state('DRAFT', '草稿'),
      state('POSTED', '已过账'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['CANCELLED'],
    transitions: [
      transition('DRAFT', 'POSTED', {
        guard: '后端在领域事务内校验来源、数量、状态和库存影响。',
        action: item.postAction,
        permission: item.postPermission,
        factBoundary: 'fact_ledger',
      }),
      transition('DRAFT', 'CANCELLED', {
        guard: '草稿取消必须走对应领域 usecase。',
        action: item.cancelAction,
        permission: item.cancelPermission,
        factBoundary: 'fact_ledger',
      }),
      transition('POSTED', 'CANCELLED', {
        guard: '取消已过账事实必须在同一事实链写 REVERSAL。',
        action: item.cancelAction,
        permission: item.cancelPermission,
        factBoundary: 'fact_ledger',
      }),
    ],
    guard: '已过账记录不改回草稿、不物理删除。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/core/status/posting_document.go',
      'server/internal/biz/purchase_receipt.go',
      'server/internal/biz/purchase_return.go',
      'server/internal/biz/purchase_receipt_adjustment.go',
      'server/internal/data/purchase_receipt_repo.go',
      'server/internal/data/purchase_return_repo.go',
      'server/internal/data/purchase_receipt_adjustment_repo.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/core/status/posting_document.go',
        '采购入库、退货和调整共享的精确状态转换 helper。'
      ),
    ],
  })),
  {
    key: 'fact.quality_inspection',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '质量检验',
    summary: '正式质检从草稿提交，再判定通过、不通过或取消。',
    states: [
      state('DRAFT', '草稿'),
      state('SUBMITTED', '已提交'),
      state('PASSED', '已通过'),
      state('REJECTED', '不通过'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['PASSED', 'REJECTED', 'CANCELLED'],
    transitions: [
      transition('DRAFT', 'SUBMITTED', {
        guard: '提交前校验正式检验来源和必填数据。',
        action: 'submit_quality_inspection',
        permission: ['quality.inspection.update'],
        factBoundary: 'fact_ledger',
      }),
      transition('DRAFT', 'CANCELLED', {
        guard: '草稿质检只能通过正式取消动作终止。',
        action: 'cancel_quality_inspection',
        permission: ['quality.inspection.update'],
        factBoundary: 'fact_ledger',
      }),
      transition('SUBMITTED', 'PASSED', {
        guard: '判定结果由正式质检 usecase 写入。',
        action: 'pass_quality_inspection',
        permission: ['quality.inspection.update'],
        factBoundary: 'fact_ledger',
      }),
      transition('SUBMITTED', 'REJECTED', {
        guard: '判定结果由正式质检 usecase 写入。',
        action: 'reject_quality_inspection',
        permission: ['quality.inspection.update'],
        factBoundary: 'fact_ledger',
      }),
      transition('SUBMITTED', 'CANCELLED', {
        guard: '已提交质检取消条件由领域 usecase 校验。',
        action: 'cancel_quality_inspection',
        permission: ['quality.inspection.update'],
        factBoundary: 'fact_ledger',
      }),
    ],
    guard: 'Workflow 质检任务完成不等于 Quality Fact 已判定。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/core/status/quality_inspection.go',
      'server/internal/biz/quality_inspection.go',
      'server/internal/service/jsonrpc_quality.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/core/status/quality_inspection.go',
        '质检提交、判定和取消的精确转换。'
      ),
    ],
  },
  {
    key: 'fact.shipment',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '出货单',
    summary: '出货单由草稿确认出货；取消时写库存 REVERSAL。',
    states: [
      state('DRAFT', '草稿'),
      state('SHIPPED', '已出货'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['CANCELLED'],
    transitions: [
      transition('DRAFT', 'SHIPPED', {
        guard: '重新校验财务放行、质检、来源数量、预留和可用库存。',
        action: 'ship_shipment',
        permission: ['shipment.ship'],
        factBoundary: 'fact_ledger',
      }),
      transition('DRAFT', 'CANCELLED', {
        guard: '草稿出货取消必须走正式领域动作。',
        action: 'cancel_shipment',
        permission: ['shipment.cancel'],
        factBoundary: 'fact_ledger',
      }),
      transition('SHIPPED', 'CANCELLED', {
        guard: '取消已出货单必须在同一事务写库存 REVERSAL。',
        action: 'cancel_shipment',
        permission: ['shipment.cancel'],
        factBoundary: 'fact_ledger',
      }),
    ],
    guard: 'shipping_released 只是协同投影，不是 SHIPPED。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/core/status/shipment.go',
      'server/internal/biz/operational_fact.go',
      'server/internal/service/jsonrpc_operational_fact_shipment.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/core/status/shipment.go',
        '出货与取消的精确状态转换。'
      ),
      evidence(
        'doc',
        STATUS_BOUNDARY_DOC,
        '出货放行、真实 SHIPPED 和库存流水必须分层。'
      ),
    ],
  },
  ...[
    {
      key: 'fact.production',
      label: '生产事实',
      postAction: 'post_production_fact',
      cancelAction: 'cancel_production_fact',
      postPermission: ['production.fact.post'],
      cancelPermission: ['production.fact.cancel'],
    },
    {
      key: 'fact.outsourcing',
      label: '委外事实',
      postAction: 'post_outsourcing_fact',
      cancelAction: 'cancel_outsourcing_fact',
      postPermission: ['outsourcing.fact.post'],
      cancelPermission: ['outsourcing.fact.cancel'],
    },
  ].map((item) => ({
    key: item.key,
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: item.label,
    summary: `${item.label}使用草稿、过账和取消生命周期。`,
    states: [
      state('DRAFT', '草稿'),
      state('POSTED', '已过账'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['CANCELLED'],
    transitions: [
      transition('DRAFT', 'POSTED', {
        guard: '来源、数量、批次和关联门禁由领域事务校验。',
        action: item.postAction,
        permission: item.postPermission,
        factBoundary: 'fact_ledger',
      }),
      transition('POSTED', 'CANCELLED', {
        guard: '取消通过对应领域 usecase 保留冲正与审计证据。',
        action: item.cancelAction,
        permission: item.cancelPermission,
        factBoundary: 'fact_ledger',
      }),
    ],
    guard: 'Fact 不能由 Workflow payload 或页面状态补造。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/biz/operational_fact.go',
      'server/internal/service/jsonrpc_operational_fact.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/biz/operational_fact.go',
        '生产与委外事实状态集合及命名 post/cancel usecase。'
      ),
    ],
  })),
  {
    key: 'fact.stock_reservation',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '库存预留',
    summary: 'ACTIVE 预留只能释放、消费或取消。',
    states: [
      state('ACTIVE', '生效'),
      state('RELEASED', '已释放'),
      state('CONSUMED', '已消耗'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['ACTIVE'],
    terminalStates: ['RELEASED', 'CONSUMED', 'CANCELLED'],
    transitions: [
      transition('ACTIVE', 'RELEASED', {
        guard: '释放必须走预留领域 usecase。',
        action: 'release_stock_reservation',
        permission: ['stock.reservation.release'],
        factBoundary: 'fact_ledger',
      }),
      transition('ACTIVE', 'CONSUMED', {
        guard: '仅正式出货事务可以消费匹配的 ACTIVE 预留。',
        action: 'OperationalFactUsecase.ConsumeStockReservationForShipment',
        permission: ['shipment.ship'],
        factBoundary: 'fact_ledger',
      }),
      transition('ACTIVE', 'CANCELLED', {
        guard: '取消由来源失效或正式领域动作决定，不开放通用写入。',
        action: 'OperationalFactUsecase.CancelStockReservation',
        permission: [],
        factBoundary: 'fact_ledger',
      }),
    ],
    guard: '预留影响可用量，但不替代追加式 inventory_txns。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/biz/operational_fact.go',
      'server/internal/data/operational_fact_repo.go',
      'server/internal/service/jsonrpc_operational_fact_reservation.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/biz/operational_fact.go',
        '库存预留精确状态集合。'
      ),
    ],
  },
  {
    key: 'fact.finance',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '业务财务事实',
    summary: '应收、应付、发票和对账等事实从草稿过账，再结清或取消。',
    states: [
      state('DRAFT', '草稿'),
      state('POSTED', '已过账'),
      state('SETTLED', '已结清'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['SETTLED', 'CANCELLED'],
    transitions: [
      transition('DRAFT', 'POSTED', {
        guard: '来源、往来方、币种和金额由后端事实 usecase 校验。',
        action: 'post_finance_fact',
        permission: [
          'finance.receivable.confirm',
          'finance.payable.confirm',
          'finance.invoice.confirm',
          'finance.reconciliation.confirm',
        ],
        factBoundary: 'fact_ledger',
      }),
      transition('POSTED', 'SETTLED', {
        guard: '只有允许结清的事实类型可以推进。',
        action: 'settle_finance_fact',
        permission: [
          'finance.receivable.confirm',
          'finance.payable.confirm',
          'finance.invoice.confirm',
          'finance.reconciliation.confirm',
        ],
        factBoundary: 'fact_ledger',
      }),
      transition('POSTED', 'CANCELLED', {
        guard: '必须保留 actor、非空原因和原 posted_at。',
        action: 'cancel_finance_fact',
        permission: [
          'finance.receivable.confirm',
          'finance.payable.confirm',
          'finance.invoice.confirm',
          'finance.reconciliation.confirm',
        ],
        factBoundary: 'fact_ledger',
      }),
    ],
    guard:
      '真实收付款、核销和红冲另有各自合同，并在本目录分对象登记；不得把它们合并为 finance_fact 状态。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/biz/operational_fact.go',
      'server/internal/data/model/schema/finance_fact.go',
      'server/internal/service/jsonrpc_operational_fact_finance.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/biz/operational_fact.go',
        '财务事实状态集合与 post/settle/cancel usecase。'
      ),
      evidence(
        'schema',
        'server/internal/data/model/schema/finance_fact.go',
        '财务事实状态 CHECK、取消审计束和不可变字段。'
      ),
    ],
  },
  {
    key: 'fact.inventory_lot',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '库存批次',
    summary: '批次可用、冻结、拒收和停用受余额门禁约束。',
    states: [
      state('ACTIVE', '可用'),
      state('HOLD', '冻结'),
      state('REJECTED', '拒收'),
      state('DISABLED', '停用'),
    ],
    initialStates: ['ACTIVE'],
    terminalStates: ['DISABLED'],
    transitions: [
      transition('ACTIVE', 'HOLD', {
        guard: '由库存批次领域动作冻结。',
        action: 'InventoryUsecase.ChangeInventoryLotStatus',
        permission: [],
        factBoundary: 'fact_ledger',
      }),
      transition('HOLD', 'ACTIVE', {
        guard: '由库存批次领域动作解除冻结。',
        action: 'InventoryUsecase.ChangeInventoryLotStatus',
        permission: [],
        factBoundary: 'fact_ledger',
      }),
      transition('HOLD', 'REJECTED', {
        guard: '拒收判定必须保留正式质检或处置依据。',
        action: 'InventoryUsecase.ChangeInventoryLotStatus',
        permission: [],
        factBoundary: 'fact_ledger',
      }),
      transition('REJECTED', 'ACTIVE', {
        guard: '恢复可用必须走库存批次领域校验。',
        action: 'InventoryUsecase.ChangeInventoryLotStatus',
        permission: [],
        factBoundary: 'fact_ledger',
      }),
      transition('REJECTED', 'HOLD', {
        guard: '恢复为冻结必须走库存批次领域校验。',
        action: 'InventoryUsecase.ChangeInventoryLotStatus',
        permission: [],
        factBoundary: 'fact_ledger',
      }),
      ...['ACTIVE', 'HOLD', 'REJECTED'].map((from) =>
        transition(from, 'DISABLED', {
          guard: '只有批次余额不为正时才允许停用。',
          action: 'InventoryUsecase.ChangeInventoryLotStatus',
          permission: [],
          factBoundary: 'fact_ledger',
        })
      ),
    ],
    guard: '未知状态或正余额停用请求一律失败关闭。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/core/status/inventory_lot.go',
      'server/internal/biz/inventory.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/core/status/inventory_lot.go',
        '库存批次状态集合、转换和正余额停用门禁。'
      ),
    ],
  },
  {
    key: 'fact.production_wip_batch',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '生产在制批次',
    summary: '在制批次由命名工序动作和正式质量关口推进。',
    states: [
      state('PLANNED', '待安排'),
      state('SPLIT', '已拆分'),
      state('IN_PROGRESS', '本厂加工中'),
      state('OUTSOURCED', '委外加工中'),
      state('WAITING_QUALITY', '待质量判定'),
      state('ACCEPTED', '已接收'),
      state('REJECTED', '不通过'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['PLANNED'],
    terminalStates: ['SPLIT', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
    transitions: [
      transition('PLANNED', 'SPLIT', {
        guard: '拆分数量、来源批次和幂等 receipt 必须通过领域校验。',
        action: 'execute_production_wip_action:SPLIT_BATCH',
        permission: ['production.wip.assign'],
        factBoundary: 'production_wip',
      }),
      transition('PLANNED', 'IN_PROGRESS', {
        guard: '执行模式必须为 IN_HOUSE，包材和工序前置条件均满足。',
        action: 'execute_production_wip_action:START_OPERATION',
        permission: ['production.wip.execute'],
        factBoundary: 'production_wip',
      }),
      transition('PLANNED', 'OUTSOURCED', {
        guard: '执行模式必须为 OUTSOURCED 且存在合法委外分配。',
        action: 'execute_production_wip_action:START_OPERATION',
        permission: ['production.wip.execute'],
        factBoundary: 'production_wip',
      }),
      transition('PLANNED', 'CANCELLED', {
        guard: '仅未开始批次可由命名取消动作终止。',
        action: 'execute_production_wip_action:CANCEL_BATCH',
        permission: ['production.wip.assign'],
        factBoundary: 'production_wip',
      }),
      ...['IN_PROGRESS', 'OUTSOURCED'].flatMap((from) => [
        transition(from, 'WAITING_QUALITY', {
          guard: '工序完成且冻结路线包含必需质量关口。',
          action:
            from === 'IN_PROGRESS'
              ? 'execute_production_wip_action:COMPLETE_OPERATION'
              : 'execute_production_wip_action:RECEIVE_OUTSOURCING_RETURN',
          permission: ['production.wip.execute'],
          factBoundary: 'production_wip',
        }),
        transition(from, 'ACCEPTED', {
          guard: '工序完成且冻结路线不要求质量关口。',
          action:
            from === 'IN_PROGRESS'
              ? 'execute_production_wip_action:COMPLETE_OPERATION'
              : 'execute_production_wip_action:RECEIVE_OUTSOURCING_RETURN',
          permission: ['production.wip.execute'],
          factBoundary: 'production_wip',
        }),
      ]),
      transition('WAITING_QUALITY', 'ACCEPTED', {
        guard: '所有冻结质量关口均已正式 PASS。',
        action: 'updateProductionWIPBatchQualityStatus',
        permission: ['quality.inspection.update'],
        factBoundary: 'quality_fact_updates_wip',
      }),
      transition('WAITING_QUALITY', 'REJECTED', {
        guard: '当前冻结质量关口已正式 REJECT。',
        action: 'updateProductionWIPBatchQualityStatus',
        permission: ['quality.inspection.update'],
        factBoundary: 'quality_fact_updates_wip',
      }),
    ],
    guard: 'SPLIT 是已消费父批次；终态不能通过通用状态写入重新打开。',
    factBoundary: 'production_wip',
    sourceRefs: [
      'server/internal/biz/production_wip.go',
      'server/internal/data/production_wip_repo.go',
      'server/internal/data/quality_inspection_repo.go',
      'server/internal/service/jsonrpc_production_wip.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/biz/production_wip.go',
        '在制状态、命名动作、合法转换和关闭门禁。'
      ),
      evidence(
        'code',
        'server/internal/data/quality_inspection_repo.go',
        'WAITING_QUALITY 到 ACCEPTED / REJECTED 的事务写入。'
      ),
    ],
  },
  {
    key: 'fact.production_packaging_confirmation',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '生产包材确认',
    summary: '包材版面确认只允许从待确认推进为已确认。',
    states: [state('PENDING', '待确认'), state('CONFIRMED', '已确认')],
    initialStates: ['PENDING'],
    terminalStates: ['CONFIRMED'],
    transitions: [
      transition('PENDING', 'CONFIRMED', {
        guard: '包材版本快照、生产订单行、version 和 receipt 必须匹配。',
        action: 'execute_production_wip_action:CONFIRM_PACKAGING_MATERIAL',
        permission: ['production.packaging_material.confirm'],
        factBoundary: 'production_confirmation',
      }),
    ],
    guard: '确认记录不能由页面直接改写或回退。',
    factBoundary: 'production_confirmation',
    sourceRefs: [
      'server/internal/biz/production_wip.go',
      'server/internal/data/production_wip_repo.go',
      'server/internal/service/jsonrpc_production_wip.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/biz/production_wip.go',
        '包材确认状态和精确 NextProductionPackagingConfirmationStatus。'
      ),
    ],
  },
  {
    key: 'fact.sales_return',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '客户退货',
    summary: '客户退货从草稿审批、收货，并可在质检门禁允许时取消。',
    states: [
      state('DRAFT', '草稿'),
      state('APPROVED', '已批准'),
      state('RECEIVED', '已收货'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['CANCELLED'],
    transitions: [
      transition('DRAFT', 'APPROVED', {
        guard: '来源出货、退货明细和版本由领域事务校验。',
        action: 'approve_sales_return',
        permission: ['sales_return.approve'],
        factBoundary: 'fact_ledger',
      }),
      transition('APPROVED', 'RECEIVED', {
        guard: '收货同步写库存与质检草稿/提交状态。',
        action: 'receive_sales_return',
        permission: ['sales_return.receive'],
        factBoundary: 'fact_ledger',
      }),
      ...['DRAFT', 'APPROVED', 'RECEIVED'].map((from) =>
        transition(from, 'CANCELLED', {
          guard: '正式质检尚未越过可取消边界，并提供取消原因。',
          action: 'cancel_sales_return',
          permission: ['sales_return.cancel'],
          factBoundary: 'fact_ledger',
        })
      ),
    ],
    guard: 'RECEIVED 不一定终止；能否取消由关联质检和库存事务判定。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/biz/sales_return.go',
      'server/internal/data/operational_fact_sales_return_repo.go',
      'server/internal/service/jsonrpc_operational_fact_sales_return.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/data/operational_fact_sales_return_repo.go',
        '客户退货 approve / receive / cancel 的精确前态门禁。'
      ),
    ],
  },
  {
    key: 'fact.production_exception_decision',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '生产异常决策',
    summary: '异常申请经正式批准、拒绝或取消，和执行状态分开。',
    states: [
      state('SUBMITTED', '已提交'),
      state('APPROVED', '已批准'),
      state('REJECTED', '已拒绝'),
      state('CANCELLED', '已取消'),
    ],
    initialStates: ['SUBMITTED'],
    terminalStates: ['APPROVED', 'REJECTED', 'CANCELLED'],
    transitions: [
      transition('SUBMITTED', 'APPROVED', {
        guard: '批准数量、version、actor 和原因必须合法。',
        action: 'approve_production_exception',
        permission: ['quality.exception.handle'],
        factBoundary: 'decision_only',
      }),
      transition('SUBMITTED', 'REJECTED', {
        guard: '拒绝必须提供正式原因并匹配当前 version。',
        action: 'reject_production_exception',
        permission: ['quality.exception.handle'],
        factBoundary: 'decision_only',
      }),
      transition('SUBMITTED', 'CANCELLED', {
        guard: '取消必须提供正式原因并匹配当前 version。',
        action: 'cancel_production_exception',
        permission: ['quality.exception.handle'],
        factBoundary: 'decision_only',
      }),
    ],
    guard: 'APPROVED 只表示决策完成，不证明异常影响已执行。',
    factBoundary: 'decision_only',
    sourceRefs: [
      'server/internal/biz/production_exception_decision.go',
      'server/internal/data/production_exception_decision_repo.go',
      'server/internal/service/jsonrpc_operational_fact_exception.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/data/production_exception_decision_repo.go',
        '异常决策仅允许从 SUBMITTED 进入三个决策终态。'
      ),
    ],
  },
  {
    key: 'fact.production_exception_execution',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '生产异常执行状态',
    summary: '已批准异常的实际影响从待执行到生效，再可正式冲正。',
    states: [
      state('PENDING', '待执行'),
      state('APPLIED', '已生效'),
      state('REVERSED', '已冲正'),
    ],
    initialStates: ['PENDING'],
    terminalStates: ['REVERSED'],
    transitions: [
      transition('PENDING', 'APPLIED', {
        guard: '决策必须 APPROVED，类型可执行且批准数量有效。',
        action: 'execute_production_exception',
        permission: ['production.fact.post'],
        factBoundary: 'fact_ledger',
      }),
      transition('APPLIED', 'REVERSED', {
        guard: '冲正必须匹配原影响、version、actor 和非空原因。',
        action: 'reverse_production_exception',
        permission: ['production.fact.post'],
        factBoundary: 'fact_ledger',
      }),
    ],
    guard: '执行状态不能用决策状态或 Workflow task 状态替代。',
    factBoundary: 'fact_ledger',
    sourceRefs: [
      'server/internal/biz/production_exception_decision.go',
      'server/internal/data/production_exception_decision_repo.go',
      'server/internal/service/jsonrpc_operational_fact_exception.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/data/production_exception_decision_repo.go',
        '异常执行和冲正的精确状态与事务门禁。'
      ),
    ],
  },
  draftPostedCancelledDefinition({
    key: 'fact.purchase_rejection_disposition',
    label: '采购拒收处置',
    sourceRefs: [
      'server/internal/biz/purchase_rejection_disposition.go',
      'server/internal/data/purchase_rejection_disposition_repo.go',
      'server/internal/service/jsonrpc_purchase_rejection_disposition.go',
    ],
    postAction: 'post_purchase_rejection_disposition',
    cancelAction: 'cancel_purchase_rejection_disposition',
    postPermission: 'purchase.return.post',
    cancelPermission: 'purchase.return.cancel',
  }),
  draftPostedCancelledDefinition({
    key: 'fact.outsourcing_return_disposition',
    label: '委外回货处置',
    sourceRefs: [
      'server/internal/biz/outsourcing_return_disposition.go',
      'server/internal/data/outsourcing_return_disposition_repo.go',
      'server/internal/service/jsonrpc_operational_fact_outsourcing.go',
    ],
    postAction: 'post_outsourcing_return_disposition',
    cancelAction: 'cancel_outsourcing_return_disposition',
    postPermission: 'outsourcing.fact.post',
    cancelPermission: 'outsourcing.fact.cancel',
  }),
  {
    key: 'fact.finance_payment',
    scopeKey: 'fact_ledger',
    kind: 'state_machine',
    label: '收付款单',
    summary: '收付款单从草稿过账并生成核销记录，之后可正式冲正。',
    states: [
      state('DRAFT', '草稿'),
      state('POSTED', '已过账'),
      state('REVERSED', '已冲正'),
    ],
    initialStates: ['DRAFT'],
    terminalStates: ['REVERSED'],
    transitions: [
      transition('DRAFT', 'POSTED', {
        guard: '往来方、币种、金额、核销目标和 version 必须一致。',
        action: 'post_finance_payment',
        permission: ['finance.payment.post'],
        factBoundary: 'finance_fact',
      }),
      transition('POSTED', 'REVERSED', {
        guard: '冲正必须提供原因并创建匹配的反向核销记录。',
        action: 'reverse_finance_payment',
        permission: ['finance.payment.reverse'],
        factBoundary: 'finance_fact',
      }),
    ],
    guard: '过账和冲正均为事务动作，不允许回到 DRAFT。',
    factBoundary: 'finance_fact',
    sourceRefs: [
      'server/internal/biz/finance_payment.go',
      'server/internal/data/operational_fact_finance_payment_repo.go',
      'server/internal/service/jsonrpc_operational_fact_finance_payment.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/data/operational_fact_finance_payment_repo.go',
        '收付款过账、核销和冲正的事务合同。'
      ),
    ],
  },
  immutableRedEntryDefinition({
    key: 'fact.finance_allocation',
    label: '财务核销记录',
    summary: 'POSTED 核销与 REVERSED 反向核销是两条不可变记录，不是单行迁移。',
    sourceRefs: [
      'server/internal/biz/finance_payment.go',
      'server/internal/data/operational_fact_finance_payment_repo.go',
      'server/internal/data/model/schema/finance_allocation.go',
    ],
  }),
  immutableRedEntryDefinition({
    key: 'fact.finance_credit_note',
    label: '财务红冲单',
    summary:
      'POSTED 红冲与 REVERSED 反向红冲是两条不可变记录，原红冲保持不变。',
    sourceRefs: [
      'server/internal/biz/finance_payment.go',
      'server/internal/data/operational_fact_finance_payment_repo.go',
      'server/internal/data/model/schema/finance_credit_note.go',
    ],
  }),
  {
    key: 'fact.shipment_finance_release',
    scopeKey: 'fact_ledger',
    kind: 'taxonomy',
    label: '出货财务放行',
    summary: '出货单财务放行字段与真实 SHIPPED 状态分开。',
    states: [
      state('PENDING', '待放行'),
      state('APPROVED', '已放行'),
      state('REJECTED', '已拒绝'),
    ],
    initialStates: ['PENDING'],
    terminalStates: ['APPROVED', 'REJECTED'],
    transitions: [],
    transitionAuthority: 'object-specific',
    guard:
      '当前 Product Core 只登记 PENDING 到 APPROVED 的流程命令写入；目录不为 REJECTED 猜测通用边。',
    factBoundary: 'shipment_release_not_shipped',
    sourceRefs: [
      'server/internal/biz/process_runtime.go',
      'server/internal/biz/shipment_process_command.go',
      'server/internal/data/operational_fact_shipment_repo.go',
      'server/internal/data/model/schema/shipment.go',
    ],
    evidence: [
      ...factEvidence,
      evidence(
        'code',
        'server/internal/data/operational_fact_shipment_repo.go',
        '财务放行命令仅在精确门禁下写 APPROVED。'
      ),
    ],
  },
  draftPostedCancelledDefinition({
    key: 'fact.inventory_operation',
    label: '库存操作单',
    sourceRefs: [
      'server/internal/biz/inventory_operation.go',
      'server/internal/data/inventory_operation_repo.go',
      'server/internal/service/jsonrpc_inventory_operation.go',
      'server/internal/data/model/schema/inventory_operation.go',
    ],
    postAction: 'post_inventory_operation',
    cancelAction: 'cancel_inventory_operation',
    postPermission: 'warehouse.adjustment.create',
    cancelPermission: 'warehouse.adjustment.create',
  }),
  {
    key: 'control.customer_config_revision',
    scopeKey: 'customer_config_control',
    kind: 'taxonomy',
    label: '客户配置 Revision',
    summary: '配置 revision 经事务内构建、发布、激活和被后续 revision 替代。',
    states: [
      state('building', '构建中'),
      state('published', '已发布'),
      state('active', '已激活'),
      state('superseded', '已被替代'),
    ],
    initialStates: ['building'],
    terminalStates: [],
    terminalPolicy: 'none_multi_revision_switch',
    transitions: [],
    transitionAuthority: 'object-specific',
    guard:
      'activate / rollback 会锁定同一客户的全部 revisions，并在同一事务切换 active 与 superseded；不得画成单 revision 万能回退。',
    factBoundary: 'customer_config_control_plane',
    sourceRefs: [
      'server/internal/biz/customer_config.go',
      'server/internal/biz/customer_config_transition.go',
      'server/internal/data/customer_config_repo.go',
      'server/internal/data/model/schema/customer_config_revision.go',
      'server/internal/service/jsonrpc_customer_config.go',
    ],
    evidence: [
      evidence(
        'code',
        'server/internal/data/customer_config_repo.go',
        'building 仅存在于发布事务，activate / rollback 是多 revision 切换。'
      ),
      evidence(
        'schema',
        'server/internal/data/model/schema/customer_config_revision.go',
        '客户配置 revision 的四个合法状态。'
      ),
    ],
  },
]

const SCOPE_DEFINITIONS = [
  {
    key: 'source_document',
    label: '源单生命周期',
    summary: '销售、采购、委外和生产等业务承诺。',
    guardrail: '源单状态不证明库存、质检、出货或财务事实发生。',
  },
  {
    key: 'workflow_task',
    label: 'Workflow 协同任务',
    summary: '责任人或责任池的任务处理状态。',
    guardrail: 'task done 不等于 Fact posted。',
  },
  {
    key: 'process_runtime',
    label: 'ProcessRuntime',
    summary: '流程实例、节点 attempt、等待事件和白名单领域命令。',
    guardrail: 'ProcessRuntime 不是任意脚本或通用单据状态机。',
  },
  {
    key: 'business_projection',
    label: '业务进度投影',
    summary: '跨岗位协同进度的只读词汇。',
    guardrail: '投影 key 不是统一线性生命周期或事实真源。',
  },
  {
    key: 'fact_ledger',
    label: 'Fact / Ledger',
    summary: '实际发生并可审计、取消、冲正或调整的业务事实。',
    guardrail: 'Fact 只能由领域 usecase 写入。',
  },
  {
    key: 'masterdata_lifecycle',
    label: 'MasterData 生命周期',
    summary: '主数据和版本对象的启用、停用或归档。',
    guardrail: '停用和归档不删除既有正式引用。',
  },
  {
    key: 'derived_result',
    label: '派生结果',
    summary: '余额、完成度和履约进度等计算结果。',
    guardrail: '派生结果不建立重复事实真源。',
  },
  {
    key: 'customer_config_control',
    label: '客户配置控制面',
    summary: '客户配置 revision 的发布、激活和回滚控制面。',
    guardrail: '激活与回滚是多 revision 事务切换，不是单对象任意改状态。',
  },
]

const FLOW_LAYER_DEFINITIONS = [
  {
    key: 'business',
    label: '业务承诺',
    summary: '销售、采购、生产和委外等源单表达业务承诺。',
    boundary: 'source_document_not_fact',
    sourceRefs: [STATUS_BOUNDARY_DOC, STATUS_INDEX_DOC],
  },
  {
    key: 'state',
    label: '状态合同',
    summary: '状态集合、合法转换、初态与终态来自后端领域合同。',
    boundary: 'backend_contract_observation',
    sourceRefs: [
      STATUS_INDEX_DOC,
      'server/internal/core/status/sales_order.go',
    ],
  },
  {
    key: 'workflow',
    label: '流程编排',
    summary: 'ProcessRuntime 冻结定义并按节点编排白名单领域命令。',
    boundary: 'orchestration_not_fact',
    sourceRefs: [STATUS_BOUNDARY_DOC, 'server/internal/biz/process_runtime.go'],
  },
  {
    key: 'approval',
    label: '审批',
    summary: '审批只处理责任与决策，领域变化仍由命名命令执行。',
    boundary: 'approval_decision_not_posting',
    sourceRefs: [
      STATUS_BOUNDARY_DOC,
      'server/internal/biz/customer_process_contracts.go',
    ],
  },
  {
    key: 'task',
    label: '协同任务',
    summary: 'Workflow task 表达责任人、责任池和处理结果。',
    boundary: 'task_done_not_fact_posted',
    sourceRefs: [STATUS_BOUNDARY_DOC, 'server/internal/biz/workflow.go'],
  },
  {
    key: 'exception',
    label: '异常处置',
    summary: '异常决策与执行事实分别取证，支持明确的冲正路径。',
    boundary: 'decision_separate_from_execution',
    sourceRefs: [
      STATUS_BOUNDARY_DOC,
      'server/internal/biz/production_exception_decision.go',
    ],
  },
  {
    key: 'notification',
    label: '通知',
    summary: '通知只传递可见信息，不推进领域状态。',
    boundary: 'notification_has_no_transition_authority',
    sourceRefs: [
      STATUS_BOUNDARY_DOC,
      'server/internal/biz/workflow_metadata.go',
    ],
  },
  {
    key: 'automation',
    label: '自动化',
    summary: '自动化仅可调用已登记的窄领域命令。',
    boundary: 'registered_domain_commands_only',
    sourceRefs: [STATUS_BOUNDARY_DOC, 'server/internal/biz/process_runtime.go'],
  },
  {
    key: 'fact',
    label: '事实与账本',
    summary: '库存、质检、出货、生产和财务事实由领域事务写入。',
    boundary: 'domain_usecase_owned_fact',
    sourceRefs: [
      STATUS_BOUNDARY_DOC,
      'server/internal/biz/operational_fact.go',
    ],
  },
]

function normalizeFlowLayer(definition) {
  const sourceRefs = freezeStrings(unique(definition.sourceRefs))
  return Object.freeze({
    ...definition,
    readOnly: true,
    runtimeAuthority: 'backend_domain_contract',
    allowsActionExecution: false,
    allowsGenericStatusWrite: false,
    sourceRefs,
    evidence: Object.freeze(
      sourceRefs.map((ref) =>
        evidence(
          ref.endsWith('.md') ? 'doc' : 'code',
          ref,
          `${definition.label}边界的当前真源。`
        )
      )
    ),
  })
}

export const flowLayers = Object.freeze(
  FLOW_LAYER_DEFINITIONS.map(normalizeFlowLayer)
)

const PROCESS_SOURCE_REFS = Object.freeze([
  'server/internal/biz/customer_process_contracts.go',
  'server/internal/biz/process_runtime.go',
])

function processNode(
  key,
  type,
  label,
  {
    ownerPool = null,
    action = null,
    permission = [],
    factBoundary = 'no_fact_posting',
  } = {}
) {
  return {
    key,
    type,
    label,
    ownerPool,
    action,
    permission,
    factBoundary,
    sourceRefs: PROCESS_SOURCE_REFS,
  }
}

function normalizeProcessDefinition(definition) {
  const sourceRefs = freezeStrings(PROCESS_SOURCE_REFS)
  const nodes = Object.freeze(
    definition.nodes.map((node) =>
      Object.freeze({
        ...node,
        permission: freezeStrings(unique(node.permission)),
        sourceRefs: freezeStrings(node.sourceRefs),
        evidence: Object.freeze([
          evidence(
            'code',
            'server/internal/biz/customer_process_contracts.go',
            `${node.key} 节点的 Product Core 登记合同。`
          ),
        ]),
      })
    )
  )
  const nodeKeys = new Set(nodes.map((node) => node.key))
  const edges = Object.freeze(
    nodes.slice(0, -1).map((node, index) =>
      Object.freeze({
        key: `${node.key}->${nodes[index + 1].key}`,
        from: node.key,
        to: nodes[index + 1].key,
        factBoundary: 'orchestration_only',
        sourceRefs,
        evidence: Object.freeze([
          evidence(
            'code',
            'server/internal/biz/customer_process_contracts.go',
            '边顺序直接来自 Product Core 冻结节点序列。'
          ),
        ]),
      })
    )
  )
  if (!nodeKeys.has(definition.initial) || !nodeKeys.has(definition.terminal)) {
    throw new Error(`${definition.key} has an invalid process boundary`)
  }
  return Object.freeze({
    ...definition,
    nodes,
    edges,
    readOnly: true,
    runtimeAuthority: 'backend_domain_contract',
    allowsActionExecution: false,
    factBoundary: 'no_fact_posting',
    guardrail:
      'ProcessRuntime 本身不因节点完成而过账；只有登记的 domain command 可调用对应领域 usecase。',
    sourceRefs,
    evidence: Object.freeze([
      evidence(
        'code',
        'server/internal/biz/customer_process_contracts.go',
        'Product Core 登记流程 variant、节点、责任池和命令合同。'
      ),
      evidence(
        'code',
        'server/internal/biz/process_runtime.go',
        'ProcessRuntime 冻结并执行已登记的流程定义。'
      ),
    ]),
  })
}

const salesProcessNodes = (includeEngineering) => [
  processNode('submit_sales_order', 'domain_command', '提交销售订单', {
    action: 'SalesOrderUsecase.SubmitSalesOrder',
    permission: ['sales_order.submit'],
    factBoundary: 'source_document_only',
  }),
  processNode('order_approval', 'approval', '订单审批', {
    ownerPool: 'boss',
    permission: ['workflow.task.approve'],
    factBoundary: 'orchestration_only',
  }),
  processNode('activate_sales_order', 'domain_command', '生效销售订单', {
    action: 'SalesOrderUsecase.ActivateSalesOrderForProcessCommand',
    permission: ['workflow.task.approve'],
    factBoundary: 'source_document_only',
  }),
  ...(includeEngineering
    ? [
        processNode('engineering_data', 'human_task', '工程资料', {
          ownerPool: 'engineering_data',
          permission: ['workflow.task.complete'],
          factBoundary: 'orchestration_only',
        }),
      ]
    : []),
  processNode('order_review', 'human_task', '订单评审', {
    ownerPool: 'order_review',
    permission: ['workflow.task.complete'],
    factBoundary: 'orchestration_only',
  }),
  processNode('end', 'end', '结束'),
]

export const processDefinitions = Object.freeze(
  [
    {
      key: 'sales_order_acceptance/approval_pmc',
      processKey: 'sales_order_acceptance',
      processVersion: 'v1',
      variantKey: 'approval_pmc',
      businessRefType: 'sales_order',
      label: '销售订单受理（审批 + PMC）',
      initial: 'submit_sales_order',
      terminal: 'end',
      nodes: salesProcessNodes(false),
    },
    {
      key: 'sales_order_acceptance/approval_engineering_pmc',
      processKey: 'sales_order_acceptance',
      processVersion: 'v1',
      variantKey: 'approval_engineering_pmc',
      businessRefType: 'sales_order',
      label: '销售订单受理（审批 + 工程 + PMC）',
      initial: 'submit_sales_order',
      terminal: 'end',
      nodes: salesProcessNodes(true),
    },
    {
      key: 'material_supply/purchase_order_approval',
      processKey: 'material_supply',
      processVersion: 'v1',
      variantKey: 'purchase_order_approval',
      businessRefType: 'purchase_order',
      label: '物料供应（采购提交与审批）',
      initial: 'submit_purchase_order',
      terminal: 'end',
      nodes: [
        processNode('submit_purchase_order', 'domain_command', '提交采购订单', {
          action: 'PurchaseOrderUsecase.SubmitPurchaseOrderForProcessCommand',
          permission: ['purchase.order.update'],
          factBoundary: 'source_document_only',
        }),
        processNode('purchase_order_approval', 'approval', '采购订单审批', {
          ownerPool: 'boss',
          permission: ['workflow.task.approve'],
          factBoundary: 'orchestration_only',
        }),
        processNode(
          'approve_purchase_order',
          'domain_command',
          '批准采购订单',
          {
            action: 'PurchaseOrderUsecase.ApprovePurchaseOrder',
            permission: ['workflow.task.approve'],
            factBoundary: 'source_document_only',
          }
        ),
        processNode('end', 'end', '结束'),
      ],
    },
    {
      key: 'finished_goods_delivery/shipment_finance_approval',
      processKey: 'finished_goods_delivery',
      processVersion: 'v1',
      variantKey: 'shipment_finance_approval',
      businessRefType: 'shipment',
      label: '成品交付（财务审批与版本化放行）',
      initial: 'shipment_finance_approval',
      terminal: 'end',
      nodes: [
        processNode('shipment_finance_approval', 'approval', '出货财务审批', {
          ownerPool: 'finance',
          permission: ['workflow.task.approve'],
          factBoundary: 'orchestration_only',
        }),
        processNode(
          'shipment_finance_release',
          'domain_command',
          '记录财务放行',
          {
            ownerPool: 'shipment_finance_release',
            action: 'OperationalFactUsecase.RecordShipmentFinanceRelease',
            permission: ['finance.receivable.confirm'],
            factBoundary: 'shipment_release_via_domain_usecase',
          }
        ),
        processNode('end', 'end', '结束'),
      ],
    },
  ].map(normalizeProcessDefinition)
)

const CUSTOMER_PACKAGE_REGISTRY = Object.freeze(
  listCustomerPackageKeys().map((customerKey) =>
    Object.freeze({
      customerPackage: getCustomerPackage(customerKey),
      sourceRef: `config/customers/${customerKey}/customerPackage.mjs`,
    })
  )
)

const PREVIEW_MACHINE_BINDINGS = Object.freeze({
  demo_sales_lifecycle: 'source.sales_order',
  demo_purchase_lifecycle: 'source.purchase_order',
  demo_finance_lifecycle: 'fact.finance',
  sales_order_lifecycle: 'source.sales_order',
  purchase_order_lifecycle: 'source.purchase_order',
  production_order_lifecycle: 'source.production_order',
})

function transitionSet(items = []) {
  return new Set(
    items.map((item) =>
      Array.isArray(item) ? `${item[0]}->${item[1]}` : item.key
    )
  )
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value))
}

function inferBoundaryStates(states, transitions, direction) {
  const touched = new Set(
    transitions.map((item) => (direction === 'initial' ? item[1] : item[0]))
  )
  return states.filter((key) => !touched.has(key))
}

export function comparePreviewStateMachine(
  previewDefinition,
  canonicalMachine
) {
  if (
    !previewDefinition ||
    previewDefinition.status !== 'preview_only' ||
    !Array.isArray(previewDefinition.states) ||
    !Array.isArray(previewDefinition.transitions)
  ) {
    return Object.freeze({
      status: 'invalid_preview',
      isDrift: true,
      canonicalMachineKey: canonicalMachine?.key || null,
      reasons: Object.freeze(['preview_contract_invalid']),
    })
  }
  if (!canonicalMachine) {
    return Object.freeze({
      status: 'unmapped',
      isDrift: true,
      canonicalMachineKey: null,
      reasons: Object.freeze(['no_exact_canonical_binding']),
    })
  }

  const previewStates = previewDefinition.states
  const previewStateSet = new Set(previewStates)
  const previewTransitions = previewDefinition.transitions
  const internallyInvalid =
    previewStates.some((key) => !exactNonEmptyString(key)) ||
    previewStateSet.size !== previewStates.length ||
    previewTransitions.some(
      (item) =>
        !Array.isArray(item) ||
        item.length !== 2 ||
        !previewStateSet.has(item[0]) ||
        !previewStateSet.has(item[1])
    )
  if (internallyInvalid) {
    return Object.freeze({
      status: 'invalid_preview',
      isDrift: true,
      canonicalMachineKey: canonicalMachine.key,
      reasons: Object.freeze(['preview_contract_invalid']),
    })
  }

  const canonicalStateSet = new Set(
    canonicalMachine.states.map((item) => item.key)
  )
  const previewTransitionSet = transitionSet(previewTransitions)
  const canonicalTransitionSet = transitionSet(canonicalMachine.transitions)
  const previewInitialStates = inferBoundaryStates(
    previewStates,
    previewTransitions,
    'initial'
  )
  const previewTerminalStates = inferBoundaryStates(
    previewStates,
    previewTransitions,
    'terminal'
  )
  const canonicalInitialSet = new Set(canonicalMachine.initialStates)
  const canonicalTerminalSet = new Set(canonicalMachine.terminalStates)
  const previewInitialSet = new Set(previewInitialStates)
  const previewTerminalSet = new Set(previewTerminalStates)

  const stateDiff = Object.freeze({
    missing: freezeStrings(setDifference(canonicalStateSet, previewStateSet)),
    extra: freezeStrings(setDifference(previewStateSet, canonicalStateSet)),
  })
  const transitionDiff = Object.freeze({
    missing: freezeStrings(
      setDifference(canonicalTransitionSet, previewTransitionSet)
    ),
    extra: freezeStrings(
      setDifference(previewTransitionSet, canonicalTransitionSet)
    ),
  })
  const initialDiff = Object.freeze({
    preview: freezeStrings(previewInitialStates),
    canonical: canonicalMachine.initialStates,
    missing: freezeStrings(
      setDifference(canonicalInitialSet, previewInitialSet)
    ),
    extra: freezeStrings(setDifference(previewInitialSet, canonicalInitialSet)),
  })
  const terminalDiff = Object.freeze({
    preview: freezeStrings(previewTerminalStates),
    canonical: canonicalMachine.terminalStates,
    missing: freezeStrings(
      setDifference(canonicalTerminalSet, previewTerminalSet)
    ),
    extra: freezeStrings(
      setDifference(previewTerminalSet, canonicalTerminalSet)
    ),
  })
  const isDrift = [stateDiff, transitionDiff, initialDiff, terminalDiff].some(
    (item) => item.missing.length > 0 || item.extra.length > 0
  )

  return Object.freeze({
    status: isDrift ? 'drift' : 'match',
    isDrift,
    canonicalMachineKey: canonicalMachine.key,
    states: stateDiff,
    transitions: transitionDiff,
    initialStates: initialDiff,
    terminalStates: terminalDiff,
    reasons: freezeStrings(isDrift ? ['preview_differs_from_runtime'] : []),
  })
}

function buildPreviewEntry({ item, kind, customerKey, sourceRef, flowByKey }) {
  const canonicalMachineKey =
    kind === 'state_machine'
      ? PREVIEW_MACHINE_BINDINGS[item?.key] || null
      : null
  const comparison =
    kind === 'state_machine'
      ? comparePreviewStateMachine(
          item,
          canonicalMachineKey
            ? flowByKey.get(canonicalMachineKey) || null
            : null
        )
      : Object.freeze({
          status: 'not_comparable',
          isDrift: false,
          canonicalMachineKey: null,
          reasons: Object.freeze(['preview_structure_has_no_runtime_machine']),
        })

  return Object.freeze({
    key: item?.key || '',
    kind,
    customerKey,
    label: item?.label || item?.key || '未命名预览项',
    status: item?.status || 'unknown',
    previewOnly: true,
    runtimeAuthority: 'customer_preview_only',
    readOnly: true,
    allowsActionExecution: false,
    allowsGenericStatusWrite: false,
    guardrail: item?.guardrail || '',
    sourceRefs: freezeStrings([sourceRef]),
    evidence: Object.freeze([
      evidence(
        'customer_preview',
        sourceRef,
        '客户包声明式预览；不覆盖后端 usecase、RBAC 或 Fact。'
      ),
    ]),
    canonicalMachineKey,
    comparison,
    definition: item,
  })
}

function buildRuntimeProcessSelection(
  item,
  customerKey,
  sourceRef,
  processDefinitionByIdentity
) {
  const processKey = item?.processKey || ''
  const processVersion = item?.processVersion || ''
  const variantKey = item?.variantKey || ''
  const businessRefType = item?.businessRefType || ''
  const identity = [
    processKey,
    processVersion,
    variantKey,
    businessRefType,
  ].join('/')
  const canonicalProcessDefinition =
    processDefinitionByIdentity.get(identity) || null
  const sameProcess = processDefinitions.filter(
    (definition) => definition.processKey === processKey
  )
  const sameVariant = sameProcess.find(
    (definition) => definition.variantKey === variantKey
  )
  const status = canonicalProcessDefinition
    ? 'registered_preview_selection'
    : sameProcess.length === 0
      ? 'unknown_process'
      : !sameVariant
        ? 'unknown_variant'
        : 'identity_mismatch'

  return Object.freeze({
    key: identity,
    customerKey,
    processKey,
    processVersion,
    variantKey,
    businessRefType,
    status,
    previewOnly: true,
    runtimeAuthority: 'customer_preview_only',
    readOnly: true,
    allowsActionExecution: false,
    sourceRefs: freezeStrings([sourceRef]),
    evidence: Object.freeze([
      evidence(
        'customer_preview',
        sourceRef,
        '客户包只选择 Product Core 已登记流程 variant，不提供运行图。'
      ),
    ]),
    canonicalProcessDefinition,
    definition: item,
  })
}

function buildCustomerOverlay(
  registration,
  flowByKey,
  processDefinitionByIdentity
) {
  const customerPackage = registration?.customerPackage || {}
  const sourceRef = registration?.sourceRef || ''
  const customerKey = customerPackage.customerKey || ''
  const mapPreviewItems = (items, kind) =>
    Object.freeze(
      (Array.isArray(items) ? items : []).map((item) =>
        buildPreviewEntry({
          item,
          kind,
          customerKey,
          sourceRef,
          flowByKey,
        })
      )
    )

  return Object.freeze({
    key: customerKey,
    customerKey,
    packageKey: customerPackage.packageKey || '',
    label: customerPackage.label || customerKey,
    status: customerPackage.status || 'unknown',
    previewOnly: true,
    runtimeAuthority: 'customer_preview_only',
    readOnly: true,
    allowsActionExecution: false,
    allowsGenericStatusWrite: false,
    sourceRefs: freezeStrings([sourceRef]),
    evidence: Object.freeze([
      evidence(
        'customer_preview',
        sourceRef,
        'overlay 直接派生自已登记 customerPackage。'
      ),
    ]),
    businessFlows: mapPreviewItems(
      customerPackage.businessFlows,
      'business_flow'
    ),
    stateMachines: mapPreviewItems(
      customerPackage.stateMachines,
      'state_machine'
    ),
    processPolicies: mapPreviewItems(
      customerPackage.processPolicies,
      'process_policy'
    ),
    runtimeProcessSelections: Object.freeze(
      (Array.isArray(customerPackage.runtimeProcessSelections)
        ? customerPackage.runtimeProcessSelections
        : []
      ).map((item) =>
        buildRuntimeProcessSelection(
          item,
          customerKey,
          sourceRef,
          processDefinitionByIdentity
        )
      )
    ),
    definition: customerPackage,
  })
}

function normalizeScope(definition) {
  const sourceRefs = freezeStrings([STATUS_BOUNDARY_DOC, STATUS_INDEX_DOC])
  return Object.freeze({
    ...definition,
    readOnly: true,
    runtimeAuthority: 'backend_domain_contract',
    sourceRefs,
    evidence: Object.freeze([
      evidence(
        'doc',
        STATUS_BOUNDARY_DOC,
        '正式状态分层与 Workflow / Fact 责任边界。'
      ),
      evidence('doc', STATUS_INDEX_DOC, 'canonical 状态树与精确合同索引。'),
    ]),
  })
}

export function buildDevFlowStateCatalog({
  customerPackages = CUSTOMER_PACKAGE_REGISTRY,
} = {}) {
  const scopes = Object.freeze(SCOPE_DEFINITIONS.map(normalizeScope))
  const scopeKeys = new Set(scopes.map((item) => item.key))
  const flows = Object.freeze(FLOW_DEFINITIONS.map(normalizeFlow))
  if (new Set(flows.map((item) => item.key)).size !== flows.length) {
    throw new Error('flow catalog has duplicate machine keys')
  }
  if (flows.some((item) => !scopeKeys.has(item.scopeKey))) {
    throw new Error('flow catalog references an unknown scope')
  }
  const flowByKey = new Map(flows.map((item) => [item.key, item]))
  const processDefinitionByIdentity = new Map(
    processDefinitions.map((definition) => [
      [
        definition.processKey,
        definition.processVersion,
        definition.variantKey,
        definition.businessRefType,
      ].join('/'),
      definition,
    ])
  )
  const overlays = Object.freeze(
    (Array.isArray(customerPackages) ? customerPackages : []).map(
      (registration) =>
        buildCustomerOverlay(
          registration,
          flowByKey,
          processDefinitionByIdentity
        )
    )
  )

  return Object.freeze({
    version: DEV_FLOW_STATE_CATALOG_VERSION,
    route: DEV_FLOW_STATE_ROUTE,
    readOnly: true,
    runtimeAuthority: 'read_only_observation',
    allowsActionExecution: false,
    allowsGenericStatusWrite: false,
    unknownStatePolicy: 'fail_closed',
    writeApis: Object.freeze([]),
    scopes,
    flowLayers,
    processDefinitions,
    overlays,
    flows,
  })
}

export const DEV_FLOW_STATE_CATALOG = buildDevFlowStateCatalog()

export function getDevFlowStateMachine(key, catalog = DEV_FLOW_STATE_CATALOG) {
  if (!exactNonEmptyString(key)) return null
  return catalog?.flows?.find((item) => item.key === key) || null
}

export function getDevFlowState(
  machineKey,
  stateKey,
  catalog = DEV_FLOW_STATE_CATALOG
) {
  if (!exactNonEmptyString(stateKey)) return null
  const machine = getDevFlowStateMachine(machineKey, catalog)
  if (!machine) return null
  return machine.states.find((item) => item.key === stateKey) || null
}

export function getDevFlowStateTransitions(
  machineKey,
  stateKey = '',
  catalog = DEV_FLOW_STATE_CATALOG
) {
  const machine = getDevFlowStateMachine(machineKey, catalog)
  if (!machine) return []
  if (stateKey === '') return [...machine.transitions]
  if (!getDevFlowState(machineKey, stateKey, catalog)) return []
  return machine.transitions.filter((item) => item.from === stateKey)
}

export function canDevFlowStateTransition(
  machineKey,
  from,
  to,
  catalog = DEV_FLOW_STATE_CATALOG
) {
  if (
    !getDevFlowState(machineKey, from, catalog) ||
    !getDevFlowState(machineKey, to, catalog)
  ) {
    return false
  }
  return getDevFlowStateTransitions(machineKey, from, catalog).some(
    (item) => item.to === to
  )
}

function includesSearchValue(value, query) {
  return String(value || '')
    .toLocaleLowerCase()
    .includes(query)
}

function flowSearchText(flow) {
  return [
    flow.key,
    flow.label,
    flow.summary,
    flow.scopeKey,
    flow.kind,
    flow.factBoundary,
    flow.guard,
    ...flow.sourceRefs,
    ...flow.states.flatMap((item) => [item.key, item.label, item.summary]),
    ...flow.transitions.flatMap((item) => [
      item.key,
      item.guard,
      item.action,
      ...item.permission,
    ]),
  ].join('\n')
}

function previewSearchText(item) {
  const definition = item.definition || {}
  return [
    item.key,
    item.label,
    item.kind,
    item.customerKey,
    item.guardrail,
    item.comparison?.status,
    item.canonicalMachineKey,
    ...(Array.isArray(definition.modules) ? definition.modules : []),
    ...(Array.isArray(definition.states) ? definition.states : []),
    ...(Array.isArray(definition.transitions)
      ? definition.transitions.flat()
      : []),
    ...(Array.isArray(definition.rules)
      ? definition.rules.flatMap((rule) => Object.values(rule || {}))
      : []),
  ].join('\n')
}

function filterPreviewEntries(items, filters, query) {
  const driftStatuses = new Set(filters.driftStatuses || [])
  return items.filter((item) => {
    if (driftStatuses.size > 0 && !driftStatuses.has(item.comparison?.status)) {
      return false
    }
    return !query || includesSearchValue(previewSearchText(item), query)
  })
}

export function filterDevFlowStateCatalog(
  filters = {},
  catalog = DEV_FLOW_STATE_CATALOG
) {
  const scopeKeys = new Set(filters.scopeKeys || [])
  const machineKeys = new Set(filters.machineKeys || [])
  const kinds = new Set(filters.kinds || [])
  const customerKeys = new Set(filters.customerKeys || [])
  const query = String(filters.query || '')
    .trim()
    .toLocaleLowerCase()
  const includeCanonical = filters.includeCanonical !== false
  const includeOverlays = filters.includeOverlays !== false

  const flows = includeCanonical
    ? catalog.flows.filter((flow) => {
        if (scopeKeys.size > 0 && !scopeKeys.has(flow.scopeKey)) return false
        if (machineKeys.size > 0 && !machineKeys.has(flow.key)) return false
        if (kinds.size > 0 && !kinds.has(flow.kind)) return false
        return !query || includesSearchValue(flowSearchText(flow), query)
      })
    : []

  const overlays = includeOverlays
    ? catalog.overlays
        .filter(
          (overlay) =>
            customerKeys.size === 0 || customerKeys.has(overlay.customerKey)
        )
        .map((overlay) =>
          Object.freeze({
            ...overlay,
            businessFlows: Object.freeze(
              filterPreviewEntries(overlay.businessFlows, filters, query)
            ),
            stateMachines: Object.freeze(
              filterPreviewEntries(overlay.stateMachines, filters, query)
            ),
            processPolicies: Object.freeze(
              filterPreviewEntries(overlay.processPolicies, filters, query)
            ),
          })
        )
        .filter(
          (overlay) =>
            !query ||
            overlay.businessFlows.length > 0 ||
            overlay.stateMachines.length > 0 ||
            overlay.processPolicies.length > 0 ||
            includesSearchValue(
              `${overlay.customerKey}\n${overlay.label}`,
              query
            )
        )
    : []

  return Object.freeze({
    ...catalog,
    scopes: Object.freeze(
      catalog.scopes.filter(
        (scope) => scopeKeys.size === 0 || scopeKeys.has(scope.key)
      )
    ),
    flows: Object.freeze(flows),
    overlays: Object.freeze(overlays),
  })
}

export function searchDevFlowStateCatalog(
  query = '',
  catalog = DEV_FLOW_STATE_CATALOG
) {
  return filterDevFlowStateCatalog({ query }, catalog)
}

function escapeMermaidLabel(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
}

export function buildDevFlowStateMermaid(
  machineKey,
  catalog = DEV_FLOW_STATE_CATALOG
) {
  const machine = getDevFlowStateMachine(machineKey, catalog)
  if (!machine) return ''
  const idByStateKey = new Map(
    machine.states.map((item, index) => [item.key, `S${index}`])
  )
  const lines = [
    'stateDiagram-v2',
    '  direction LR',
    ...machine.states.map(
      (item) =>
        `  state "${escapeMermaidLabel(
          `${item.label} (${item.key})`
        )}" as ${idByStateKey.get(item.key)}`
    ),
    ...machine.initialStates.map((key) => `  [*] --> ${idByStateKey.get(key)}`),
    ...machine.transitions.map((item) => {
      const label = escapeMermaidLabel(item.action)
      return `  ${idByStateKey.get(item.from)} --> ${idByStateKey.get(
        item.to
      )}: ${label}`
    }),
    ...machine.terminalStates.map(
      (key) => `  ${idByStateKey.get(key)} --> [*]`
    ),
  ]
  return lines.join('\n')
}
