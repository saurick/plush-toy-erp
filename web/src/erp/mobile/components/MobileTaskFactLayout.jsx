import React from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import WorkflowTaskBusinessWorkspace from '../../components/workflow/WorkflowTaskBusinessWorkspace.jsx'

export default function MobileTaskFactLayout() {
  const context = useOutletContext()
  return <WorkflowTaskBusinessWorkspace controls={context.taskFactHandling} renderPage={(value) => <Outlet context={value} />} />
}
