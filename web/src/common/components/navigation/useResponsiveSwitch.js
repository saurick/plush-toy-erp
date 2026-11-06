import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'

// Commit selection first; start expensive content work after that frame can paint.
export default function useResponsiveSwitch(value, resetKey = value) {
  const current = useRef(value)
  const sequence = useRef(0)
  const queued = useRef(null)
  const [intent, setIntent] = useState(null)
  const [transitionPending, startTransition] = useTransition()
  const cancelQueued = useCallback(() => {
    if (!queued.current) return
    cancelAnimationFrame(queued.current.frame)
    clearTimeout(queued.current.task)
    queued.current = null
  }, [])
  const cancel = useCallback(() => {
    sequence.current += 1
    cancelQueued()
    setIntent(null)
  }, [cancelQueued])
  useLayoutEffect(() => {
    current.current = value
    cancel()
  }, [value, resetKey, cancel])
  useEffect(() => () => {
    sequence.current += 1
    cancelQueued()
  }, [cancelQueued])

  const request = useCallback(async (target, commit, { before, defer = true } = {}) => {
    const id = ++sequence.current
    cancelQueued()
    // Leave confirmation and saving guards must finish before selection changes.
    if (before && !(await before())) {
      if (id === sequence.current) setIntent(null)
      return false
    }
    if (id !== sequence.current) return false
    if (!defer) {
      setIntent(null)
      commit()
      return true
    }
    // An async guard loses the click's discrete priority; commit only its small feedback update here.
    flushSync(() => setIntent({ source: current.current, target }))
    const work = { frame: 0, task: 0 }
    queued.current = work
    work.frame = requestAnimationFrame(() => {
      work.task = setTimeout(() => {
        if (id !== sequence.current) return
        queued.current = null
        startTransition(() => commit())
      }, 0)
    })
    return true
  }, [cancelQueued])

  const selected = intent?.source === value ? intent.target : value
  const pending = Boolean(intent && (selected !== value || transitionPending))
  return { selected, pending, request, cancel }
}
