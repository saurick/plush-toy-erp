// 由 `node scripts/gen-public-contracts.mjs` 生成；请勿手改。
// 真源：server/internal/core/status 及 server/cmd/public-contracts 登记的 biz 领域声明。
export const BOMLossSource = Object.freeze({
  CALCULATED: 'calculated',
  EXPLICIT: 'explicit',
  HEADER: 'header',
  UNRESOLVED: 'unresolved',
})

export const FinanceAdjustmentDirection = Object.freeze({
  DECREASE: 'DECREASE',
  INCREASE: 'INCREASE',
})

export const FinanceAllocationStatus = Object.freeze({
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
})

export const FinancePaymentDirection = Object.freeze({
  DISBURSEMENT: 'DISBURSEMENT',
  RECEIPT: 'RECEIPT',
})

export const FinancePaymentKind = Object.freeze({
  ADVANCE: 'ADVANCE',
  REFUND: 'REFUND',
  SETTLEMENT: 'SETTLEMENT',
})

export const FinancePaymentStatus = Object.freeze({
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  REJECTED: 'REJECTED',
  REVERSED: 'REVERSED',
})

export const InventoryLotStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  HOLD: 'HOLD',
  REJECTED: 'REJECTED',
})

export const InventoryOperationStatus = Object.freeze({
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  REJECTED: 'REJECTED',
  SUBMITTED: 'SUBMITTED',
})

export const MaterialRequestStatus = Object.freeze({
  APPROVED: 'APPROVED',
  BOSS_APPROVED: 'BOSS_APPROVED',
  REJECTED: 'REJECTED',
  SUBMITTED: 'SUBMITTED',
})

export const OperationalFactStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  SETTLED: 'SETTLED',
})

export const OutsourcingOrderItemStatus = Object.freeze({
  CANCELED: 'canceled',
  CLOSED: 'closed',
  OPEN: 'open',
})

export const OutsourcingOrderStatus = Object.freeze({
  CANCELED: 'canceled',
  CLOSED: 'closed',
  CONFIRMED: 'confirmed',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
})

export const ProcessBlockKind = Object.freeze({
  DOMAIN_COMMAND: 'domain_command',
  MANUAL: 'manual',
  OVERDUE: 'overdue',
  REJECTION: 'rejection_without_route',
})

export const ProcessKey = Object.freeze({
  FINANCE_PAYMENT_APPROVAL: 'finance_payment_approval',
  FINISHED_GOODS_DELIVERY: 'finished_goods_delivery',
  INVENTORY_ADJUSTMENT_APPROVAL: 'inventory_adjustment_approval',
  MATERIAL_SUPPLY: 'material_supply',
  PRODUCTION_EXCEPTION_APPROVAL: 'production_exception_approval',
  SALES_ORDER_ACCEPTANCE: 'sales_order_acceptance',
})

export const ProcessNodeStatus = Object.freeze({
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  WAITING: 'waiting',
  WITHDRAWN: 'withdrawn',
})

export const ProcessNodeType = Object.freeze({
  APPROVAL: 'approval',
  DOMAIN_COMMAND: 'domain_command',
  END: 'end',
  HUMAN_TASK: 'human_task',
  WAIT_EVENT: 'wait_event',
})

export const ProcessResolution = Object.freeze({
  CANCELLED: 'cancelled',
  COMPENSATED: 'compensated',
  REJECTED: 'rejected',
  SUCCEEDED: 'succeeded',
})

export const ProcessStatus = Object.freeze({
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
})

export const ProductionExceptionExecutionStatus = Object.freeze({
  APPLIED: 'APPLIED',
  PENDING: 'PENDING',
  REVERSED: 'REVERSED',
})

export const ProductionExceptionStatus = Object.freeze({
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  SUBMITTED: 'SUBMITTED',
})

export const ProductionOrderStatus = Object.freeze({
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
  DRAFT: 'DRAFT',
  RELEASED: 'RELEASED',
})

export const ProductionPackagingConfirmationStatus = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  PENDING: 'PENDING',
})

export const ProductionWIPStatus = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  CANCELLED: 'CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  OUTSOURCED: 'OUTSOURCED',
  PLANNED: 'PLANNED',
  REJECTED: 'REJECTED',
  SPLIT: 'SPLIT',
  WAITING_QUALITY: 'WAITING_QUALITY',
})

export const PurchaseOrderItemStatus = Object.freeze({
  CANCELED: 'canceled',
  CLOSED: 'closed',
  OPEN: 'open',
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

export const PurchaseRejectionStatus = Object.freeze({
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

export const SalesOrderItemStatus = Object.freeze({
  CANCELED: 'canceled',
  CLOSED: 'closed',
  OPEN: 'open',
})

export const SalesOrderStatus = Object.freeze({
  ACTIVE: 'active',
  CANCELED: 'canceled',
  CLOSED: 'closed',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
})

export const ShipmentFinanceReleaseStatus = Object.freeze({
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
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
