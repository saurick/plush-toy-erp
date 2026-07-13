import React from 'react'

import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import { PurchaseOrderFormFields } from './PurchaseOrderForm.jsx'

export default function PurchaseOrderBusinessModal({
  open,
  form,
  editingOrder,
  saving,
  itemsLoading,
  orderAttachmentRef,
  suppliers,
  materials,
  unitOptions,
  canCreate,
  canUpdate,
  onOk,
  onCancel,
  onSupplierChange,
  onMaterialChange,
}) {
  return (
    <BusinessFormModal
      open={open}
      title={editingOrder ? '编辑采购订单' : '新建采购订单'}
      description="只维护采购承诺，入库、质检、库存或应付请到对应业务页面处理。"
      okText="保存"
      confirmLoading={saving || itemsLoading}
      onOk={onOk}
      onCancel={onCancel}
      destroyOnHidden
      forceRender
    >
      <PurchaseOrderFormFields
        form={form}
        suppliers={suppliers}
        materials={materials}
        unitOptions={unitOptions}
        onSupplierChange={onSupplierChange}
        onMaterialChange={onMaterialChange}
        attachmentPanel={
          <BusinessAttachmentPanel
            ref={orderAttachmentRef}
            ownerType="purchase_order"
            ownerId={editingOrder?.id}
            title="采购附件"
            description="上传供应商报价、签回采购单、到货要求或价格确认资料；上传附件不会改变采购订单状态。"
            canUpload={canUpdate || canCreate}
            canDelete={canUpdate}
            variant="inline"
          />
        }
      />
    </BusinessFormModal>
  )
}
