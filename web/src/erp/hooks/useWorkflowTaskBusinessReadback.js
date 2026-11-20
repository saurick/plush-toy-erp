import { useEffect, useRef, useState } from 'react'
import useWorkflowTaskActionAccess from './useWorkflowTaskActionAccess.js'
import { loadWorkflowTaskBusinessReadback } from '../utils/workflowTaskBusinessReadback.mjs'
import { isTerminalWorkflowTask } from '../utils/workflowTaskLifecycle.mjs'
import { resolveMobileTaskBusinessEntry } from '../mobile/utils/mobileTaskBusiness.mjs'

export default function useWorkflowTaskBusinessReadback({ task, profile, enabled = true }) {
  const shouldRead = Boolean(enabled && profile?.id && task && isTerminalWorkflowTask(task) && resolveMobileTaskBusinessEntry(task))
  const access = useWorkflowTaskActionAccess({ task, adminProfile: profile, enabled: shouldRead })
  const allowed = shouldRead && access.source === 'backend' && access.sourceAccess?.allowed === true
  const key = `${profile?.id}:${task?.id}:${task?.version}:${task?.source_type}:${task?.source_id}`
  const latest = useRef(task)
  latest.current = task
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!allowed) return undefined
    const controller = new AbortController()
    setResult({ key, state: 'loading' })
    loadWorkflowTaskBusinessReadback(latest.current, { signal: controller.signal, profile }).then((summary) => {
      if (!controller.signal.aborted) setResult({ key, state: 'ready', summary })
    }).catch(() => { if (!controller.signal.aborted) setResult({ key, state: 'error' }) })
    return () => controller.abort()
  }, [allowed, key, profile, retry])
  return allowed && result?.key === key ? { ...result, retry: () => setRetry((value) => value + 1) } : null
}
