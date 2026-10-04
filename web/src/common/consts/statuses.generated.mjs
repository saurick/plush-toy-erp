// 由 `node scripts/gen-public-contracts.mjs` 生成；请勿手改。
// 真源：server/internal/core/status、server/internal/biz/workflow_metadata.go、server/internal/biz/operational_fact.go、server/internal/biz/outsourcing_order.go、server/internal/biz/production_order.go。
export const InventoryLotStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  HOLD: 'HOLD',
  REJECTED: 'REJECTED',
})

export const OperationalFactStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  SETTLED: 'SETTLED',
})

export const OutsourcingOrderStatus = Object.freeze({
  CANCELED: 'canceled',
  CLOSED: 'closed',
  CONFIRMED: 'confirmed',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
})

export const ProductionOrderStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
  DRAFT: 'DRAFT',
  RELEASED: 'RELEASED',
})

export const PurchaseOrderStatus = Object.freeze({
  APPROVED: 'approved',
  CANCELED: 'canceled',
  CLOSED: 'closed',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
})

export const PurchaseReceiptAdjustmentStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
})

export const PurchaseReceiptStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
})

export const PurchaseReturnStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
})

export const QualityInspectionStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  PASSED: 'PASSED',
  REJECTED: 'REJECTED',
  SUBMITTED: 'SUBMITTED',
})

export const SalesOrderStatus = Object.freeze({
  ACTIVE: 'active',
  CANCELED: 'canceled',
  CLOSED: 'closed',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
})

export const ShipmentStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  SHIPPED: 'SHIPPED',
})

export const StockReservationStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  CONSUMED: 'CONSUMED',
  RELEASED: 'RELEASED',
})

export const WorkflowBusinessStatus = Object.freeze({
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
  CLOSED: 'closed',
  ENGINEERING_PREPARING: 'engineering_preparing',
  INBOUND_DONE: 'inbound_done',
  IQC_PENDING: 'iqc_pending',
  MATERIAL_PREPARING: 'material_preparing',
  PRODUCTION_PROCESSING: 'production_processing',
  PRODUCTION_READY: 'production_ready',
  PROJECT_APPROVED: 'project_approved',
  PROJECT_PENDING: 'project_pending',
  QC_FAILED: 'qc_failed',
  QC_PENDING: 'qc_pending',
  RECONCILING: 'reconciling',
  SETTLED: 'settled',
  SHIPMENT_PENDING: 'shipment_pending',
  SHIPPED: 'shipped',
  SHIPPING_RELEASED: 'shipping_released',
  WAREHOUSE_INBOUND_PENDING: 'warehouse_inbound_pending',
  WAREHOUSE_PROCESSING: 'warehouse_processing',
})

export const WorkflowTaskStatus = Object.freeze({
  BLOCKED: 'blocked',
  DONE: 'done',
  READY: 'ready',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
})
