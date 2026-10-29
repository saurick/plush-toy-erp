import { useCallback, useMemo, useRef, useState } from 'react'

// Preserve the last source presentation while a task opens a related editor.
// A different account, task version or source cannot reuse this presentation.
export default function useTaskBusinessInformation(scopeKey) {
  const scope = useRef(scopeKey)
  scope.current = scopeKey
  const staged = useRef(null)
  const [host, setHost] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const stage = useCallback((key, content) => {
    if (scope.current === key) staged.current = { key, content }
  }, [])
  const retain = useCallback((key) => {
    if (scope.current === key && staged.current?.key === key) setSnapshot(staged.current)
  }, [])
  const release = useCallback((key) => {
    if (scope.current === key) {
      staged.current = null
      setSnapshot(null)
    }
  }, [])
  return useMemo(() => ({ host, setHost, scopeKey, stage, retain, release, retained: snapshot?.key === scopeKey ? snapshot.content : null }), [host, scopeKey, stage, retain, release, snapshot])
}
