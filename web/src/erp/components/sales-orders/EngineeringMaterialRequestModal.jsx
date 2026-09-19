import React from 'react'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import EngineeringMaterialRequestForm from './EngineeringMaterialRequestForm.jsx'
import { ENGINEERING_MATERIAL_STATUS as STATUS } from '../../utils/engineeringMaterialTask.mjs'

export default function EngineeringMaterialRequestModal(props) {
  const { mobile = false, readOnly = false, orderID, onCancel } = props
  return (
    <EngineeringMaterialRequestForm
      {...props}
      render={({ content, footer, title, request, saving, discardThen }) => (
        <BusinessFormModal
          className={
            mobile
              ? 'erp-material-summary-modal erp-material-summary-modal--mobile'
              : 'erp-material-summary-modal'
          }
          title={
            mobile
              ? `${title}${readOnly && request?.status ? ` · ${STATUS[request.status] || request.status}` : ''}`
              : `${title}${request?.order_no ? ` · ${request.order_no}` : ''}`
          }
          description={
            mobile || readOnly
              ? undefined
              : '工程提交用料，老板审核，财务审核通过后按厂商生成采购订单。展开材料可核对产品与部位用量。'
          }
          size="lineItems"
          width={mobile ? '100%' : undefined}
          centered={!mobile}
          closable={!saving}
          open={Boolean(orderID)}
          onCancel={() => discardThen(onCancel)}
          footer={footer}
        >
          {content}
        </BusinessFormModal>
      )}
    />
  )
}
