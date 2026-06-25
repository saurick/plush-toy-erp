import React from 'react'
import { Form } from 'antd'

import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import {
  SalesOrderFormFields,
  SalesOrderItemsFormSection,
} from './SalesOrderForm.jsx'

export default function SalesOrderBusinessModal({
  open,
  form,
  editingOrder,
  saving,
  itemLoading,
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
  return (
    <BusinessFormModal
      title={editingOrder?.id ? '编辑销售订单' : '新建销售订单'}
      description="只维护客户订单承诺，不在此写出货、库存或财务事实。"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={saving || itemLoading}
      forceRender
      destroyOnHidden={false}
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
          description="上传客户 PO、合同、样品图或确认截图；附件不改变订单生命周期。"
          canUpload={canUpdateOrder || canCreateOrder}
          canDelete={canUpdateOrder}
          variant="inline"
        />
        <SalesOrderItemsFormSection
          form={form}
          canCreateItem={canCreateItem}
          canUpdateItem={canUpdateItem}
          canCancelItem={canCancelItem}
          productSKUs={productSKUs}
          unitOptions={unitOptions}
        />
      </Form>
    </BusinessFormModal>
  )
}
