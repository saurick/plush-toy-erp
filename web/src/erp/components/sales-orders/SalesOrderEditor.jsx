import React, { useEffect, useState } from 'react'
import { Alert, Button, Form } from 'antd'
import { getActionErrorMessage } from '../../../common/utils/errorMessage.js'
import { listBusinessAttachments } from '../../api/attachmentApi.mjs'

import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
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
  const [attachmentLoadState, setAttachmentLoadState] = useState('ready')
  const [attachmentLoadError, setAttachmentLoadError] = useState('')
  const [attachmentRetry, setAttachmentRetry] = useState(0)
  useEffect(() => {
    let active = true
    setAttachments([])
    setAttachmentLoadError('')
    if (open && editingOrder?.id) {
      setAttachmentLoadState('loading')
      listBusinessAttachments({
        owner_type: 'sales_order',
        owner_id: editingOrder.id,
      })
        .then((items) => {
          if (!active) return
          setAttachments(items)
          setAttachmentLoadState('ready')
        })
        .catch((error) => {
          if (!active) return
          setAttachmentLoadError(getActionErrorMessage(error, '加载订单附件'))
          setAttachmentLoadState('error')
        })
    } else {
      setAttachmentLoadState('ready')
    }
    return () => {
      active = false
    }
  }, [open, editingOrder?.id, attachmentRetry])
  return (
    <BusinessFormPage
      form={form}
      title={editingOrder?.id ? '编辑销售订单' : '新建销售订单'}
      okText={
        !editingOrder || editingOrder.lifecycle_status === 'draft'
          ? '保存草稿'
          : '保存'
      }
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={saving}
      loading={itemLoading || referencesLoading}
    >
      <Form form={form} layout="vertical" className="erp-business-action-form">
        <SalesOrderFormFields
          itemsSection={
            <BusinessFormSection
              title="订货明细"
              showHeading={false}
              layout="content"
            >
              {attachmentLoadState === 'error' ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="订单附件加载失败"
                  description={attachmentLoadError}
                  action={
                    <Button
                      onClick={() => setAttachmentRetry((retry) => retry + 1)}
                    >
                      重试读取附件
                    </Button>
                  }
                />
              ) : null}
              <SalesOrderItemsFormSection
                form={form}
                canCreateItem={canCreateItem}
                canUpdateItem={canUpdateItem}
                canCancelItem={canCancelItem}
                productSKUs={productSKUs}
                unitOptions={unitOptions}
                orderID={editingOrder?.id}
                orderAttachments={attachments}
                orderAttachmentLoadState={attachmentLoadState}
              />
            </BusinessFormSection>
          }
          attachmentPanel={
            <BusinessAttachmentPanel
              ref={orderAttachmentRef}
              ownerType="sales_order"
              ownerId={editingOrder?.id}
              title="订单附件"
              description="上传客户 PO、合同、样品图或确认截图；附件不改变订单状态。"
              canUpload={canUpdateOrder || canCreateOrder}
              canWithdraw={canCreateOrder || canUpdateOrder}
              variant="inline"
              compact
            />
          }
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
      </Form>
    </BusinessFormPage>
  )
}
