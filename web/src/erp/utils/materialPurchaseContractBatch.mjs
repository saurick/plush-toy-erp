import { getPrintDraftProblems } from './printOutputPreflight.mjs'
import { MATERIAL_PURCHASE_MAX_ROWS } from './materialPurchaseContractEditor.mjs'

export const MATERIAL_PURCHASE_CONTRACT_BATCH_KIND =
  'material-purchase-contract-batch'
export const MATERIAL_PURCHASE_CONTRACT_BATCH_VERSION = 1
export const MATERIAL_PURCHASE_CONTRACT_BATCH_MAX = 20

const trimText = (value) => String(value ?? '').trim()

const partyValues = (draft, keys) => keys.map((key) => trimText(draft[key]))

function contractConditions({ record, draft }) {
  return [
    ['币种', trimText(record.currency).toUpperCase()],
    [
      '付款条件',
      [record.payment_term_days ?? null, trimText(record.payment_method)],
    ],
    [
      '开票条件',
      [record.invoice_required ?? null, trimText(record.invoice_category)],
    ],
    [
      '交货条件',
      [
        trimText(draft.returnDateText),
        record.supplier_confirmed_arrival_date ?? null,
        trimText(record.delivery_address),
      ],
    ],
    [
      '采购方信息',
      partyValues(draft, [
        'buyerCompany',
        'buyerContact',
        'buyerPhone',
        'buyerAddress',
        'buyerSigner',
      ]),
    ],
    [
      '供应方信息',
      partyValues(draft, [
        'supplierName',
        'supplierContact',
        'supplierPhone',
        'supplierAddress',
        'supplierSigner',
      ]),
    ],
    [
      '合同条款',
      ['delivery', 'contract', 'settlement'].map(
        (key) => draft.clauses?.[key] || []
      ),
    ],
  ].map(([label, value]) => [label, JSON.stringify(value)])
}

// 仅组织新打开窗口的业务快照；已编辑的合同草稿恢复时不重新归并。
export function groupMaterialPurchaseContracts(entries = []) {
  const suppliers = new Map()
  for (const entry of entries) {
    const supplierID = Number(entry.record.supplier_id || 0)
    const supplierKey =
      supplierID > 0 ? supplierID : Symbol('unidentified-supplier')
    if (!suppliers.has(supplierKey)) suppliers.set(supplierKey, [])
    suppliers
      .get(supplierKey)
      .push({ ...entry, conditions: contractConditions(entry) })
  }

  return Array.from(suppliers.values()).flatMap((supplierEntries) => {
    const groups = new Map()
    for (const entry of supplierEntries) {
      const key = JSON.stringify(entry.conditions)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(entry)
    }
    const splitReasons = supplierEntries[0].conditions
      .filter(
        (_, index) =>
          new Set(supplierEntries.map((entry) => entry.conditions[index][1]))
            .size > 1
      )
      .map(([label]) => label)
    return Array.from(groups.values()).map((members) => {
      const first = members[0]
      const sourceOrders = members.map(({ record }) => ({
        id: record.id,
        orderNo: trimText(record.purchase_order_no),
      }))
      const combinedDate = (key) =>
        Array.from(
          new Set(members.map(({ draft }) => trimText(draft[key])))
        ).join('、')
      return {
        purchaseOrderID: first.record.id,
        supplierID: first.record.supplier_id,
        sourceOrders,
        splitReasons,
        orderNo: sourceOrders.map((order) => order.orderNo).join('、'),
        supplierName: first.draft.supplierName,
        draft: {
          ...first.draft,
          contractNo:
            members.length === 1
              ? first.draft.contractNo
              : `详见明细（${members.length} 张采购单）`,
          orderDateText: combinedDate('orderDateText'),
          signDateText: combinedDate('signDateText'),
          lines: members.flatMap(({ record, draft }) =>
            draft.lines.map((line) => ({
              ...line,
              contractNo: record.purchase_order_no,
            }))
          ),
        },
      }
    })
  })
}

