import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MobileTaskFlowHeaderView, MobileTaskHeaderContext } from './MobileTaskFlowHeader.jsx'
import { TaskBusinessInformationContext, TaskBusinessStepVisibleContext } from '../../hooks/useBusinessPageContext.js'
import useTaskBusinessInformation from '../../hooks/useTaskBusinessInformation.js'

function VisitedTaskSteps({ activeStep, version, children, panels, overlay }) {
  const visited = useRef({})
  const cachedVersion = useRef(version)
  const elements = useRef({})
  const positions = useRef(new Map())
  const [header, setHeader] = useState(null)
  const information = useTaskBusinessInformation(version)
  const headerOwner = useMemo(() => ({ step: { detail: 'detail', action: 'process', receipt: 'result' }[activeStep], register: setHeader }), [activeStep])
  if (cachedVersion.current !== version) {
    visited.current = {}
    positions.current.clear()
    cachedVersion.current = version
  }
  Object.assign(visited.current, panels, { [activeStep]: children })
  useLayoutEffect(() => {
    const pane = elements.current[activeStep]
    const scroller = pane?.querySelector('.mobile-role-tasks-page__detail-main')
    pane?.querySelector('h1')?.focus({ preventScroll: true })
    if (!scroller) return undefined
    scroller.scrollTop = positions.current.get(activeStep) || 0
    const save = () => { if (!pane.hidden) positions.current.set(activeStep, scroller.scrollTop) }
    scroller.addEventListener('scroll', save, { passive: true })
    return () => scroller.removeEventListener('scroll', save)
  }, [activeStep, version])
  return (
    <TaskBusinessInformationContext.Provider value={information}>
      <MobileTaskHeaderContext.Provider value={headerOwner}>
        <div className="mobile-task-step-panels">
          {header ? <MobileTaskFlowHeaderView {...header} /> : null}
          {['detail', 'action', 'receipt'].map((step) => (
            <div
              key={step}
              ref={(element) => {
            elements.current[step] = element
          }}
              data-task-panel={step}
              hidden={step !== activeStep}
              style={{ display: step === activeStep ? 'contents' : 'none' }}
            >
              <TaskBusinessStepVisibleContext.Provider value={step === activeStep}>
                {visited.current[step] || null}
              </TaskBusinessStepVisibleContext.Provider>
            </div>
      ))}
        </div>
        {overlay}
      </MobileTaskHeaderContext.Provider>
    </TaskBusinessInformationContext.Provider>
  )
}

// A new task version clears inactive snapshots without resetting the current
// form's navigation. Account or task changes still replace every panel.
export default function MobileTaskStepPanels({ scopeKey, ...props }) {
  return <VisitedTaskSteps key={scopeKey} {...props} />
}
