import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'

const BusinessEditorGroupContext = createContext(null)

function GroupNavigationGuard({ confirmLeave }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search || currentLocation.hash !== nextLocation.hash)
  useEffect(() => {
    if (blocker.state !== 'blocked') return undefined
    let active = true
    confirmLeave().then((allowed) => {
      if (!active) return
      if (allowed) blocker.proceed()
      else blocker.reset()
    })
    return () => { active = false }
  }, [blocker, confirmLeave])
  return null
}

export function useBusinessEditorGroup() {
  return useContext(BusinessEditorGroupContext)
}

// Several independent business objects share one task leave boundary.
export default function BusinessEditorGroup({ children }) {
  const context = useBusinessPageContext()
  const guards = useRef(new Map())
  const editing = useRef(new Set())
  const states = useRef(new Map())
  const [protectedState, setProtectedState] = useState(false)
  const [hasEditors, setHasEditors] = useState(false)
  const [busy, setBusy] = useState(false)
  const reportEditing = context?.taskBusiness?.onFormEditingChange
  const registerHostGuard = context?.registerPageLeaveGuard
  const registerGuard = useCallback((owner, guard) => {
    guards.current.set(owner, guard)
    return () => guards.current.delete(owner)
  }, [])
  const setEditing = useCallback((owner, open) => {
    if (open) editing.current.add(owner)
    else editing.current.delete(owner)
    setHasEditors(editing.current.size > 0)
    reportEditing?.(editing.current.size > 0)
  }, [reportEditing])
  const confirmLeave = useCallback(async (options) => {
    for (const guard of guards.current.values()) if (!(await guard(options))) return false
    return true
  }, [])
  const updateState = useCallback((owner, dirty, saving, metadata = {}) => {
    if (dirty || saving) states.current.set(owner, { ...metadata, dirty, saving })
    else states.current.delete(owner)
    setProtectedState(states.current.size > 0)
    setBusy([...states.current.values()].some((state) => state.saving))
  }, [])
  const pending = useCallback((form) => [...states.current.values()].filter((state) => !form || state.form !== form), [])
  useEffect(() => hasEditors ? registerHostGuard?.(confirmLeave) : undefined, [confirmLeave, registerHostGuard, hasEditors])
  useEffect(() => () => reportEditing?.(false), [reportEditing])
  const value = useMemo(() => ({ registerGuard, setEditing, confirmLeave, updateState, pending, busy }), [registerGuard, setEditing, confirmLeave, updateState, pending, busy])
  return <BusinessEditorGroupContext.Provider value={value}>{protectedState ? <GroupNavigationGuard confirmLeave={confirmLeave} /> : null}{children}</BusinessEditorGroupContext.Provider>
}
