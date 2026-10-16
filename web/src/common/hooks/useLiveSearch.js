import { useCallback, useEffect, useRef, useState } from 'react'

export const LIVE_SEARCH_DELAY_MS = 300

const normalizeSearchValue = (value) => String(value ?? '').trim()

export default function useLiveSearch({
  value = '',
  onSearch,
  delay = LIVE_SEARCH_DELAY_MS,
}) {
  const [draft, setDraft] = useState(() => String(value ?? ''))
  const timerRef = useRef(null)
  const composingRef = useRef(false)
  const submittedValueRef = useRef(normalizeSearchValue(value))
  const pendingCommitRef = useRef()
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  const cancelPendingSearch = useCallback(() => {
    if (timerRef.current === null) return
    globalThis.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const submitSearch = useCallback(
    (nextValue, immediate = false) => {
      cancelPendingSearch()
      const normalizedValue = normalizeSearchValue(nextValue)
      const submit = () => {
        if (normalizedValue === submittedValueRef.current) return
        submittedValueRef.current = normalizedValue
        pendingCommitRef.current = normalizedValue
        onSearchRef.current?.(normalizedValue)
      }
      if (immediate || !normalizedValue || delay <= 0) {
        submit()
        return
      }
      timerRef.current = globalThis.setTimeout(() => {
        timerRef.current = null
        submit()
      }, delay)
    },
    [cancelPendingSearch, delay]
  )

  useEffect(() => {
    const nextValue = String(value ?? '')
    const normalizedValue = normalizeSearchValue(nextValue)
    if (
      pendingCommitRef.current !== undefined &&
      pendingCommitRef.current === normalizedValue
    ) {
      pendingCommitRef.current = undefined
      setDraft((currentValue) =>
        normalizeSearchValue(currentValue) === normalizedValue
          ? nextValue
          : currentValue
      )
      return
    }
    cancelPendingSearch()
    pendingCommitRef.current = undefined
    submittedValueRef.current = normalizedValue
    setDraft(nextValue)
  }, [cancelPendingSearch, value])

  useEffect(() => () => cancelPendingSearch(), [cancelPendingSearch])

  return {
    value: draft,
    onChange: (event) => {
      const nextValue = event.currentTarget.value
      setDraft(nextValue)
      if (!composingRef.current && !event.nativeEvent?.isComposing) {
        submitSearch(nextValue)
      }
    },
    onCompositionStart: () => {
      composingRef.current = true
      cancelPendingSearch()
    },
    onCompositionEnd: (event) => {
      const nextValue = event.currentTarget.value
      composingRef.current = false
      setDraft(nextValue)
      submitSearch(nextValue)
    },
    onPressEnter: (event) => {
      if (
        composingRef.current ||
        event.nativeEvent?.isComposing ||
        event.nativeEvent?.keyCode === 229
      ) {
        return
      }
      submitSearch(event.currentTarget.value, true)
    },
  }
}
