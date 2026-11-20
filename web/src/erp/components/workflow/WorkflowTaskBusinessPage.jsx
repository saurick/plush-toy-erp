import React from 'react'
import { Spin } from 'antd'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import { BUSINESS_ROUTE_PATHS } from '../../utils/masterDataOrderView.mjs'
import { isEngineeringMaterialTask } from '../../utils/engineeringMaterialTask.mjs'
import WorkflowTaskMaterialForm from './WorkflowTaskMaterialForm.jsx'
import WorkflowTaskReceiptReplacementForm from './WorkflowTaskReceiptReplacementForm.jsx'

const SalesOrders = lazyWithDynamicImportRetry(() => import('../../pages/SalesOrdersPage.jsx'))
const PurchaseOrders = lazyWithDynamicImportRetry(() => import('../../pages/PurchaseOrdersPage.jsx'))
const OutsourcingOrders = lazyWithDynamicImportRetry(() => import('../../pages/OutsourcingOrdersPage.jsx'))
const Receipts = lazyWithDynamicImportRetry(() => import('../../pages/PurchaseReceiptsPage.jsx'))
const Quality = lazyWithDynamicImportRetry(() => import('../../pages/QualityInspectionsPage.jsx'))
const Inventory = lazyWithDynamicImportRetry(() => import('../../pages/InventoryLedgerPage.jsx'))
const ProductionOrders = lazyWithDynamicImportRetry(() => import('../../pages/ProductionOrdersPage.jsx'))
const Shipments = lazyWithDynamicImportRetry(() => import('../../pages/ShipmentsPage.jsx'))
const Payments = lazyWithDynamicImportRetry(() => import('../../pages/FinancePaymentsPage.jsx'))
const Facts = lazyWithDynamicImportRetry(() => import('../../pages/OperationalFactPage.jsx'))
const BOM = lazyWithDynamicImportRetry(() => import('../../pages/BOMVersionsPage.jsx'))
const ProductionExceptions = lazyWithDynamicImportRetry(() => import('../production-exceptions/ProductionExceptionDecisionPanel.jsx'))
const PaymentEntry = lazyWithDynamicImportRetry(() => import('../../mobile/components/MobileTaskPaymentAction.jsx'))

const PAGES = new Map([
  [BUSINESS_ROUTE_PATHS.salesOrders, SalesOrders],
  [BUSINESS_ROUTE_PATHS.purchaseOrders, PurchaseOrders],
  [BUSINESS_ROUTE_PATHS.processingContracts, OutsourcingOrders],
  [BUSINESS_ROUTE_PATHS.purchaseReceipts, Receipts],
  [BUSINESS_ROUTE_PATHS.qualityInspections, Quality],
  [BUSINESS_ROUTE_PATHS.inventory, Inventory],
  [BUSINESS_ROUTE_PATHS.productionOrders, ProductionOrders],
  [BUSINESS_ROUTE_PATHS.shipments, Shipments],
  [BUSINESS_ROUTE_PATHS.financePayments, Payments],
  [BUSINESS_ROUTE_PATHS.productionProgress, Facts],
  ['/erp/purchase/material-bom', BOM],
  [BUSINESS_ROUTE_PATHS.productionExceptions, ProductionExceptions],
  [BUSINESS_ROUTE_PATHS.receivables, Facts],
  [BUSINESS_ROUTE_PATHS.payables, Facts],
  [BUSINESS_ROUTE_PATHS.invoices, Facts],
  [BUSINESS_ROUTE_PATHS.reconciliation, Facts],
])
const FACT_MODULES = new Map([
  [BUSINESS_ROUTE_PATHS.productionProgress, 'production-progress'],
  [BUSINESS_ROUTE_PATHS.receivables, 'receivables'],
  [BUSINESS_ROUTE_PATHS.payables, 'payables'],
  [BUSINESS_ROUTE_PATHS.invoices, 'invoices'],
  [BUSINESS_ROUTE_PATHS.reconciliation, 'reconciliation'],
])

export default function WorkflowTaskBusinessPage() {
  const context = useBusinessPageContext()
  const { mode, task } = context.taskBusiness
  const Page = PAGES.get(context.taskFormPath)
  if (isEngineeringMaterialTask(task) && mode === 'source') return <WorkflowTaskMaterialForm />
  if (task.task_group === 'handoff_receipt_replacement' && mode === 'source') return <WorkflowTaskReceiptReplacementForm />
  return (
    <React.Suspense fallback={<Spin />}>
      {mode === 'payment' ? <PaymentEntry task={task} profile={context.adminProfile} />
        : Page ? <Page key={context.taskFormScope} {...(Page === Facts ? { moduleKey: FACT_MODULES.get(context.taskFormPath) } : {})} {...(Page === ProductionExceptions ? { adminProfile: context.adminProfile } : {})} /> : <p>当前任务的业务资料暂不可用，请重新读取任务。</p>}
    </React.Suspense>
  )
}