export function buildMaterialPurchaseContractBatchDraft(
  entries = [],
  options = {}
) {
  return {
    kind: MATERIAL_PURCHASE_CONTRACT_BATCH_KIND,
    version: MATERIAL_PURCHASE_CONTRACT_BATCH_VERSION,
    sourceLabel: trimText(options.sourceLabel),
    batchIndex: Number.isSafeInteger(options.batchIndex)
      ? Math.max(0, options.batchIndex)
      : 0,
    contracts: (Array.isArray(entries) ? entries : []).map((entry, index) => {
      const normalizedEntry = entry || {}
      return {
        purchaseOrderID: Number(normalizedEntry.purchaseOrderID || 0),
        supplierID: Number(normalizedEntry.supplierID || 0),
        sourceOrders: Array.isArray(normalizedEntry.sourceOrders)
          ? normalizedEntry.sourceOrders.map((order) => ({
              id: Number(order.id || 0),
              orderNo: trimText(order.orderNo),
            }))
          : [
              {
                id: Number(normalizedEntry.purchaseOrderID || 0),
                orderNo: trimText(
                  normalizedEntry.orderNo || normalizedEntry.draft?.contractNo
                ),
              },
            ],
        splitReasons: Array.isArray(normalizedEntry.splitReasons)
          ? [...normalizedEntry.splitReasons]
          : [],
        orderNo:
          trimText(normalizedEntry.orderNo) ||
          trimText(normalizedEntry.draft?.contractNo) ||
          `第 ${index + 1} 份合同`,
        supplierName:
          trimText(normalizedEntry.supplierName) ||
          trimText(normalizedEntry.draft?.supplierName),
        included: normalizedEntry.included !== false,
        draft:
          normalizedEntry.draft && typeof normalizedEntry.draft === 'object'
            ? normalizedEntry.draft
            : {},
      }
    }),
  }
}

export function getMaterialPurchaseContractOutputBatches(batchDraft) {
  const contracts = (batchDraft?.contracts || []).filter(
    (contract) => contract.included !== false
  )
  const batches = []
  for (
    let index = 0;
    index < contracts.length;
    index += MATERIAL_PURCHASE_CONTRACT_BATCH_MAX
  ) {
    batches.push(
      contracts.slice(index, index + MATERIAL_PURCHASE_CONTRACT_BATCH_MAX)
    )
  }
  return batches
}

export function isMaterialPurchaseContractBatchDraft(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.kind === MATERIAL_PURCHASE_CONTRACT_BATCH_KIND &&
      Number(value.version) === MATERIAL_PURCHASE_CONTRACT_BATCH_VERSION &&
      Array.isArray(value.contracts)
  )
}

export function getMaterialPurchaseContractBatchProblems(template, batchDraft) {
  if (!isMaterialPurchaseContractBatchDraft(batchDraft)) {
    return [{ orderNo: '批量打印数据', fields: ['格式无效'] }]
  }

  const { contracts } = batchDraft
  if (contracts.length === 0) {
    return [{ orderNo: '批量打印数据', fields: ['请至少选择一份采购合同'] }]
  }
  if (contracts.length > MATERIAL_PURCHASE_CONTRACT_BATCH_MAX) {
    return [
      {
        orderNo: '批量打印数据',
        fields: [`单次最多 ${MATERIAL_PURCHASE_CONTRACT_BATCH_MAX} 份采购合同`],
      },
    ]
  }

  return contracts.flatMap((contract, index) => {
    const fields = getPrintDraftProblems(template, contract?.draft)
    if (contract?.draft?.lines?.length > MATERIAL_PURCHASE_MAX_ROWS) {
      fields.push(
        `明细超过 ${MATERIAL_PURCHASE_MAX_ROWS} 行，请减少本次选择的采购单`
      )
    }
    return fields.length
      ? [
          {
            orderNo:
              trimText(contract?.orderNo) || `第 ${index + 1} 份采购合同`,
            fields,
          },
        ]
      : []
  })
}

export function formatMaterialPurchaseContractBatchProblems(problems = []) {
  const normalized = Array.isArray(problems) ? problems : []
  if (normalized.length === 0) {
    return ''
  }

  const visible = normalized.slice(0, 3).map((problem) => {
    const fields = Array.isArray(problem?.fields) ? problem.fields : []
    const fieldText = fields.slice(0, 6).join('、')
    const hiddenFieldCount = Math.max(0, fields.length - 6)
    return `${trimText(problem?.orderNo) || '采购合同'}：${fieldText}${
      hiddenFieldCount > 0 ? `等 ${fields.length} 项` : ''
    }`
  })
  const hiddenContractCount = Math.max(0, normalized.length - visible.length)
  return `${visible.join('；')}${
    hiddenContractCount > 0
      ? `；另有 ${hiddenContractCount} 份合同需要补充`
      : ''
  }。请在本窗口补齐后再打印，或取消选择本次不打印的合同。`
}
