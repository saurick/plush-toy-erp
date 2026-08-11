export const DEV_BUSINESS_CHAIN_SCENARIO_KINDS = Object.freeze([
  'happy_path',
  'interruption_recovery',
  'unauthorized',
  'wrong_state',
  'correction',
  'idempotency',
])

export const DEV_BUSINESS_CHAIN_EVIDENCE_MODES = Object.freeze([
  'dataset',
  'contract_test',
  'browser',
])

export const DEV_BUSINESS_CHAIN_DATA_STAGE_KEYS = Object.freeze([
  'role',
  'source',
  'task',
  'facts',
  'readiness',
])

const transition = (machineKey, transitionKey) =>
  Object.freeze({ machineKey, transitionKey })

const state = (machineKey, stateKey, phase) =>
  Object.freeze({ machineKey, stateKey, phase })

const processNode = (processDefinitionKey, nodeKey) =>
  Object.freeze({ processDefinitionKey, nodeKey })

const step = (options = {}) =>
  Object.freeze({
    responsibilityMode: options.responsibilityMode || 'system',
    ownerPoolKeys: Object.freeze(options.ownerPoolKeys || []),
    capabilityKeys: Object.freeze(options.capabilityKeys || []),
    stateTransitionRefs: Object.freeze(options.stateTransitionRefs || []),
    stateRefs: Object.freeze(options.stateRefs || []),
    processNodeRefs: Object.freeze(options.processNodeRefs || []),
  })

const profile = (options) =>
  Object.freeze({
    happyStepKeys: Object.freeze(options.happyStepKeys),
    interruptionStepKeys: Object.freeze(options.interruptionStepKeys),
    interruptionKinds: Object.freeze(options.interruptionKinds),
    correctionStepKeys: Object.freeze(options.correctionStepKeys),
    protectedStepKey: options.protectedStepKey,
    wrongStateStepKey: options.wrongStateStepKey,
    idempotentStepKey: options.idempotentStepKey,
    dataStageKeys: Object.freeze(options.dataStageKeys),
    browserScenarioKinds: Object.freeze(options.browserScenarioKinds || []),
    interruptionTransitionRefs: Object.freeze(
      options.interruptionTransitionRefs || []
    ),
    correctionTransitionRefs: Object.freeze(
      options.correctionTransitionRefs || []
    ),
    sourceRefs: Object.freeze(options.sourceRefs),
  })

const SALES_APPROVAL_PMC = 'sales_order_acceptance/approval_pmc'
const SALES_APPROVAL_ENGINEERING =
  'sales_order_acceptance/approval_engineering_pmc'

const salesProcessNodes = (...nodeKeys) =>
  [SALES_APPROVAL_PMC, SALES_APPROVAL_ENGINEERING].flatMap((definitionKey) =>
    nodeKeys.map((nodeKey) => processNode(definitionKey, nodeKey))
  )

const salesEngineeringNode = (nodeKey) =>
  processNode(SALES_APPROVAL_ENGINEERING, nodeKey)

const PURCHASE_APPROVAL = 'material_supply/purchase_order_approval'
const SHIPMENT_APPROVAL = 'finished_goods_delivery/shipment_finance_approval'
const FINANCE_PAYMENT_APPROVAL = 'finance_payment_approval/approval_post'
const INVENTORY_ADJUSTMENT_APPROVAL =
  'inventory_adjustment_approval/manual_adjustment_approval'
const PRODUCTION_EXCEPTION_APPROVAL =
  'production_exception_approval/exception_decision_approval'

const SOURCE_DATA_REF = 'scripts/qa/manual-acceptance-source-data.mjs'
const FACT_DATA_REF = 'scripts/qa/manual-acceptance-fact-data.mjs'
const EXCEPTION_BROWSER_REF = 'scripts/qa/exception-flow-real-write-browser.mjs'

