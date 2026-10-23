import { useEffect, useRef, useState } from 'react'

const normalize = (value) => String(value ?? '').trim()

// Acknowledging a submitted query must not overwrite newer, unsubmitted typing.
export default function useSubmittedSearch({ value = '', onSearch, resetKey }) {
  const [draft, setDraft] = useState(() => String(value ?? ''))
  const composing = useRef(false)
  const submitted = useRef(normalize(value))
  const pending = useRef()
  const previousResetKey = useRef(resetKey)

  useEffect(() => {
    const next = String(value ?? '')
    const normalized = normalize(next)
    const reset = previousResetKey.current !== resetKey
    previousResetKey.current = resetKey
    if (
      !reset &&
      pending.current !== undefined &&
      pending.current === normalized
    ) {
      pending.current = undefined
      setDraft((current) =>
        normalize(current) === normalized ? next : current
      )
      return
    }
    pending.current = undefined
    submitted.current = normalized
    composing.current = false
    setDraft(next)
  }, [value, resetKey])

  const commit = (next) => {
    const normalized = normalize(next)
    setDraft(normalized)
    if (normalized !== submitted.current) {
      submitted.current = normalized
      pending.current = normalized
      onSearch?.(normalized)
    }
  }

  return {
    value: draft,
    onChange: (event) => setDraft(event.currentTarget.value),
    onCompositionStart: () => {
      composing.current = true
    },
    onCompositionEnd: (event) => {
      composing.current = false
      setDraft(event.currentTarget.value)
    },
    cancel: () => {
      composing.current = false
      setDraft(submitted.current)
    },
    clear: () => {
      composing.current = false
      commit('')
    },
    submit: (next, event) => {
      if (
        composing.current ||
        event?.nativeEvent?.isComposing ||
        event?.nativeEvent?.keyCode === 229
      ) {
        return false
      }
      commit(next)
      return true
    },
  }
}
