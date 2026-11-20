import React from 'react'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import EngineeringMaterialRequestForm from './EngineeringMaterialRequestForm.jsx'
import { ENGINEERING_MATERIAL_STATUS as STATUS } from '../../utils/engineeringMaterialTask.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'

export default function EngineeringMaterialRequestModal(props) {
  const { mobile = false, readOnly: sourceReadOnly = false, orderID, onCancel, onChanged, permissions: sourcePermissions, onBusyChange: sourceBusyChange } = props
  const taskBusiness = useBusinessPageContext()?.taskBusiness
  const readOnly = sourceReadOnly || taskBusiness?.readOnly === true
  const reportResult = useWorkflowTaskBusinessResult()
  return (
    <EngineeringMaterialRequestForm
      {...props}
      readOnly={readOnly}
      permissions={taskBusiness ? { ...sourcePermissions, boss: false, finance: false } : sourcePermissions}
      onBusyChange={taskBusiness?.onBusyChange || sourceBusyChange}
      onChanged={(record, result) => { reportResult(result.successMessage, record); onChanged?.(record, result) }}
      render={({ content, footer, title, request, saving, discardThen, form }) => (
        <BusinessFormModal
          taskInline
          form={form}
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
              : '工程资料齐全后自动送老板审核，财务审核通过后按厂商生成采购订单。展开材料可核对产品与部位用量。'
          }
          size="lineItems"
          width={mobile ? '100%' : undefined}
          centered={!mobile}
          closable={!saving}
          maskClosable={!saving}
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
