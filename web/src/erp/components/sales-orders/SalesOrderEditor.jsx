import React, { useEffect, useState } from 'react'
import { Form } from 'antd'
import { listBusinessAttachments } from '../../api/attachmentApi.mjs'

import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import {
  SalesOrderFormFields,
  SalesOrderItemsFormSection,
} from './SalesOrderForm.jsx'

export default function SalesOrderEditor({
  open,
  form,
  editingOrder,
  saving,
  itemLoading,
  referencesLoading,
  orderAttachmentRef,
  customers,
  customerContacts,
  salesOwnerOptions,
  paymentConditionOptions,
  unitOptions,
  productSKUs,
  canCreateOrder,
  canUpdateOrder,
  canCreateItem,
  canUpdateItem,
  canCancelItem,
  onOk,
  onCancel,
  onCustomerChange,
  onContactSelect,
  onPaymentMethodChange,
  onPaymentConditionBlur,
}) {
  const [attachments, setAttachments] = useState([])
  useEffect(() => {
    let active = true
    setAttachments([])
    if (open && editingOrder?.id) listBusinessAttachments({ owner_type: 'sales_order', owner_id: editingOrder.id }).then((items) => { if (active) setAttachments(items) }).catch(() => { if (active) setAttachments([]) })
    return () => { active = false }
  }, [open, editingOrder?.id])
  return (
    <BusinessFormPage
      form={form}
      title={editingOrder?.id ? '编辑销售订单' : '新建销售订单'}
      description="先记录客户订货需求；工程可在订单草稿阶段完善产品、物料清单并安排打样。"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={saving}
      loading={itemLoading || referencesLoading}
    >
      <Form form={form} layout="vertical" className="erp-business-action-form">
        <SalesOrderFormFields
          form={form}
          customers={customers}
          contactOptions={customerContacts}
          salesOwnerOptions={salesOwnerOptions}
          paymentConditionOptions={paymentConditionOptions}
          onCustomerChange={onCustomerChange}
          onContactSelect={onContactSelect}
          onPaymentMethodChange={onPaymentMethodChange}
          onPaymentConditionBlur={onPaymentConditionBlur}
        />
        <BusinessAttachmentPanel
          ref={orderAttachmentRef}
          ownerType="sales_order"
          ownerId={editingOrder?.id}
          title="订单附件"
          description="上传客户 PO、合同、样品图或确认截图；附件不改变订单状态。"
          canUpload={canUpdateOrder || canCreateOrder}
          canWithdraw={canCreateOrder || canUpdateOrder}
          variant="inline"
        />
        <SalesOrderItemsFormSection
          form={form}
          canCreateItem={canCreateItem}
          canUpdateItem={canUpdateItem}
          canCancelItem={canCancelItem}
          productSKUs={productSKUs}
          unitOptions={unitOptions}
          orderID={editingOrder?.id}
          orderAttachments={attachments}
        />
      </Form>
    </BusinessFormPage>
  )
}
