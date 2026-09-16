import React from 'react'
import { Space, Typography } from 'antd'
import { Link } from 'react-router-dom'

export default function EngineeringMaterialPurchaseOrders({ request, canOpen = false, onOpen }) {
  const orders = request?.purchase_orders || []
  if (request?.status !== 'APPROVED' || orders.length === 0) return null
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }} aria-label="生成的采购订单">
      <Typography.Text strong>已生成 {orders.length} 张采购订单（按供应商分单）</Typography.Text>
      {orders.map((order) => (
        <Space key={order.id} wrap size={[12, 4]}>
          {canOpen ? (
            <Link to={`/erp/purchase/accessories?purchase_order_id=${order.id}`} onClick={onOpen}>
              {order.purchase_order_no}
            </Link>
          ) : <Typography.Text>{order.purchase_order_no}</Typography.Text>}
          <Typography.Text type="secondary">{order.supplier_name || '供应商名称未填写'}</Typography.Text>
        </Space>
      ))}
    </Space>
  )
}
