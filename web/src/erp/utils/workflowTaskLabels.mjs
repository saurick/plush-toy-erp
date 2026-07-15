const WORKFLOW_TASK_GROUP_LABELS = Object.freeze({
  cycle_count: '库存盘点',
  finished_goods_inbound: '成品入库',
  finished_goods_qc: '成品质检',
  finished_goods_rework: '成品返工',
  invoice_registration: '开票登记',
  order_approval: '销售订单受理',
  outsource_payable_registration: '委外应付登记',
  outsource_reconciliation: '委外对账',
  outsource_return_qc: '委外回货质检',
  outsource_return_tracking: '委外回货跟进',
  outsource_rework: '委外返工',
  outsource_warehouse_inbound: '委外回货入库',
  payable_registration: '应付登记',
  purchase_iqc: '来料检验',
  purchase_payable_registration: '采购应付登记',
  purchase_quality_exception: '采购质量异常',
  purchase_reconciliation: '采购对账',
  receivable_registration: '应收登记',
  shipment_release: '出货放行',
  warehouse_inbound: '采购入库',
})

export function getWorkflowTaskGroupLabel(taskGroupKey, fallback = '业务任务') {
  const normalized = String(taskGroupKey || '').trim()
  return WORKFLOW_TASK_GROUP_LABELS[normalized] || fallback
}
