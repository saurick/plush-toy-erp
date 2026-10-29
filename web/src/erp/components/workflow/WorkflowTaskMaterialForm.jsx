import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Spin } from 'antd'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { getEngineeringMaterialTaskContext } from '../../utils/engineeringMaterialTask.mjs'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import EngineeringMaterialTaskAction from '../sales-orders/EngineeringMaterialTaskAction.jsx'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'

const EngineeringWorkspace = lazyWithDynamicImportRetry(() => import('../sales-orders/SalesOrderEngineeringModal.jsx'))

export default function WorkflowTaskMaterialForm() {
  const context = useBusinessPageContext()
  const { taskBusiness } = context
  const reportResult = useWorkflowTaskBusinessResult()
  const leaveGuard = useRef(null)
  const register = context.registerPageLeaveGuard
  const canViewWorkspace = hasActionPermission(context.adminProfile, PermissionCode.SALES_ORDER_READ) && [PermissionCode.PRODUCT_READ, PermissionCode.PRODUCT_SKU_READ, PermissionCode.BOM_READ, PermissionCode.MATERIAL_READ].every((permission) => hasActionPermission(context.adminProfile, permission))
  const revisionOrderID = canViewWorkspace && taskBusiness.task?.task_group === 'engineering_material_revision' ? getEngineeringMaterialTaskContext(taskBusiness.task)?.orderID : null
  useEffect(() => revisionOrderID ? undefined : register?.(() => leaveGuard.current?.() ?? true), [register, revisionOrderID])
  if (revisionOrderID) return <React.Suspense fallback={<Spin />}><EngineeringWorkspace orderID={revisionOrderID} materialTask={taskBusiness.task} /></React.Suspense>
  return <EngineeringMaterialTaskAction
    task={taskBusiness.task}
    profile={context.adminProfile}
    mobile={taskBusiness.device === 'mobile'}
    readOnly={taskBusiness.readOnly}
    leaveGuardRef={leaveGuard}
    onBusyChange={taskBusiness.onBusyChange}
    onChanged={(record, result) => reportResult(result.successMessage, record)}
    render={({ content, footer }) => (
      <>
        {content}{taskBusiness.actionHost ? createPortal(footer, taskBusiness.actionHost) : footer}
      </>
    )}
  />
}
