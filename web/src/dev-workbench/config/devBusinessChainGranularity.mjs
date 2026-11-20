import {
  describeDevBusinessChainStep,
  describeDevBusinessChainResponsibility,
} from './devBusinessChainProjection.mjs'

// Reading units refer to existing commands and transitions. They do not introduce executable workflow.
const transition = (machineKey, transitionKey) => ({
  machineKey,
  transitionKey,
})
const state = (machineKey, stateKey) => ({ machineKey, stateKey })
const production = 'source.production_order'
const outsourcing = 'source.outsourcing_order'
const outsourcingFact = 'fact.outsourcing'
const quality = 'fact.quality_inspection'
const wip = 'fact.production_wip_batch'
const payment = 'fact.finance_payment'
const part = (key, label, roles, options = {}) => ({
  key,
  label,
  roles,
  ...options,
})

const SPLITS = {
  'effective_bom:creates_source:production_order': [
    part('create', '创建生产订单草稿', ['pmc'], {
      results: [state(production, 'DRAFT')],
      command: 'ProductionOrderUsecase.CreateDraft',
      condition:
        '核对来源销售明细、产品和 BOM 引用及计划数量；登记后仍是草稿，尚未发布生产。',
    }),
    part('release', '发布生产订单', ['pmc'], {
      transitions: [transition(production, 'DRAFT->RELEASED')],
      command: 'ProductionOrderUsecase.Release',
    }),
  ],
  'wip_batch:posts_fact:production_completion': [
    part('create', '登记成品入库草稿', ['warehouse'], {
      results: [state('fact.production', 'DRAFT')],
      command: 'OperationalFactUsecase.CreateProductionCompletionFromOrder',
      condition:
        '来源生产订单与明细有效；关联在制批次按正常生产完成条件核对，登记草稿不增加库存。',
    }),
    part('post', '过账成品入库', ['warehouse'], {
      transitions: [transition('fact.production', 'DRAFT->POSTED')],
      command: 'OperationalFactUsecase.PostProductionFact',
    }),
  ],
  'outsourcing_order:posts_fact:outsourcing_issue': [
    part('submit', '提交委外订单', ['purchase'], {
      transitions: [transition(outsourcing, 'draft->submitted')],
      command: 'OutsourcingOrderUsecase.SubmitOutsourcingOrderWithAction',
    }),
    part('confirm', '确认委外订单', ['purchase'], {
      transitions: [transition(outsourcing, 'submitted->confirmed')],
      command: 'OutsourcingOrderUsecase.ConfirmOutsourcingOrderWithAction',
    }),
    part('create', '登记委外发料草稿', ['warehouse'], {
      preconditions: [state(outsourcing, 'confirmed')],
      results: [state(outsourcingFact, 'DRAFT')],
      command: 'OperationalFactUsecase.CreateOutsourcingMaterialIssueFromOrder',
    }),
    part('post', '过账委外发料', ['warehouse'], {
      transitions: [transition(outsourcingFact, 'DRAFT->POSTED')],
      command: 'OperationalFactUsecase.PostOutsourcingFact',
    }),
  ],
  'outsourcing_issue:returns:outsourcing_return': [
    part('create', '登记委外回货草稿', ['warehouse'], {
      preconditions: [state(outsourcing, 'confirmed')],
      results: [state(outsourcingFact, 'DRAFT')],
      command: 'OperationalFactUsecase.CreateOutsourcingReturnReceiptFromOrder',
    }),
    part('post', '过账委外回货', ['warehouse'], {
      transitions: [transition(outsourcingFact, 'DRAFT->POSTED')],
      command: 'OperationalFactUsecase.PostOutsourcingFact',
    }),
  ],
  'outsourcing_quality:posts_fact:outsourcing_lot': [
    part('submit', '提交委外回货检验', ['quality'], {
      transitions: [
        transition(quality, 'DRAFT->SUBMITTED'),
        transition('fact.inventory_lot', 'ACTIVE->HOLD'),
      ],
      command: 'submit_quality_inspection',
      condition: '回货已过账；提交检验时冻结关联批次，不重复增加库存。',
    }),
    part('pass', '判定委外回货合格', ['quality'], {
      transitions: [
        transition(quality, 'SUBMITTED->PASSED'),
        transition('fact.inventory_lot', 'HOLD->ACTIVE'),
      ],
      command: 'pass_quality_inspection',
      condition: '正式判定通过后，在同一次质检处理中恢复批次可用。',
    }),
  ],
  'outsourcing_order:posts_fact:outsourcing_stage': [
    part('receive', '接收委外工序回货', ['warehouse'], {
      transitions: [
        transition(wip, 'OUTSOURCED->WAITING_QUALITY'),
        transition(wip, 'OUTSOURCED->ACCEPTED'),
      ],
      command: 'ProductionOrderUsecase.ReceiveProductionWIPOutsourcingReturn',
      condition:
        '已送出的委外批次回货；冻结路线要求质量关口时进入待检，否则直接接收。这是两个互斥出口。',
      optionalNext: true,
    }),
    part('quality', '判定委外工序质量', ['quality'], {
      transitions: [transition(wip, 'WAITING_QUALITY->ACCEPTED')],
      command: 'updateProductionWIPBatchQualityStatus',
      condition:
        '仅冻结路线要求质量关口时进入；全部适用关口通过后由质检事务回写已接收，没有额外手工接收。',
    }),
  ],
  'packaging_confirmation:posts_fact:packaging_execution': [
    part('start', '开始查货包装工序', ['warehouse'], {
      transitions: [transition(wip, 'PLANNED->IN_PROGRESS')],
      command: 'ProductionOrderUsecase.StartProductionWIPOperation',
      condition: '包装用料已确认，当前冻结路线的工序前置条件满足。',
    }),
    part('complete', '完成查货包装工序', ['warehouse'], {
      transitions: [
        transition(wip, 'IN_PROGRESS->WAITING_QUALITY'),
        transition(wip, 'IN_PROGRESS->ACCEPTED'),
      ],
      command: 'ProductionOrderUsecase.CompleteProductionWIPOperation',
      condition:
        '完成正在执行的包装工序；冻结路线要求质量关口时进入待检，否则直接接收。这是两个互斥出口。',
      optionalNext: true,
    }),
    part('quality', '判定包装工序质量', ['quality'], {
      transitions: [transition(wip, 'WAITING_QUALITY->ACCEPTED')],
      command: 'updateProductionWIPBatchQualityStatus',
      condition: '仅冻结路线要求质量关口时进入；判定结果随质检事务回写。',
    }),
  ],
}
for (const [key, label, condition] of [
  [
    'payment_order:starts_process:finance_payment_process',
    '登记订单首款',
    '来源订单、往来方、币种和首款金额通过领域校验；创建后仍是草稿。',
  ],
  [
    'finance_payment:starts_process:finance_payment_process',
    '登记余额退款',
    '原款已过账，退款方向、往来方和币种匹配，金额不超过可退余额。',
  ],
  [
    'open_finance_fact:starts_process:finance_payment_process',
    '登记结算收付款',
    '选择实际往来方、方向和币种；待核销应收应付须已过账。',
  ],
]) {
  SPLITS[key] = [
    part('create', label, ['finance'], {
      results: [state(payment, 'DRAFT')],
      command: 'OperationalFactUsecase.CreateFinancePayment',
      condition,
    }),
    part('submit', '提交收付款审批', ['finance'], {
      preconditions: [state(payment, 'DRAFT')],
      command: 'start_finance_payment_approval_process',
      condition:
        '收付款处于草稿，由已登记审批流程创建老板审批任务；提交不表示批准或实际收付。',
      conceptKey: 'submit_finance_payment',
      sourceRefs: [
        'server/internal/service/jsonrpc_customer_config_exception_process.go',
      ],
    }),
  ]
}

