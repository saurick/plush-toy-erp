import React, { useMemo } from 'react'
import { Button, Space, Typography } from 'antd'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { usePurchaseOrderContractPrint } from '../purchase-orders/usePurchaseOrderContractPrint.mjs'
import { getEffectivePrintTemplateDefaults } from '../../utils/adminProfileSync.mjs'
import { MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY } from '../../utils/printWorkspace.js'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'
import { mobileBusinessPath, mobileBusinessRole } from '../../utils/businessTaskRoute.mjs'
import { workflowTaskEntryNavigation } from '../../utils/workflowTaskNavigation.mjs'

export default function EngineeringMaterialPurchaseOrders({
  request,
  canOpen = false,
  onOpen,
  task,
  adminID,
}) {
  const { adminProfile } = useOutletContext() || {}
  const location = useLocation()
  const navigate = useBusinessNavigate()
  const roleKey = mobileBusinessRole(location.pathname)
  const orderPath = (id) => mobileBusinessPath(`/erp/purchase/accessories?purchase_order_id=${id}`, roleKey)
  const printTemplateDefaults = useMemo(
    () =>
      getEffectivePrintTemplateDefaults(
        adminProfile,
        MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY
      ),
    [adminProfile]
  )
  const { printPurchaseContracts, printingContract } =
    usePurchaseOrderContractPrint({
      printTemplateDefaults,
      customerKey: adminProfile?.effective_session?.customer?.key || '',
      accountKey: adminProfile?.id,
      configRevision: adminProfile?.effective_session?.config_revision || '',
    })
  const orders = request?.purchase_orders || []
  if (request?.status !== 'APPROVED' || orders.length === 0) return null
  return (
    <Space
      direction="vertical"
      size={8}
      style={{ width: '100%' }}
      aria-label="生成的采购订单"
    >
      <Typography.Text strong>
        已生成 {orders.length} 张采购订单（按供应商分单）
      </Typography.Text>
      {canOpen && !roleKey ? (
        <Button
          type="primary"
          loading={printingContract}
          onClick={() =>
            printPurchaseContracts(orders, { sourceLabel: request.order_no })
          }
        >
          打印本次采购合同
        </Button>
      ) : null}
      {orders.map((order) => (
        <Space key={order.id} wrap size={[12, 4]}>
          {canOpen ? (
            <Link
              to={orderPath(order.id)}
              onClick={(event) => {
                onOpen?.(event)
                if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                const path = orderPath(order.id)
                navigate(path, task ? workflowTaskEntryNavigation(task, path, `${location.pathname}${location.search}`, adminID ?? adminProfile?.id) : undefined)
              }}
            >
              {order.purchase_order_no}
            </Link>
          ) : (
            <Typography.Text>{order.purchase_order_no}</Typography.Text>
          )}
          <Typography.Text type="secondary">
            {order.supplier_name || '供应商名称未填写'}
          </Typography.Text>
        </Space>
      ))}
    </Space>
  )
}
