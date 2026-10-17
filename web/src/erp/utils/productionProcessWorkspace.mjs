import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import {
  OperationalFactStatus,
  ProductionWIPStatus,
  QualityInspectionStatus,
} from '../../common/consts/statuses.generated.mjs'
import {
  numeric20Scale6QuantityUnits,
  numeric20Scale6TextFromUnits,
} from './numeric20Scale6.mjs'
import { buildProductionProcessModel } from './businessVisualizationModels.mjs'
import {
  PRODUCTION_WIP_ACTION,
  PRODUCTION_WIP_EXECUTION_MODE_META,
  nextProductionWipOperation,
  productionWipActionAllowedForOrder,
  productionWipCompletionEligibility,
  productionWipOperationDisplayLabel,
  productionWipTransferRemainingQuantity,
} from './productionWipModel.mjs'

const INACTIVE = new Set([
  ProductionWIPStatus.CANCELLED,
  ProductionWIPStatus.SPLIT,
])
const DESCRIPTIONS = Object.freeze({
  FABRIC_PROCESSING: '裁剪、刺绣等布料准备，以本单工艺为准。',
  SEWING: '把布片缝成玩具外形。',
  HANDWORK: '按本单工艺完成充棉、装配、缝口等。',
  PACKAGING: '按已确认的包装资料整理和装箱。',
})
const COLORS = Object.freeze({
  ready: 'blue',
  active: 'processing',
  quality: 'gold',
  exception: 'red',
  inbound: 'gold',
  done: 'green',
})

function receiptMatter(batch, receipt) {
  return {
    batchID: batch.id,
    stepID: batch.production_order_operation_id,
    quantity: receipt.quantity || '—',
    key: 'inbound',
    rank: 1,
    state: '待成品入库',
    title: '成品收仓草稿待仓库核对',
    reason: '这张草稿尚未确认入库，也未增加库存。',
    owner: '仓库',
    next: '核对收仓数量、仓库及入库结果。',
    target: 'record',
    action: '',
    permissions: [],
    recordID: receipt.id,
    label: '核对成品入库',
  }
}

function sumQuantity(batches) {
  const values = batches.map((batch) =>
    numeric20Scale6QuantityUnits(batch.quantity)
  )
  if (!values.length || values.some((value) => value === null)) return '—'
  return numeric20Scale6TextFromUnits(
    values.reduce((total, value) => total + BigInt(value), 0n).toString()
  )
}

function actionPermission(action, operation) {
  if (action === PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION) {
    return PermissionCode.PRODUCTION_WIP_ASSIGN
  }
  if (action === PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL) {
    return PermissionCode.PRODUCTION_PACKAGING_MATERIAL_CONFIRM
  }
  if (
    operation.operation_code === 'PACKAGING' ||
    (operation.operation_code === 'HANDWORK' &&
      action === PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION)
  ) {
    return PermissionCode.WAREHOUSE_PACKAGING_EXECUTE
  }
  if (
    operation.operation_code === 'FABRIC_PROCESSING' &&
    action === PRODUCTION_WIP_ACTION.START_OPERATION
  ) {
    return PermissionCode.OUTSOURCING_MATERIAL_ISSUE_CREATE
  }
  if (action === PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN) {
    return PermissionCode.OUTSOURCING_RETURN_RECEIPT_CREATE
  }
  return PermissionCode.PRODUCTION_WIP_EXECUTE
}