export const DEV_BUSINESS_CHAIN_STEP_CONTRACT_DEFINITIONS = Object.freeze({
  sales_to_production: Object.freeze({
    steps: Object.freeze({
      'sales_order:starts_process:sales_acceptance': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('source.sales_order', 'draft->submitted'),
        ],
        processNodeRefs: salesProcessNodes('submit_sales_order'),
      }),
      'sales_acceptance:creates_task:sales_tasks': step({
        responsibilityMode: 'human',
        stateRefs: [state('workflow.task', 'ready', 'result')],
        processNodeRefs: [
          ...salesProcessNodes('order_approval', 'order_review'),
          salesEngineeringNode('engineering_data'),
        ],
      }),
      'sales_tasks:calls_domain_command:sales_acceptance': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('workflow.task', 'ready->done'),
          transition('workflow.task', 'ready->rejected'),
          transition('source.sales_order', 'submitted->active'),
        ],
        processNodeRefs: [
          ...salesProcessNodes('order_approval', 'activate_sales_order'),
          ...salesProcessNodes('order_review'),
          salesEngineeringNode('engineering_data'),
        ],
      }),
      'sales_acceptance:requires:effective_bom': step({
        responsibilityMode: 'system',
        stateRefs: [state('master.bom', 'ACTIVE', 'precondition')],
      }),
      'sales_acceptance:posts_fact:stock_reservation': step({
        responsibilityMode: 'system',
        stateRefs: [
          state('source.sales_order', 'active', 'precondition'),
          state('fact.stock_reservation', 'ACTIVE', 'result'),
        ],
      }),
      'effective_bom:creates_source:production_order': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('source.production_order', 'DRAFT->RELEASED'),
        ],
        stateRefs: [state('master.bom', 'ACTIVE', 'precondition')],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'sales_order:starts_process:sales_acceptance',
        'sales_acceptance:creates_task:sales_tasks',
        'sales_tasks:calls_domain_command:sales_acceptance',
        'sales_acceptance:requires:effective_bom',
        'sales_acceptance:posts_fact:stock_reservation',
        'effective_bom:creates_source:production_order',
      ],
      interruptionStepKeys: [
        'sales_tasks:calls_domain_command:sales_acceptance',
      ],
      interruptionKinds: ['blocked', 'rejected', 'resume'],
      correctionStepKeys: ['sales_order:starts_process:sales_acceptance'],
      protectedStepKey: 'sales_order:starts_process:sales_acceptance',
      wrongStateStepKey: 'sales_tasks:calls_domain_command:sales_acceptance',
      idempotentStepKey: 'sales_order:starts_process:sales_acceptance',
      dataStageKeys: ['source', 'task', 'facts', 'readiness'],
      interruptionTransitionRefs: [
        transition('workflow.task', 'ready->blocked'),
        transition('workflow.task', 'blocked->ready'),
        transition('workflow.task', 'ready->rejected'),
      ],
      correctionTransitionRefs: [
        transition('source.sales_order', 'draft->canceled'),
        transition('source.sales_order', 'submitted->canceled'),
        transition('source.sales_order', 'active->canceled'),
      ],
      sourceRefs: [
        SOURCE_DATA_REF,
        FACT_DATA_REF,
        'server/internal/biz/sales_order_test.go',
        'server/internal/biz/process_runtime_workflow_decision_test.go',
      ],
    }),
  }),

  purchase_to_inventory: Object.freeze({
    steps: Object.freeze({
      'purchase_order:starts_process:purchase_approval': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('source.purchase_order', 'draft->submitted'),
        ],
        processNodeRefs: [
          processNode(PURCHASE_APPROVAL, 'submit_purchase_order'),
        ],
      }),
      'purchase_approval:creates_task:purchase_task': step({
        responsibilityMode: 'human',
        stateRefs: [state('workflow.task', 'ready', 'result')],
        processNodeRefs: [
          processNode(PURCHASE_APPROVAL, 'purchase_order_approval'),
        ],
      }),
      'purchase_task:calls_domain_command:purchase_approval': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('workflow.task', 'ready->done'),
          transition('workflow.task', 'ready->rejected'),
          transition('source.purchase_order', 'submitted->approved'),
        ],
        processNodeRefs: [
          processNode(PURCHASE_APPROVAL, 'purchase_order_approval'),
          processNode(PURCHASE_APPROVAL, 'approve_purchase_order'),
        ],
      }),
      'purchase_approval:creates_source:purchase_receipt': step({
        responsibilityMode: 'human',
        capabilityKeys: ['purchase.receipt.create'],
        stateRefs: [
          state('source.purchase_order', 'approved', 'precondition'),
          state('fact.purchase_receipt', 'DRAFT', 'result'),
        ],
      }),
      'purchase_receipt:creates_source:purchase_quality': step({
        responsibilityMode: 'human',
        capabilityKeys: ['quality.inspection.create'],
        stateRefs: [
          state('fact.purchase_receipt', 'DRAFT', 'precondition'),
          state('fact.quality_inspection', 'DRAFT', 'result'),
        ],
      }),
      'purchase_quality:posts_fact:purchase_lot': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.quality_inspection', 'SUBMITTED->PASSED'),
          transition('fact.purchase_receipt', 'DRAFT->POSTED'),
        ],
        stateRefs: [state('fact.inventory_lot', 'ACTIVE', 'result')],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'purchase_order:starts_process:purchase_approval',
        'purchase_approval:creates_task:purchase_task',
        'purchase_task:calls_domain_command:purchase_approval',
        'purchase_approval:creates_source:purchase_receipt',
        'purchase_receipt:creates_source:purchase_quality',
        'purchase_quality:posts_fact:purchase_lot',
      ],
      interruptionStepKeys: [
        'purchase_task:calls_domain_command:purchase_approval',
        'purchase_quality:posts_fact:purchase_lot',
      ],
      interruptionKinds: ['blocked', 'rejected', 'resume'],
      correctionStepKeys: ['purchase_receipt:creates_source:purchase_quality'],
      protectedStepKey: 'purchase_quality:posts_fact:purchase_lot',
      wrongStateStepKey: 'purchase_quality:posts_fact:purchase_lot',
      idempotentStepKey: 'purchase_quality:posts_fact:purchase_lot',
      dataStageKeys: ['source', 'facts', 'readiness'],
      interruptionTransitionRefs: [
        transition('workflow.task', 'ready->blocked'),
        transition('workflow.task', 'blocked->ready'),
        transition('source.purchase_order', 'submitted->canceled'),
        transition('fact.quality_inspection', 'SUBMITTED->REJECTED'),
      ],
      correctionTransitionRefs: [
        transition('fact.purchase_receipt', 'DRAFT->CANCELLED'),
        transition('fact.purchase_receipt', 'POSTED->CANCELLED'),
      ],
      sourceRefs: [
        SOURCE_DATA_REF,
        FACT_DATA_REF,
        'server/internal/biz/purchase_order_test.go',
        'server/internal/biz/workflow_purchase_iqc_test.go',
      ],
    }),
  }),

  production_to_inventory: Object.freeze({
    steps: Object.freeze({
      'released_production_order:posts_fact:wip_batch': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('source.production_order', 'DRAFT->RELEASED'),
        ],
        stateRefs: [state('fact.production_wip_batch', 'PLANNED', 'result')],
      }),
      'wip_batch:requires:packaging_confirmation': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition(
            'fact.production_packaging_confirmation',
            'PENDING->CONFIRMED'
          ),
        ],
        stateRefs: [
          state('fact.production_wip_batch', 'IN_PROGRESS', 'precondition'),
        ],
      }),
      'packaging_confirmation:posts_fact:production_completion': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [transition('fact.production', 'DRAFT->POSTED')],
        stateRefs: [
          state(
            'fact.production_packaging_confirmation',
            'CONFIRMED',
            'precondition'
          ),
        ],
      }),
      'production_completion:posts_fact:finished_goods_lot': step({
        responsibilityMode: 'system',
        stateRefs: [
          state('fact.production', 'POSTED', 'precondition'),
          state('fact.inventory_lot', 'ACTIVE', 'result'),
        ],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'released_production_order:posts_fact:wip_batch',
        'wip_batch:requires:packaging_confirmation',
        'packaging_confirmation:posts_fact:production_completion',
        'production_completion:posts_fact:finished_goods_lot',
      ],
      interruptionStepKeys: ['wip_batch:requires:packaging_confirmation'],
      interruptionKinds: ['blocked', 'rejected', 'rework', 'recovery'],
      correctionStepKeys: [
        'packaging_confirmation:posts_fact:production_completion',
      ],
      protectedStepKey:
        'packaging_confirmation:posts_fact:production_completion',
      wrongStateStepKey:
        'packaging_confirmation:posts_fact:production_completion',
      idempotentStepKey:
        'packaging_confirmation:posts_fact:production_completion',
      dataStageKeys: ['source', 'facts', 'readiness'],
      interruptionTransitionRefs: [
        transition('fact.production_wip_batch', 'PLANNED->CANCELLED'),
        transition('fact.production_wip_batch', 'WAITING_QUALITY->REJECTED'),
      ],
      correctionTransitionRefs: [
        transition('fact.production', 'POSTED->CANCELLED'),
      ],
      sourceRefs: [
        SOURCE_DATA_REF,
        FACT_DATA_REF,
        'server/internal/biz/production_wip_test.go',
        'server/internal/biz/operational_fact_production_completion_test.go',
      ],
    }),
  }),

  outsourcing_to_inventory: Object.freeze({
    steps: Object.freeze({
      'outsourcing_order:posts_fact:outsourcing_issue': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('source.outsourcing_order', 'draft->submitted'),
          transition('source.outsourcing_order', 'submitted->confirmed'),
          transition('fact.outsourcing', 'DRAFT->POSTED'),
        ],
      }),
      'outsourcing_issue:returns:outsourcing_return': step({
        responsibilityMode: 'human',
        capabilityKeys: ['outsourcing.return_receipt.create'],
        stateRefs: [
          state('source.outsourcing_order', 'confirmed', 'precondition'),
          state('fact.outsourcing', 'DRAFT', 'result'),
        ],
      }),
      'outsourcing_return:creates_source:outsourcing_quality': step({
        responsibilityMode: 'human',
        capabilityKeys: ['quality.inspection.create'],
        stateRefs: [state('fact.quality_inspection', 'DRAFT', 'result')],
      }),
      'outsourcing_quality:posts_fact:outsourcing_lot': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.quality_inspection', 'SUBMITTED->PASSED'),
          transition('fact.outsourcing', 'DRAFT->POSTED'),
        ],
        stateRefs: [state('fact.inventory_lot', 'ACTIVE', 'result')],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'outsourcing_order:posts_fact:outsourcing_issue',
        'outsourcing_issue:returns:outsourcing_return',
        'outsourcing_return:creates_source:outsourcing_quality',
        'outsourcing_quality:posts_fact:outsourcing_lot',
      ],
      interruptionStepKeys: [
        'outsourcing_return:creates_source:outsourcing_quality',
        'outsourcing_quality:posts_fact:outsourcing_lot',
      ],
      interruptionKinds: ['rejected', 'returned', 'recovery'],
      correctionStepKeys: ['outsourcing_order:posts_fact:outsourcing_issue'],
      protectedStepKey: 'outsourcing_order:posts_fact:outsourcing_issue',
      wrongStateStepKey: 'outsourcing_quality:posts_fact:outsourcing_lot',
      idempotentStepKey: 'outsourcing_order:posts_fact:outsourcing_issue',
      dataStageKeys: ['source', 'facts', 'readiness'],
      interruptionTransitionRefs: [
        transition('fact.quality_inspection', 'SUBMITTED->REJECTED'),
      ],
      correctionTransitionRefs: [
        transition('fact.outsourcing', 'POSTED->CANCELLED'),
      ],
      sourceRefs: [
        SOURCE_DATA_REF,
        FACT_DATA_REF,
        'server/internal/biz/operational_fact_outsourcing_source_test.go',
        'server/internal/biz/workflow_outsource_return_qc_test.go',
      ],
    }),
  }),

  delivery_to_settlement: Object.freeze({
    steps: Object.freeze({
      'shipment_draft:starts_process:shipment_release_process': step({
        responsibilityMode: 'human',
        stateRefs: [state('fact.shipment', 'DRAFT', 'precondition')],
        processNodeRefs: [
          processNode(SHIPMENT_APPROVAL, 'shipment_finance_approval'),
        ],
      }),
      'shipment_release_process:creates_task:shipment_release_task': step({
        responsibilityMode: 'human',
        stateRefs: [state('workflow.task', 'ready', 'result')],
        processNodeRefs: [
          processNode(SHIPMENT_APPROVAL, 'shipment_finance_approval'),
        ],
      }),
      'shipment_release_task:calls_domain_command:shipment_release': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('workflow.task', 'ready->done'),
          transition('workflow.task', 'ready->rejected'),
        ],
        processNodeRefs: [
          processNode(SHIPMENT_APPROVAL, 'shipment_finance_release'),
          processNode(SHIPMENT_APPROVAL, 'shipment_finance_reject'),
        ],
      }),
      'shipment_release:posts_fact:shipped': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [transition('fact.shipment', 'DRAFT->SHIPPED')],
      }),
      'shipped:posts_fact:receivable': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [transition('fact.finance', 'DRAFT->POSTED')],
        stateRefs: [state('fact.shipment', 'SHIPPED', 'precondition')],
      }),
      'receivable:starts_process:payment_process': step({
        responsibilityMode: 'human',
        stateRefs: [
          state('fact.finance', 'POSTED', 'precondition'),
          state('fact.finance_payment', 'DRAFT', 'result'),
        ],
        processNodeRefs: [
          processNode(FINANCE_PAYMENT_APPROVAL, 'finance_payment_approval'),
        ],
      }),
      'payment_process:creates_task:payment_task': step({
        responsibilityMode: 'human',
        stateRefs: [state('workflow.task', 'ready', 'result')],
        processNodeRefs: [
          processNode(FINANCE_PAYMENT_APPROVAL, 'finance_payment_approval'),
          processNode(FINANCE_PAYMENT_APPROVAL, 'finance_payment_execution'),
        ],
      }),
      'payment_task:calls_domain_command:payment': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('workflow.task', 'ready->done'),
          transition('fact.finance_payment', 'APPROVED->POSTED'),
        ],
        processNodeRefs: [
          processNode(FINANCE_PAYMENT_APPROVAL, 'post_finance_payment'),
        ],
      }),
      'payment:posts_fact:allocation': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [transition('fact.finance', 'POSTED->SETTLED')],
        stateRefs: [state('fact.finance_payment', 'POSTED', 'precondition')],
      }),
      'allocation:derives:receivable': step({
        responsibilityMode: 'derived',
        stateTransitionRefs: [transition('fact.finance', 'POSTED->SETTLED')],
      }),
      'credit_note:reverses:receivable': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [transition('fact.finance', 'SETTLED->POSTED')],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'shipment_draft:starts_process:shipment_release_process',
        'shipment_release_process:creates_task:shipment_release_task',
        'shipment_release_task:calls_domain_command:shipment_release',
        'shipment_release:posts_fact:shipped',
        'shipped:posts_fact:receivable',
        'receivable:starts_process:payment_process',
        'payment_process:creates_task:payment_task',
        'payment_task:calls_domain_command:payment',
        'payment:posts_fact:allocation',
        'allocation:derives:receivable',
      ],
      interruptionStepKeys: [
        'shipment_release_task:calls_domain_command:shipment_release',
        'payment_task:calls_domain_command:payment',
      ],
      interruptionKinds: ['blocked', 'rejected', 'resume'],
      correctionStepKeys: ['credit_note:reverses:receivable'],
      protectedStepKey: 'shipment_release:posts_fact:shipped',
      wrongStateStepKey: 'shipment_release:posts_fact:shipped',
      idempotentStepKey: 'shipment_release:posts_fact:shipped',
      dataStageKeys: ['source', 'facts', 'readiness'],
      browserScenarioKinds: ['unauthorized', 'wrong_state', 'idempotency'],
      interruptionTransitionRefs: [
        transition('workflow.task', 'ready->blocked'),
        transition('workflow.task', 'blocked->ready'),
        transition('fact.finance_payment', 'DRAFT->REJECTED'),
      ],
      correctionTransitionRefs: [
        transition('fact.shipment', 'SHIPPED->CANCELLED'),
        transition('fact.finance_payment', 'POSTED->REVERSED'),
        transition('fact.finance', 'SETTLED->POSTED'),
      ],
      sourceRefs: [
        SOURCE_DATA_REF,
        FACT_DATA_REF,
        EXCEPTION_BROWSER_REF,
        'server/internal/biz/workflow_shipment_release_test.go',
        'server/internal/biz/operational_fact_finance_source_test.go',
      ],
    }),
  }),

  finance_payment_and_reversal: Object.freeze({
    steps: Object.freeze({
      'open_finance_fact:starts_process:finance_payment_process': step({
        responsibilityMode: 'human',
        stateRefs: [
          state('fact.finance', 'POSTED', 'precondition'),
          state('fact.finance_payment', 'DRAFT', 'result'),
        ],
        processNodeRefs: [
          processNode(FINANCE_PAYMENT_APPROVAL, 'finance_payment_approval'),
        ],
      }),
      'finance_payment_process:calls_domain_command:finance_payment': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.finance_payment', 'DRAFT->APPROVED'),
          transition('fact.finance_payment', 'APPROVED->POSTED'),
        ],
        processNodeRefs: [
          processNode(FINANCE_PAYMENT_APPROVAL, 'approve_finance_payment'),
          processNode(FINANCE_PAYMENT_APPROVAL, 'post_finance_payment'),
        ],
      }),
      'finance_payment:posts_fact:finance_allocation': step({
        responsibilityMode: 'human',
        stateRefs: [state('fact.finance_payment', 'POSTED', 'precondition')],
        stateTransitionRefs: [transition('fact.finance', 'POSTED->SETTLED')],
      }),
      'finance_allocation:derives:settled_finance_fact': step({
        responsibilityMode: 'derived',
        stateTransitionRefs: [transition('fact.finance', 'POSTED->SETTLED')],
      }),
      'finance_payment:reverses:open_finance_fact': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.finance_payment', 'POSTED->REVERSED'),
          transition('fact.finance', 'SETTLED->POSTED'),
        ],
      }),
      'open_finance_fact:creates_source:finance_credit_note': step({
        responsibilityMode: 'human',
        capabilityKeys: ['finance.credit_note.create'],
        stateRefs: [state('fact.finance', 'POSTED', 'precondition')],
      }),
      'finance_credit_note:posts_fact:settled_finance_fact': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [transition('fact.finance', 'POSTED->SETTLED')],
      }),
      'finance_credit_note:reverses:open_finance_fact': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [transition('fact.finance', 'SETTLED->POSTED')],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'open_finance_fact:starts_process:finance_payment_process',
        'finance_payment_process:calls_domain_command:finance_payment',
        'finance_payment:posts_fact:finance_allocation',
        'finance_allocation:derives:settled_finance_fact',
        'open_finance_fact:creates_source:finance_credit_note',
        'finance_credit_note:posts_fact:settled_finance_fact',
      ],
      interruptionStepKeys: [
        'finance_payment_process:calls_domain_command:finance_payment',
      ],
      interruptionKinds: ['blocked', 'rejected', 'resume'],
      correctionStepKeys: [
        'finance_payment:reverses:open_finance_fact',
        'finance_credit_note:reverses:open_finance_fact',
      ],
      protectedStepKey:
        'finance_payment_process:calls_domain_command:finance_payment',
      wrongStateStepKey:
        'finance_payment_process:calls_domain_command:finance_payment',
      idempotentStepKey:
        'finance_payment_process:calls_domain_command:finance_payment',
      dataStageKeys: ['facts', 'readiness'],
      browserScenarioKinds: ['unauthorized', 'wrong_state', 'idempotency'],
      interruptionTransitionRefs: [
        transition('workflow.task', 'ready->blocked'),
        transition('workflow.task', 'blocked->ready'),
        transition('fact.finance_payment', 'DRAFT->REJECTED'),
      ],
      correctionTransitionRefs: [
        transition('fact.finance_payment', 'POSTED->REVERSED'),
        transition('fact.finance', 'SETTLED->POSTED'),
      ],
      sourceRefs: [
        FACT_DATA_REF,
        EXCEPTION_BROWSER_REF,
        'server/internal/biz/operational_fact_finance_source_test.go',
        'server/internal/biz/workflow_payable_reconciliation_test.go',
      ],
    }),
  }),

  inventory_adjustment: Object.freeze({
    steps: Object.freeze({
      'inventory_operation:starts_process:inventory_adjustment_process': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.inventory_operation', 'DRAFT->SUBMITTED'),
        ],
        processNodeRefs: [
          processNode(
            INVENTORY_ADJUSTMENT_APPROVAL,
            'submit_inventory_adjustment'
          ),
        ],
      }),
      'inventory_adjustment_process:creates_task:inventory_adjustment_task':
        step({
          responsibilityMode: 'human',
          stateRefs: [state('workflow.task', 'ready', 'result')],
          processNodeRefs: [
            processNode(
              INVENTORY_ADJUSTMENT_APPROVAL,
              'inventory_adjustment_approval'
            ),
          ],
        }),
      'inventory_adjustment_task:calls_domain_command:inventory_adjustment_process':
        step({
          responsibilityMode: 'human',
          stateTransitionRefs: [
            transition('workflow.task', 'ready->done'),
            transition('workflow.task', 'ready->rejected'),
            transition('fact.inventory_operation', 'SUBMITTED->APPROVED'),
            transition('fact.inventory_operation', 'SUBMITTED->REJECTED'),
          ],
          processNodeRefs: [
            processNode(
              INVENTORY_ADJUSTMENT_APPROVAL,
              'approve_inventory_adjustment'
            ),
            processNode(
              INVENTORY_ADJUSTMENT_APPROVAL,
              'reject_inventory_adjustment'
            ),
          ],
        }),
      'inventory_adjustment_process:posts_fact:adjusted_inventory_lot': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.inventory_operation', 'APPROVED->POSTED'),
        ],
        stateRefs: [state('fact.inventory_lot', 'ACTIVE', 'result')],
        processNodeRefs: [
          processNode(
            INVENTORY_ADJUSTMENT_APPROVAL,
            'post_inventory_adjustment'
          ),
        ],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'inventory_operation:starts_process:inventory_adjustment_process',
        'inventory_adjustment_process:creates_task:inventory_adjustment_task',
        'inventory_adjustment_task:calls_domain_command:inventory_adjustment_process',
        'inventory_adjustment_process:posts_fact:adjusted_inventory_lot',
      ],
      interruptionStepKeys: [
        'inventory_adjustment_task:calls_domain_command:inventory_adjustment_process',
      ],
      interruptionKinds: ['blocked', 'rejected', 'resume'],
      correctionStepKeys: [
        'inventory_adjustment_process:posts_fact:adjusted_inventory_lot',
      ],
      protectedStepKey:
        'inventory_adjustment_process:posts_fact:adjusted_inventory_lot',
      wrongStateStepKey:
        'inventory_adjustment_process:posts_fact:adjusted_inventory_lot',
      idempotentStepKey:
        'inventory_adjustment_process:posts_fact:adjusted_inventory_lot',
      dataStageKeys: ['facts', 'readiness'],
      browserScenarioKinds: ['unauthorized', 'wrong_state', 'idempotency'],
      interruptionTransitionRefs: [
        transition('workflow.task', 'ready->blocked'),
        transition('workflow.task', 'blocked->ready'),
        transition('fact.inventory_operation', 'SUBMITTED->REJECTED'),
      ],
      correctionTransitionRefs: [
        transition('fact.inventory_operation', 'POSTED->CANCELLED'),
      ],
      sourceRefs: [
        FACT_DATA_REF,
        EXCEPTION_BROWSER_REF,
        'server/internal/biz/inventory_operation_test.go',
        'server/internal/biz/inventory_process_command_test.go',
      ],
    }),
  }),

  production_exception: Object.freeze({
    steps: Object.freeze({
      'production_exception_decision:starts_process:production_exception_process':
        step({
          responsibilityMode: 'human',
          stateRefs: [
            state(
              'source.production_exception_decision',
              'SUBMITTED',
              'result'
            ),
          ],
          processNodeRefs: [
            processNode(
              PRODUCTION_EXCEPTION_APPROVAL,
              'production_exception_decision_approval'
            ),
          ],
        }),
      'production_exception_process:creates_task:production_exception_task':
        step({
          responsibilityMode: 'human',
          stateRefs: [state('workflow.task', 'ready', 'result')],
          processNodeRefs: [
            processNode(
              PRODUCTION_EXCEPTION_APPROVAL,
              'production_exception_decision_approval'
            ),
          ],
        }),
      'production_exception_task:returns:production_exception_rejected': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition(
            'source.production_exception_decision',
            'SUBMITTED->REJECTED'
          ),
          transition(
            'source.production_exception_decision',
            'SUBMITTED->CANCELLED'
          ),
          transition('workflow.task', 'ready->rejected'),
        ],
        processNodeRefs: [
          processNode(
            PRODUCTION_EXCEPTION_APPROVAL,
            'reject_production_exception'
          ),
        ],
      }),
      'production_exception_task:returns:production_exception_over_issue': step(
        {
          responsibilityMode: 'human',
          stateTransitionRefs: [
            transition(
              'source.production_exception_decision',
              'SUBMITTED->APPROVED'
            ),
          ],
          processNodeRefs: [
            processNode(
              PRODUCTION_EXCEPTION_APPROVAL,
              'approve_production_exception'
            ),
          ],
        }
      ),
      'production_exception_task:creates_task:production_exception_execution_task':
        step({
          responsibilityMode: 'human',
          stateTransitionRefs: [
            transition(
              'source.production_exception_decision',
              'SUBMITTED->APPROVED'
            ),
          ],
          stateRefs: [state('workflow.task', 'ready', 'result')],
          processNodeRefs: [
            processNode(
              PRODUCTION_EXCEPTION_APPROVAL,
              'production_exception_execution'
            ),
          ],
        }),
      'production_exception_execution_task:calls_domain_command:production_exception_execution':
        step({
          responsibilityMode: 'human',
          stateTransitionRefs: [
            transition('workflow.task', 'ready->done'),
            transition(
              'source.production_exception_execution',
              'PENDING->APPLIED'
            ),
          ],
          processNodeRefs: [
            processNode(
              PRODUCTION_EXCEPTION_APPROVAL,
              'execute_production_exception'
            ),
          ],
        }),
      'production_exception_execution:reworks:affected_wip': step({
        responsibilityMode: 'human',
        capabilityKeys: ['production.fact.post'],
        stateRefs: [
          state(
            'source.production_exception_execution',
            'APPLIED',
            'precondition'
          ),
        ],
      }),
      'affected_wip:derives:affected_production_fact': step({
        responsibilityMode: 'derived',
        stateTransitionRefs: [transition('fact.production', 'DRAFT->POSTED')],
      }),
      'production_exception_over_issue:derives:affected_production_fact': step({
        responsibilityMode: 'derived',
        stateTransitionRefs: [transition('fact.production', 'DRAFT->POSTED')],
        stateRefs: [
          state(
            'source.production_exception_decision',
            'APPROVED',
            'precondition'
          ),
        ],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'production_exception_decision:starts_process:production_exception_process',
        'production_exception_process:creates_task:production_exception_task',
        'production_exception_task:returns:production_exception_over_issue',
        'production_exception_task:creates_task:production_exception_execution_task',
        'production_exception_execution_task:calls_domain_command:production_exception_execution',
        'production_exception_execution:reworks:affected_wip',
        'affected_wip:derives:affected_production_fact',
        'production_exception_over_issue:derives:affected_production_fact',
      ],
      interruptionStepKeys: [
        'production_exception_task:returns:production_exception_rejected',
      ],
      interruptionKinds: ['blocked', 'rejected', 'resume'],
      correctionStepKeys: [
        'production_exception_execution_task:calls_domain_command:production_exception_execution',
      ],
      protectedStepKey:
        'production_exception_execution_task:calls_domain_command:production_exception_execution',
      wrongStateStepKey:
        'production_exception_execution_task:calls_domain_command:production_exception_execution',
      idempotentStepKey:
        'production_exception_execution_task:calls_domain_command:production_exception_execution',
      dataStageKeys: ['facts', 'readiness'],
      browserScenarioKinds: ['unauthorized', 'wrong_state', 'idempotency'],
      interruptionTransitionRefs: [
        transition('workflow.task', 'ready->blocked'),
        transition('workflow.task', 'blocked->ready'),
        transition(
          'source.production_exception_decision',
          'SUBMITTED->REJECTED'
        ),
      ],
      correctionTransitionRefs: [
        transition(
          'source.production_exception_execution',
          'PENDING->REVERSED'
        ),
        transition(
          'source.production_exception_execution',
          'APPLIED->REVERSED'
        ),
      ],
      sourceRefs: [
        FACT_DATA_REF,
        EXCEPTION_BROWSER_REF,
        'server/internal/biz/production_exception_decision_test.go',
        'server/internal/biz/process_runtime_workflow_decision_test.go',
      ],
    }),
  }),

  purchase_quality_disposition: Object.freeze({
    steps: Object.freeze({
      'rejected_purchase_quality:creates_source:purchase_disposition': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.quality_inspection', 'SUBMITTED->REJECTED'),
        ],
        stateRefs: [
          state('fact.purchase_rejection_disposition', 'DRAFT', 'result'),
        ],
      }),
      'purchase_disposition:returns:purchase_return': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.purchase_return', 'DRAFT->POSTED'),
        ],
      }),
      'purchase_disposition:creates_source:purchase_adjustment': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.purchase_receipt_adjustment', 'DRAFT->POSTED'),
        ],
      }),
      'purchase_return:posts_fact:disposed_purchase_lot': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.purchase_return', 'DRAFT->POSTED'),
        ],
        stateRefs: [state('fact.inventory_lot', 'HOLD', 'result')],
      }),
      'purchase_adjustment:posts_fact:disposed_purchase_lot': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.purchase_receipt_adjustment', 'DRAFT->POSTED'),
        ],
        stateRefs: [state('fact.inventory_lot', 'HOLD', 'result')],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'rejected_purchase_quality:creates_source:purchase_disposition',
        'purchase_disposition:returns:purchase_return',
        'purchase_disposition:creates_source:purchase_adjustment',
        'purchase_return:posts_fact:disposed_purchase_lot',
        'purchase_adjustment:posts_fact:disposed_purchase_lot',
      ],
      interruptionStepKeys: [
        'rejected_purchase_quality:creates_source:purchase_disposition',
      ],
      interruptionKinds: ['rejected', 'returned', 'recovery'],
      correctionStepKeys: [
        'purchase_return:posts_fact:disposed_purchase_lot',
        'purchase_adjustment:posts_fact:disposed_purchase_lot',
      ],
      protectedStepKey:
        'rejected_purchase_quality:creates_source:purchase_disposition',
      wrongStateStepKey: 'purchase_return:posts_fact:disposed_purchase_lot',
      idempotentStepKey: 'purchase_return:posts_fact:disposed_purchase_lot',
      dataStageKeys: ['facts', 'readiness'],
      interruptionTransitionRefs: [
        transition('fact.quality_inspection', 'SUBMITTED->REJECTED'),
      ],
      correctionTransitionRefs: [
        transition('fact.purchase_return', 'POSTED->CANCELLED'),
        transition('fact.purchase_receipt_adjustment', 'POSTED->CANCELLED'),
      ],
      sourceRefs: [
        FACT_DATA_REF,
        'server/internal/biz/workflow_purchase_iqc_test.go',
        'server/internal/biz/inventory_operation_test.go',
      ],
    }),
  }),

  outsourcing_quality_disposition: Object.freeze({
    steps: Object.freeze({
      'rejected_outsourcing_quality:creates_source:outsourcing_disposition':
        step({
          responsibilityMode: 'human',
          stateTransitionRefs: [
            transition('fact.quality_inspection', 'SUBMITTED->REJECTED'),
          ],
          stateRefs: [
            state('fact.outsourcing_return_disposition', 'DRAFT', 'result'),
          ],
        }),
      'outsourcing_disposition:returns:outsourcing_correction': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.outsourcing_return_disposition', 'DRAFT->POSTED'),
        ],
      }),
      'outsourcing_correction:posts_fact:outsourcing_quarantine_lot': step({
        responsibilityMode: 'system',
        stateRefs: [
          state(
            'fact.outsourcing_return_disposition',
            'POSTED',
            'precondition'
          ),
          state('fact.inventory_lot', 'HOLD', 'result'),
        ],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'rejected_outsourcing_quality:creates_source:outsourcing_disposition',
        'outsourcing_disposition:returns:outsourcing_correction',
        'outsourcing_correction:posts_fact:outsourcing_quarantine_lot',
      ],
      interruptionStepKeys: [
        'rejected_outsourcing_quality:creates_source:outsourcing_disposition',
      ],
      interruptionKinds: ['rejected', 'returned', 'recovery'],
      correctionStepKeys: [
        'outsourcing_disposition:returns:outsourcing_correction',
      ],
      protectedStepKey:
        'outsourcing_disposition:returns:outsourcing_correction',
      wrongStateStepKey:
        'outsourcing_disposition:returns:outsourcing_correction',
      idempotentStepKey:
        'outsourcing_disposition:returns:outsourcing_correction',
      dataStageKeys: ['facts', 'readiness'],
      interruptionTransitionRefs: [
        transition('fact.quality_inspection', 'SUBMITTED->REJECTED'),
      ],
      correctionTransitionRefs: [
        transition('fact.outsourcing_return_disposition', 'POSTED->CANCELLED'),
      ],
      sourceRefs: [
        FACT_DATA_REF,
        'server/internal/biz/outsourcing_return_disposition_test.go',
        'server/internal/biz/workflow_outsource_return_qc_test.go',
      ],
    }),
  }),

  purchase_posting_corrections: Object.freeze({
    steps: Object.freeze({
      'posted_purchase_receipt:returns:purchase_return_correction': step({
        responsibilityMode: 'human',
        stateRefs: [state('fact.purchase_receipt', 'POSTED', 'precondition')],
        stateTransitionRefs: [
          transition('fact.purchase_return', 'DRAFT->POSTED'),
        ],
      }),
      'posted_purchase_receipt:creates_source:purchase_adjustment_correction':
        step({
          responsibilityMode: 'human',
          stateRefs: [state('fact.purchase_receipt', 'POSTED', 'precondition')],
          stateTransitionRefs: [
            transition('fact.purchase_receipt_adjustment', 'DRAFT->POSTED'),
          ],
        }),
      'purchase_return_correction:posts_fact:corrected_purchase_inventory':
        step({
          responsibilityMode: 'human',
          stateTransitionRefs: [
            transition('fact.purchase_return', 'DRAFT->POSTED'),
          ],
          stateRefs: [state('fact.inventory_lot', 'ACTIVE', 'result')],
        }),
      'purchase_adjustment_correction:posts_fact:corrected_purchase_inventory':
        step({
          responsibilityMode: 'human',
          stateTransitionRefs: [
            transition('fact.purchase_receipt_adjustment', 'DRAFT->POSTED'),
          ],
          stateRefs: [state('fact.inventory_lot', 'ACTIVE', 'result')],
        }),
      'corrected_purchase_inventory:derives:corrected_purchase_finance': step({
        responsibilityMode: 'derived',
        stateTransitionRefs: [transition('fact.finance', 'DRAFT->POSTED')],
      }),
      'purchase_return_correction:reverses:posted_purchase_receipt': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.purchase_return', 'POSTED->CANCELLED'),
        ],
      }),
      'purchase_adjustment_correction:reverses:posted_purchase_receipt': step({
        responsibilityMode: 'human',
        stateTransitionRefs: [
          transition('fact.purchase_receipt_adjustment', 'POSTED->CANCELLED'),
        ],
      }),
    }),
    profile: profile({
      happyStepKeys: [
        'posted_purchase_receipt:returns:purchase_return_correction',
        'posted_purchase_receipt:creates_source:purchase_adjustment_correction',
        'purchase_return_correction:posts_fact:corrected_purchase_inventory',
        'purchase_adjustment_correction:posts_fact:corrected_purchase_inventory',
        'corrected_purchase_inventory:derives:corrected_purchase_finance',
      ],
      interruptionStepKeys: [
        'posted_purchase_receipt:returns:purchase_return_correction',
        'posted_purchase_receipt:creates_source:purchase_adjustment_correction',
      ],
      interruptionKinds: ['retry', 'recovery'],
      correctionStepKeys: [
        'purchase_return_correction:reverses:posted_purchase_receipt',
        'purchase_adjustment_correction:reverses:posted_purchase_receipt',
      ],
      protectedStepKey:
        'posted_purchase_receipt:returns:purchase_return_correction',
      wrongStateStepKey:
        'posted_purchase_receipt:returns:purchase_return_correction',
      idempotentStepKey:
        'posted_purchase_receipt:returns:purchase_return_correction',
      dataStageKeys: ['facts', 'readiness'],
      interruptionTransitionRefs: [
        transition('fact.purchase_return', 'DRAFT->CANCELLED'),
        transition('fact.purchase_receipt_adjustment', 'DRAFT->CANCELLED'),
      ],
      correctionTransitionRefs: [
        transition('fact.purchase_return', 'POSTED->CANCELLED'),
        transition('fact.purchase_receipt_adjustment', 'POSTED->CANCELLED'),
      ],
      sourceRefs: [
        FACT_DATA_REF,
        'server/internal/biz/inventory_operation_test.go',
        'server/internal/biz/operational_fact_finance_source_test.go',
      ],
    }),
  }),
})
