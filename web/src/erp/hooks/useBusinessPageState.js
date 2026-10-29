import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, } from 'react-router-dom'
import useBusinessPageContext from './useBusinessPageContext.js'

const BusinessPageStateScope = createContext('')
export const BusinessPageStateScopeProvider = BusinessPageStateScope.Provider

// UI preferences live only for the current verified desktop session. API rows,
// permissions, drafts and business facts always reload from their own sources.
export default function useBusinessPageState(name, initialValue) {
  const { pathname } = useLocation()
  const scope = useContext(BusinessPageStateScope)
  const context = useBusinessPageContext()
  const fallback = useRef(new Map())
  const cache = context?.pageUIState?.values || fallback.current
  const key = `${pathname}:${scope ? `${scope}:` : ''}${name}`
  const [value, setValue] = useState(() =>
    cache.has(key)
      ? cache.get(key)
      : typeof initialValue === 'function'
        ? initialValue()
        : initialValue
  )
  // Filters can update their URL scope in the same render as their value.
  // Persist the resulting scope too, so clearing then reopening stays cleared.
  useEffect(() => {
    cache.set(key, value)
  }, [cache, key, value])
  const update = useCallback(
    (next) => {
      setValue((current) => {
        const result = typeof next === 'function' ? next(current) : next
        cache.set(key, result)
        return result
      })
    },
    [cache, key]
  )
  return [value, update]
}