const ROLE_DOMAINS = {
  warehouse: 'inventory',
  engineering_data: 'engineering',
  pmc: 'production',
}
const unique = (items) => [...new Set(items)]

export function appendGranularBusinessSteps(catalog, nodes, relations) {
  for (const [key, parts] of Object.entries(SPLITS)) {
    const parent = nodes.find((node) => node.id === `step:${key}`)
    if (!parent) throw new Error(`Unregistered granular business step: ${key}`)
    const original = parent.steps[0]
    const resolve = ({ machineKey, stateKey }) => {
      const flow = catalog.flows.find((item) => item.key === machineKey)
      const item = flow?.states.find((value) => value.key === stateKey)
      if (!item) {
        throw new Error(`Unknown exploration state: ${machineKey}/${stateKey}`)
      }
      return { machineKey, stateKey, label: item.label }
    }
    const children = parts.map((item) => {
      const refs = (item.transitions || []).map((ref) => {
        const flow = catalog.flows.find((value) => value.key === ref.machineKey)
        const rule = flow?.transitions.find(
          (value) => value.key === ref.transitionKey
        )
        if (!rule) {
          throw new Error(
            `Unknown exploration transition: ${ref.machineKey}/${ref.transitionKey}`
          )
        }
        return {
          ...ref,
          from: rule.from,
          to: rule.to,
          actionKey: rule.action,
          guard: rule.guard,
        }
      })
      const preconditions = [
        ...(item.preconditions || []),
        ...refs.map((ref) => state(ref.machineKey, ref.from)),
      ].map(resolve)
      const results = [
        ...(item.results || []),
        ...refs.map((ref) => state(ref.machineKey, ref.to)),
      ].map(resolve)
      const sourceRefs = unique([
        ...original.sourceRefs,
        ...(item.sourceRefs || []),
        ...[...preconditions, ...results].flatMap(
          (ref) =>
            catalog.flows.find((flow) => flow.key === ref.machineKey).sourceRefs
        ),
      ])
      const step = {
        ...original,
        sourceRefs,
        key: `${key}:${item.key}`,
        label: item.label,
        condition: item.condition || original.condition,
        responsibility: { mode: 'human', ownerPoolKeys: item.roles },
        preconditionStateRefs: preconditions,
        resultStateRefs: results,
        stateTransitionRefs: refs,
        processNodeRefs: [],
        sourceActionKeys: [item.command],
      }
      const atomicEvidence = {
        ...describeDevBusinessChainStep(catalog, step),
        step,
        chainLabel: parent.chainLabel,
        guards: item.optionalNext
          ? []
          : unique(refs.map((ref) => ref.guard).filter(Boolean)),
        responsibility: describeDevBusinessChainResponsibility(
          step.responsibility
        ),
      }
      if (item.optionalNext) {
        atomicEvidence.results = atomicEvidence.results.map(
          (text, index) => `${refs[index].guard} ${text}`
        )
      }
      const child = {
        ...parent,
        id: `action:${key}:${item.key}`,
        label: item.label,
        type: 'business_action',
        domain: ROLE_DOMAINS[item.roles[0]] || item.roles[0],
        roles: item.roles,
        source: step,
        steps: [step],
        input: atomicEvidence.preconditions.join('；') || parent.input,
        output: atomicEvidence.results.join('；') || item.label,
        machineKeys: unique(
          [...preconditions, ...results].map((ref) => ref.machineKey)
        ),
        statePreviewStart: preconditions[0]?.stateKey,
        atomicEvidence,
        conceptKey: item.conceptKey,
        parentId: parent.id,
      }
      nodes.push(child)
      return child
    })
    parent.splitInto = children.map((node) => node.id)
    parent.splitMode = 'sequence'
    const path = [
      `node:${original.fromNodeKey}`,
      ...parent.splitInto,
      `node:${original.toNodeKey}`,
    ]
    path.slice(1).forEach((to, i) =>
      relations.push({
        from: path[i],
        to,
        kind: 'known',
        evidence: children[Math.min(i, children.length - 1)].atomicEvidence,
      })
    )
    parts.forEach((item, index) => {
      if (!item.optionalNext) return
      const child = children[index]
      relations.push({
        from: child.id,
        to: path.at(-1),
        kind: 'known',
        evidence: {
          ...child.atomicEvidence,
          condition:
            '冻结路线不要求质量关口时，当前动作直接完成接收；要求质量关口时须先经过品质判定。',
        },
      })
    })
  }
}

