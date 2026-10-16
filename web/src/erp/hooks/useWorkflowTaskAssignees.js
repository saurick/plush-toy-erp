import { useCallback, useEffect, useState } from 'react'
import { getWorkflowTaskBoard } from '../api/workflowApi.mjs'

export default function useWorkflowTaskAssignees(profile, roleKey = '', enabled = true) {
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const scope = `${profile?.id}:${roleKey}:${JSON.stringify(profile?.effective_session || profile?.permissions || [])}`
  useEffect(() => {
    if (!enabled || !profile?.id) return undefined
    const controller = new AbortController()
    getWorkflowTaskBoard(
      { limit: 1, offset: 0, ...(roleKey ? { owner_role_key: roleKey } : {}) },
      { signal: controller.signal }
    ).then((data) => {
      if (!controller.signal.aborted) setResult({ scope, people: data.assignees || [], sourceTypes: data.source_types || [] })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ scope, people: [], error: true })
    })
    return () => controller.abort()
  }, [enabled, profile?.id, roleKey, scope, revision])
  return { ...(result?.scope === scope ? result : { people: [], error: false }), reload }
}
