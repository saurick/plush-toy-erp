export const BUSINESS_STATUS_OPTIONS = Object.freeze([
  {
    key: 'project_pending',
    label: '立项待确认',
    summary: '客户、编号、交期和资料前置条件正在收口。',
  },
  {
    key: 'project_approved',
    label: '立项已放行',
    summary: '已通过老板或管理层审批，允许进入资料与采购准备。',
  },
  {
    key: 'engineering_preparing',
    label: '资料准备中',
    summary: 'BOM、色卡、作业指导书和包装要求正在补齐。',
  },
  {
    key: 'material_preparing',
    label: '齐套准备中',
    summary: '主料、辅包材、委外和关键资料仍在确认或催办。',
  },
  {
    key: 'production_ready',
    label: '待排产',
    summary: '齐套条件已满足，等待生产经理做排单决策。',
  },
  {
    key: 'production_processing',
    label: '生产中',
    summary: '已进入裁切、车缝、手工、组装或外发执行。',
  },
  {
    key: 'qc_pending',
    label: '待检验',
    summary: '待做 IQC、过程检验、返工复检或出货前质量确认。',
  },
  {
    key: 'iqc_pending',
    label: 'IQC 待检',
    summary: '采购到货或入库通知已形成，等待品质做来料检验。',
  },
  {
    key: 'qc_failed',
    label: '质检不合格',
    summary:
      '来料、回货或成品检验未通过，等待责任角色处理退货、返工、补做或让步接收。',
  },
  {
    key: 'warehouse_processing',
    label: '待入库 / 待出货',
    summary: '仓库正在做回仓、入库、备货和待出货准备。',
  },
  {
    key: 'warehouse_inbound_pending',
    label: '待确认入库',
    summary: 'IQC 已放行，等待仓库确认入库数量、库位和经手人。',
  },
  {
    key: 'inbound_done',
    label: '入库协同已完成',
    summary: '相关交接任务已经完成；实际库存以入库单过账结果为准。',
  },
  {
    key: 'shipment_pending',
    label: '待出货',
    summary: '成品已入库或放行，等待出货准备、装箱、唛头和出库确认。',
  },
  {
    key: 'shipping_released',
    label: '已放行待出库',
    summary: '业务确认和财务放行已完成，等待仓库出库执行。',
  },
  {
    key: 'shipped',
    label: '出货协同已完成',
    summary: '出货链路已完成；实际出货数量和库存扣减以出货单为准。',
  },
  {
    key: 'reconciling',
    label: '对账中',
    summary: '加工费、辅包材费用和异常费用正在核对。',
  },
  {
    key: 'settled',
    label: '结算协同已完成',
    summary: '对账交接已经完成；实际应收应付和收付款以业务财务记录为准。',
  },
  {
    key: 'blocked',
    label: '业务阻塞',
    summary: '主链被缺料、延期、未放行、数量差异或异常问题卡住。',
  },
  {
    key: 'cancelled',
    label: '业务取消',
    summary: '订单或批次被整体取消，不再继续推进。',
  },
  {
    key: 'closed',
    label: '业务归档',
    summary: '主链已完成并归档，保留历史快照与追溯记录。',
  },
])

const BUSINESS_STATUS_BY_KEY = new Map(
  BUSINESS_STATUS_OPTIONS.map((state) => [state.key, state])
)

export function getBusinessStatusLabel(statusKey, fallback = '未知业务状态') {
  const normalizedStatusKey = String(statusKey || '').trim()
  if (!normalizedStatusKey) return fallback
  return BUSINESS_STATUS_BY_KEY.get(normalizedStatusKey)?.label || fallback
}