function batchMatter(aggregate, batch, operation) {
  if (INACTIVE.has(batch.status)) return null
  const name = productionWipOperationDisplayLabel(operation)
  const inspections = (aggregate.qualityInspections || []).filter(
    (entry) =>
      entry.production_wip_batch_id === batch.id &&
      entry.status !== QualityInspectionStatus.CANCELLED
  )
  const receipt = (aggregate.finishedGoodsReceipts || []).find(
    (entry) =>
      entry.production_wip_batch_id === batch.id &&
      entry.status === OperationalFactStatus.DRAFT
  )
  const base = {
    batchID: batch.id,
    stepID: operation.id,
    quantity: batch.quantity || '—',
    target: '',
    action: '',
    permissions: [],
  }
  const wip = (action, details) => ({
    ...base,
    target: 'wip',
    action,
    permissions: [actionPermission(action, operation)],
    ...details,
  })
  const quality = (status, inspection) => ({
    ...base,
    key: 'quality',
    rank: 1,
    state: status,
    title: `${name}已完工，等待品质检验`,
    reason:
      inspection?.status === QualityInspectionStatus.DRAFT
        ? '检验草稿尚未提交。'
        : '尚未形成可移交的检验结果。',
    owner: '品质',
    next: '核对检验内容，提交并判定本次结果。',
    target: inspection ? 'inspection' : '',
    recordID: inspection?.id,
    label: '查看检验单',
  })
  if (batch.status === ProductionWIPStatus.REJECTED) {
    return {
      ...base,
      key: 'exception',
      rank: 0,
      state: '检验不合格',
      title: `${name}检验不合格，需跟进处置`,
      reason: '不合格批次不能直接移交下一道。',
      owner: '生产 / 品质',
      next: '在异常处理中核对申请、审批结论与实际处置。',
      target: 'exceptions',
      label: '查看异常处理',
    }
  }
  if (batch.status === ProductionWIPStatus.WAITING_QUALITY) {
    const pending =
      inspections.find(
        (entry) => entry.status === QualityInspectionStatus.SUBMITTED
      ) ||
      inspections.find(
        (entry) => entry.status === QualityInspectionStatus.DRAFT
      )
    return quality(
      pending?.status === QualityInspectionStatus.DRAFT
        ? '待提交检验'
        : '待检验判定',
      pending
    )
  }
  if (batch.status === ProductionWIPStatus.PLANNED) {
    if (!batch.execution_mode) {
      return wip(PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION, {
        key: 'ready',
        rank: 2,
        state: '待安排',
        title: `${name}待安排`,
        reason: '本批尚未确定加工安排。',
        owner: '生产安排',
        next: '核对本批数量、工艺与可用来源合同后安排加工。',
        label: '安排生产',
      })
    }
    const materialIssue = operation.operation_code === 'FABRIC_PROCESSING'
    return wip(PRODUCTION_WIP_ACTION.START_OPERATION, {
      key: 'ready',
      rank: 2,
      state: '待开工',
      title: `${name}已安排，等待开工`,
      reason: '加工安排已经确定，尚未确认开始。',
      owner:
        materialIssue || operation.operation_code === 'PACKAGING'
          ? '仓库'
          : '生产执行',
      next: materialIssue
        ? '核对并登记本次领料，再确认开工。'
        : '核对本批安排后确认开工。',
      label: materialIssue ? '领料并开工' : '确认开工',
    })
  }
  if (batch.status === ProductionWIPStatus.IN_PROGRESS) {
    return wip(PRODUCTION_WIP_ACTION.COMPLETE_OPERATION, {
      key: 'active',
      rank: 3,
      state: '生产中',
      title: `${name}正在本厂生产`,
      reason: '本批尚未登记完工。',
      owner: operation.operation_code === 'PACKAGING' ? '仓库' : '生产执行',
      next: '本批实际完成后登记完工，再按工艺要求核对结果。',
      label: '登记本批完工',
    })
  }
  if (batch.status === ProductionWIPStatus.OUTSOURCED) {
    return wip(PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN, {
      key: 'active',
      rank: 3,
      state: '外发加工中',
      title: `${name}已外发，等待回货`,
      reason: '本批尚未登记外发回货。',
      owner: '仓库',
      next: '实际收到回货后核对数量并登记，随后交品质检验。',
      label: '登记外发回货',
    })
  }
  if (batch.status === ProductionWIPStatus.ACCEPTED) {
    if (receipt) return receiptMatter(batch, receipt)
    if (
      operation.operation_code === 'HANDWORK' &&
      !(aggregate.finishedGoodsReceipts || []).some(
        (entry) =>
          entry.production_wip_batch_id === batch.id &&
          entry.status !== OperationalFactStatus.CANCELLED
      )
    ) {
      const item = aggregate.items.find(
        (entry) => entry.id === batch.production_order_item_id
      )
      if (
        productionWipCompletionEligibility(aggregate, item, {
          productionWipBatchID: batch.id,
        }).eligible
      ) {
        return {
          ...base,
          key: 'ready',
          rank: 2,
          state: '待成品收仓',
          title: '手工制作已完成，待登记成品收仓',
          reason: '本批尚无有效的成品收仓记录。',
          owner: '生产',
          next: '登记成品收仓草稿，再交仓库核对入库。',
          target: 'wip',
          action: 'completion',
          permissions: [
            PermissionCode.PRODUCTION_COMPLETION_CREATE,
            PermissionCode.PRODUCTION_FACT_READ,
          ],
          label: '登记成品收仓',
        }
      }
    }
    const nextOperation = nextProductionWipOperation(aggregate, batch)
    if (
      nextOperation &&
      BigInt(
        numeric20Scale6QuantityUnits(
          productionWipTransferRemainingQuantity(
            aggregate,
            batch,
            nextOperation
          )
        ) || '0'
      ) > 0n
    ) {
      return wip(PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION, {
        key: 'ready',
        rank: 2,
        state: '待移交',
        title: `${name}已合格，待移交${productionWipOperationDisplayLabel(nextOperation)}`,
        reason: '本批仍有未移交数量。',
        owner: operation.operation_code === 'HANDWORK' ? '仓库' : '生产执行',
        next: '核对可移交数量及下一道接收条件后办理。',
        label: `移交${productionWipOperationDisplayLabel(nextOperation)}`,
      })
    }
    return null
  }
  return {
    ...base,
    key: 'unknown',
    rank: 4,
    state: '待核对',
    title: '当前批次状态待核对',
    reason: '请刷新后核对本批记录。',
    owner: '待确认',
    next: '核对当前业务记录。',
    label: '查看进度',
  }
}

