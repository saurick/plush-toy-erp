import { initialIncomingChecks } from './incomingAcceptance.mjs'

const GATE_CHECKS = {
  CUT_PIECE: ['裁片检验', '裁片尺寸、方向与确认样一致'],
  SHELL: ['皮套检验', '车缝、尺寸与确认样一致'],
  FINISHED_GOODS: ['成品检验', '外观、尺寸与功能符合订单及确认样'],
  NEEDLE: ['针检', '按订单要求记录检针结果'],
  SAMPLING: ['抽检', '按约定抽样范围检查并记录异常'],
  CUSTOMER_ACCEPTANCE: ['客户验货', '按客户验货要求记录实际结果'],
}

export function initialQualityChecks(inspection = {}) {
  if (inspection.purchase_receipt_item_id || inspection.inspection_type === 'INCOMING') {
    return initialIncomingChecks()
  }
  const [name, requirement] = inspection.inspection_type === 'PRODUCTION_STAGE'
    ? GATE_CHECKS[inspection.gate_code] || ['生产检验', '符合当前工序及订单约定']
    : inspection.inspection_type === 'OUTSOURCING_RETURN'
      ? ['回货检验', '加工结果、数量与外观符合委外约定']
      : ['出货前检验', '成品、包装与出货约定一致']
  return [{ name, requirement, result: 'NOT_CHECKED' }]
}