// Receivables and invoices use independent creation commands. Their posting paths must not cross.
export function appendFinanceDocumentBranches(catalog, nodes, relations) {
  const find = (id) => nodes.find((node) => node.id === id)
  const draft = find('node:receivable_draft')
  const posted = find('node:receivable')
  const create = find('step:shipped:creates_fact_draft:receivable_draft')
  const post = find('step:receivable_draft:posts_fact:receivable')
  for (const parent of [draft, posted, create, post]) {
    parent.splitInto = []
    parent.splitMode = 'branches'
  }
  for (const [key, label, command] of [
    [
      'receivable',
      '应收',
      'OperationalFactUsecase.CreateReceivableFromShipment',
    ],
    ['invoice', '发票', 'OperationalFactUsecase.CreateInvoiceFromShipment'],
  ]) {
    const objects = [draft, posted].map((parent, i) => {
      const node = {
        ...parent,
        id: `document:${key}:${i ? 'posted' : 'draft'}`,
        label: `${i ? '已过账' : ''}${label}${i ? '' : '草稿'}`,
        splitInto: undefined,
        type: i ? 'record' : 'document',
      }
      parent.splitInto.push(node.id)
      nodes.push(node)
      return node
    })
    const actions = [create, post].map((parent, i) => {
      const labelText = `${i ? '过账' : '生成'}${label}${i ? '' : '草稿'}`
      const original = parent.steps[0]
      const step = {
        ...original,
        key: `${original.key}:${key}`,
        label: labelText,
        sourceActionKeys: [i ? 'OperationalFactUsecase.PostFinanceFact' : command],
        condition: `${original.condition || '来源出货必须已真实发生。'} 当前路径只办理${label}。`,
      }
      const node = {
        ...parent,
        id: `action:${original.key}:${key}`,
        label: labelText,
        splitInto: undefined,
        source: step,
        steps: [step],
        input: i ? objects[0].label : parent.input,
        output: objects[i].label,
        atomicEvidence: {
          ...describeDevBusinessChainStep(catalog, step),
          step,
          guards: [],
          chainLabel: parent.chainLabel,
          responsibility: describeDevBusinessChainResponsibility(
            step.responsibility
          ),
        },
      }
      parent.splitInto.push(node.id)
      nodes.push(node)
      return node
    })
    const path = [
      'node:shipped',
      actions[0].id,
      objects[0].id,
      actions[1].id,
      objects[1].id,
    ]
    path.slice(1).forEach((to, i) =>
      relations.push({
        from: path[i],
        to,
        kind: 'known',
        evidence: actions[i < 2 ? 0 : 1].atomicEvidence,
      })
    )
  }
}

