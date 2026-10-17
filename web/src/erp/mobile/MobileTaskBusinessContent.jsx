import React, { useState } from 'react'
import { Button, Spin } from 'antd'
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import { workflowTaskNavigationState } from '../utils/workflowTaskNavigation.mjs'

const MobileTaskPaymentAction = lazyWithDynamicImportRetry(() => import('./components/MobileTaskPaymentAction.jsx'))

export default function MobileTaskBusinessContent() {
  const context = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const { roleKey } = useParams()
  const [paymentView, setPaymentView] = useState(false)
  const { task, canRegisterPayment, confirmLeave, commands = [], relatedCommand } = context.mobileTaskBusiness
  const openPayment = async () => {
    if (await confirmLeave()) setPaymentView(true)
  }
  if (paymentView && canRegisterPayment) {
    return (
      <React.Suspense fallback={<Spin />}>
        <MobileTaskPaymentAction task={task} profile={context.adminProfile} onClose={() => setPaymentView(false)} />
      </React.Suspense>
    )
  }
  const openRelated = async (command) => {
    if (!(await confirmLeave())) return
    const to = `/m/${roleKey}/tasks/${task.id}/handle/related/${command.kind}`
    navigate(to, { state: workflowTaskNavigationState(location.state, { ...context.workflowTaskNavigation, businessReceipt: undefined }, to) })
  }
  return (
    <>
      <Outlet context={context} />
      {!relatedCommand && (canRegisterPayment || commands.length > 0) ? (
        <div className="mobile-task-business-actions">
          {canRegisterPayment ? <Button onClick={openPayment}>登记本次实际收付</Button> : null}
          {commands.map((command) => <Button key={command.kind} onClick={() => openRelated(command)}>{command.label}</Button>)}
        </div>
      ) : null}
    </>
  )
}
