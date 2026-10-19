import React from 'react'
import { Spin } from 'antd'
import { useOutletContext } from 'react-router-dom'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import { BUSINESS_ROUTE_PATHS } from '../../utils/masterDataOrderView.mjs'

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
const PaymentEntry = lazyWithDynamicImportRetry(() => import('./MobileTaskPaymentAction.jsx'))

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
])

export default function MobileTaskFactPage() {
  const context = useOutletContext()
  const { mode, task, returnToTaskForm } = context.mobileTaskBusiness
  const Page = PAGES.get(context.taskFormPath)
  return (
    <React.Suspense fallback={<Spin />}>
      {mode === 'payment' ? <PaymentEntry task={task} profile={context.adminProfile} onClose={returnToTaskForm} />
        : Page ? <Page key={context.taskFormScope} {...(Page === Facts ? { moduleKey: 'production-progress' } : {})} /> : <p>此任务请使用原处理表单办理。</p>}
    </React.Suspense>
  )
}
