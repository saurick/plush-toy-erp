import {
  WarehouseProductionKind as Kind,
  WarehouseProductionStage as Stage,
} from '../../common/consts/statuses.generated.mjs'
import { numeric20Scale6QuantityUnits } from './numeric20Scale6.mjs'

export const warehouseProductionStageLabels = Object.freeze({
  [Stage.RETURN]: '待点数',
  [Stage.INBOUND]: '待入库',
  [Stage.QUALITY]: '待检',
  [Stage.PACKAGING]: '待查货包装',
  [Stage.READY]: '检验包装已完成',
  [Stage.COMPLETED]: '已结束',
  [Stage.REJECTED]: '检验不合格',
  [Stage.CANCELLED]: '已取消',
})

export function warehouseProductionStageOptions(kind) {
  const stages =
    kind === Kind.RETURN
      ? [
          Stage.RETURN,
          Stage.QUALITY,
          Stage.COMPLETED,
          Stage.REJECTED,
          Stage.CANCELLED,
        ]
      : [
          Stage.INBOUND,
          Stage.QUALITY,
          Stage.PACKAGING,
          Stage.READY,
          Stage.COMPLETED,
          Stage.REJECTED,
          Stage.CANCELLED,
        ]
  return stages.map((value) => ({
    value,
    label: warehouseProductionStageLabels[value],
  }))
}

export function validateWarehouseProductionWorkPage(data, request) {
  const count = (value) => Number.isSafeInteger(value) && value >= 0
  const quantity = (value) =>
    typeof value === 'string' &&
    numeric20Scale6QuantityUnits(value) !== null &&
    BigInt(numeric20Scale6QuantityUnits(value)) >= 0n
  if (
    !data ||
    !Array.isArray(data.items) ||
    !count(data.total) ||
    !data.counts ||
    typeof data.counts !== 'object' ||
    Object.values(data.counts).some((value) => !count(value)) ||
    data.items.length > (request.limit || 20) ||
    data.items.length > data.total ||
    data.items.some(
      (row) =>
        !row ||
        !Number.isSafeInteger(row.id) ||
        row.id <= 0 ||
        row.kind !== request.kind ||
        !warehouseProductionStageLabels[row.stage] ||
        (request.stage && row.stage !== request.stage) ||
        !quantity(row.quantity) ||
        !quantity(row.pending_inspection_quantity) ||
        !quantity(row.pending_packaging_quantity)
    )
  ) {
    throw new Error('仓库办理记录返回不完整，请刷新后核对')
  }
  return data
}

export function warehouseProductionActionLabel(row) {
  if (!row) return '办理当前记录'
  if (row?.stage === Stage.RETURN) return '登记回货点数'
  if (row?.stage === Stage.INBOUND) return '确认成品入库'
  if (row?.stage === Stage.PACKAGING) return '办理查货包装'
  return '查看处理进度'
}

export function warehouseProductionNextStep(row) {
  if ([Stage.RETURN, Stage.INBOUND].includes(row?.stage)) return '仓库核对实物'
  if (row?.stage === Stage.QUALITY) return '品质检验'
  if (row?.stage === Stage.PACKAGING) {
    return row.packaging_confirmed ? '仓库查货包装' : '业务确认包装资料'
  }
  if (row?.stage === Stage.REJECTED) return '业务核对异常处置'
  if (row?.stage === Stage.READY) return '业务核对出货条件'
  return '保留记录供追溯'
}