// This model describes current facts and navigation. It does not grant actions
// or derive task completion; existing forms and server usecases validate writes.
export function buildProductionProcessWorkspace(aggregate) {
  const model = buildProductionProcessModel(aggregate)
  const operations = new Map(
    (aggregate?.operations || []).map((operation) => [operation.id, operation])
  )
  const batches = new Map(
    (aggregate?.batches || []).map((batch) => [batch.id, batch])
  )
  const inspections = new Map(
    (aggregate?.qualityInspections || []).map((inspection) => [inspection.id, inspection])
  )
  const items = model.items.map((item) => {
    const steps = item.steps.map((step) => {
      const operation = operations.get(step.id)
      const matters = step.batches
        .flatMap((entry) => {
          const batch = batches.get(entry.id)
          const primary = batchMatter(aggregate, batch, operation)
          const receipts = INACTIVE.has(batch.status)
            ? []
            : (aggregate.finishedGoodsReceipts || [])
                .filter(
                  (receipt) =>
                    receipt.production_wip_batch_id === batch.id &&
                    receipt.status === OperationalFactStatus.DRAFT &&
                    receipt.id !== primary?.recordID
                )
                .map((receipt) => receiptMatter(batch, receipt))
          return [primary, ...receipts]
        })
        .filter(Boolean)
        .map((matter) => ({
          ...matter,
          color: COLORS[matter.key],
          allowedForOrder:
            !matter.action ||
            matter.action === 'completion' ||
            productionWipActionAllowedForOrder(
              aggregate.productionOrder,
              batches.get(matter.batchID),
              matter.action
            ),
        }))
        .sort(
          (left, right) =>
            left.rank - right.rank || left.batchID - right.batchID
        )
      const primary = matters[0]
      const activeBatches = step.batches
        .filter((batch) => !INACTIVE.has(batch.statusKey))
        .map((batch) => ({
          ...batch,
          executionLabel: PRODUCTION_WIP_EXECUTION_MODE_META[batches.get(batch.id)?.execution_mode]?.label || '未安排加工方式',
        }))
      const problemBatches = activeBatches.filter(
        (batch) => batch.statusKey === ProductionWIPStatus.REJECTED
      )
      const counts = new Map()
      activeBatches.forEach((batch) =>
        counts.set(batch.status, (counts.get(batch.status) || 0) + 1)
      )
      const state = primary
        ? { key: primary.key, label: primary.state }
        : step.state
      return {
        ...step,
        name: productionWipOperationDisplayLabel(operation),
        originalName: operation.process_name_snapshot || '',
        description:
          DESCRIPTIONS[operation.operation_code] || '以本单工艺要求为准。',
        matters,
        primary,
        activeBatches,
        problemBatches,
        batchSummary: [...counts].map(([label, count]) => `${count} 批${label}`).join(' · '),
        inspections: step.inspections.map((inspection) => ({
          ...inspection,
          batchID: inspections.get(inspection.id)?.production_wip_batch_id,
        })),
        color: COLORS[primary?.key || step.state.key],
        state: problemBatches.length
          ? { ...state, label: '有不合格批次' }
          : state,
        quantity: sumQuantity(activeBatches),
      }
    })
    const matters = steps
      .flatMap((step) => step.matters)
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          steps.findIndex((step) => step.id === left.stepID) -
            steps.findIndex((step) => step.id === right.stepID) ||
          left.batchID - right.batchID
      )
    const current = matters[0]
    return {
      ...item,
      steps,
      matters,
      current,
      currentStep:
        steps.find((step) => step.id === current?.stepID) ||
        [...steps].reverse().find((step) => step.state.key === 'done') ||
        steps[0],
    }
  })
  return {
    ...model,
    items,
    filters: [
      { key: 'all', label: '全部', count: items.length },
      {
        key: 'ready',
        label: '待办理',
        count: items.filter((item) =>
          item.matters.some((matter) => matter.key === 'ready')
        ).length,
      },
      {
        key: 'quality',
        label: '待质检',
        count: items.filter((item) =>
          item.matters.some((matter) => matter.key === 'quality')
        ).length,
      },
      {
        key: 'exception',
        label: '异常',
        count: items.filter((item) =>
          item.matters.some((matter) => matter.key === 'exception')
        ).length,
      },
      {
        key: 'inbound',
        label: '待入库',
        count: items.filter((item) =>
          item.matters.some((matter) => matter.key === 'inbound')
        ).length,
      },
    ],
  }
}

export function filterProductionProcessItems(
  items,
  { filter = 'all', query = '' } = {}
) {
  const keyword = String(query).trim().toLocaleLowerCase()
  return items
    .filter(
      (item) =>
        (filter === 'all' ||
          item.matters.some((matter) => matter.key === filter)) &&
        (!keyword ||
          [item.productName, item.productCode, item.skuCode].some((value) =>
            String(value || '')
              .toLocaleLowerCase()
              .includes(keyword)
          ))
    )
    .map((item) => {
      const current =
        filter === 'all'
          ? item.current
          : item.matters.find((matter) => matter.key === filter)
      return current === item.current
        ? item
        : {
            ...item,
            current,
            currentStep: item.steps.find((step) => step.id === current.stepID),
          }
    })
}