export function appendPaymentAllocationBranches(catalog, nodes, relations) {
  const parent = nodes.find(
    (node) => node.id === 'step:finance_payment:posts_fact:finance_allocation'
  )
  parent.splitInto = []
  parent.splitMode = 'branches'
  for (const [key, label, type, condition] of [
    [
      'settlement',
      '结算款核销结果',
      'result',
      '结算款执行过账时按核销明细同步形成记录，不需要重复执行一次核销。',
    ],
    [
      'advance',
      '抵扣订单首款',
      'business_action',
      '已过账首款仍有可用余额；应收应付已过账，同一订单、方向、往来方与币种匹配。',
    ],
  ]) {
    const original = parent.steps[0]
    const step = {
      ...original,
      key: `${original.key}:${key}`,
      label,
      condition,
      responsibility: {
        ...original.responsibility,
        mode: type === 'result' ? 'derived' : 'human',
      },
    }
    const node = {
      ...parent,
      id: `action:${original.key}:${key}`,
      label,
      type,
      source: step,
      steps: [step],
      splitInto: undefined,
      atomicEvidence: {
        ...describeDevBusinessChainStep(catalog, step),
        step,
        guards: [],
        chainLabel: parent.chainLabel,
        responsibility: describeDevBusinessChainResponsibility(
          step.responsibility
        ),
      },
    }
    nodes.push(node)
    parent.splitInto.push(node.id)
    relations.push(
      {
        from: 'node:finance_payment',
        to: node.id,
        kind: 'known',
        evidence: node.atomicEvidence,
      },
      {
        from: node.id,
        to: 'node:finance_allocation',
        kind: 'known',
        evidence: node.atomicEvidence,
      }
    )
  }
}
