import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyBusinessChainDraft, parseBusinessChainDraft } from '../../config/devBusinessChainDesign.mjs'
import { showBusinessChainWhole, arrangeBusinessChainMap } from '../../config/devBusinessChainMap.mjs'

export const CHAIN_DESIGN_WORKING_KEY = 'plush-workbench:business-chain-design:working'

const equal = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)

function blankState() {
  const draft = {
    ...emptyBusinessChainDraft(),
    presentation: { mode: 'mainline', highlightedRoles: [], layout: 'lanes', layers: ['normal'] },
  }
  return { draft, initialDraft: draft, past: [], future: [], issue: '', restoreFailed: false }
}

function initialState(library, initialRange, startBlank) {
  const state = blankState()
  if (startBlank) return state
  try {
    const raw = window.sessionStorage.getItem(CHAIN_DESIGN_WORKING_KEY) ?? window.localStorage.getItem(CHAIN_DESIGN_WORKING_KEY)
    if (raw !== null) {
      const working = JSON.parse(raw)
      // Earlier working records stored the draft directly.
      const draft = parseBusinessChainDraft(Array.isArray(working?.nodes) ? raw : JSON.stringify(working.draft), library)
      return { ...state, draft }
    }
  } catch {
    return { ...state, restoreFailed: true, issue: '上次探索无法读取，浏览器仍保留原记录。可新建空白视图重新开始。' }
  }
  if (!initialRange) return state
  const mode = initialRange === 'all' ? 'overview' : 'mainline'
  const draft = arrangeBusinessChainMap(showBusinessChainWhole(state.draft, library, initialRange), library, mode, state.draft.presentation.layout)
  draft.presentation = { ...draft.presentation, mode }
  return { ...state, draft, initialDraft: draft }
}

function persistWorking(draft) {
  let previous
  let sessionWritten = false
  try {
    const value = JSON.stringify({ draft })
    previous = window.sessionStorage.getItem(CHAIN_DESIGN_WORKING_KEY)
    window.sessionStorage.setItem(CHAIN_DESIGN_WORKING_KEY, value)
    sessionWritten = true
    window.localStorage.setItem(CHAIN_DESIGN_WORKING_KEY, value)
    return ''
  } catch {
    // A failed durable write must not leave a replacement view in this tab's cache.
    if (sessionWritten) {
      try {
        if (previous === null) window.sessionStorage.removeItem(CHAIN_DESIGN_WORKING_KEY)
        else window.sessionStorage.setItem(CHAIN_DESIGN_WORKING_KEY, previous)
      } catch { return '自动保留失败，标签页暂存也无法恢复；当前内容仍在页面，请保持打开并重试。' }
    }
    return '自动保留失败，当前内容仍在页面；请保持页面打开并重试。'
  }
}

export default function useBusinessChainDraft(library, initialRange, startBlank = false) {
  const [state, setState] = useState(() => initialState(library, initialRange, startBlank))
  const current = useRef(state)
  const publish = useCallback((next, persist = true) => {
    const value = persist && !next.restoreFailed ? { ...next, issue: persistWorking(next.draft) } : next
    current.current = value
    setState(value)
  }, [])
  useEffect(() => {
    if (!startBlank && !current.current.issue) publish(current.current)
  }, [startBlank, publish])
  const change = (next) => {
    const previous = current.current
    const draft = typeof next === 'function' ? next(previous.draft) : next
    if (equal(draft, previous.draft)) return
    publish({ ...previous, draft, past: [...previous.past.slice(-39), previous.draft], future: [] })
  }
  const changePresentation = (patch) => {
    const previous = current.current
    const update = (snapshot) => ({
      ...snapshot,
      presentation: { mode: 'mainline', highlightedRoles: [], ...snapshot.presentation, ...patch },
    })
    const draft = update(previous.draft)
    if (equal(previous.draft.presentation, draft.presentation)) return
    // Keep the current reading preference without replacing other settings in edit history.
    publish({ ...previous, draft, past: previous.past.map(update), future: previous.future.map(update) })
  }
  const undo = () => {
    const previous = current.current
    if (previous.past.length) publish({ ...previous, draft: previous.past.at(-1), past: previous.past.slice(0, -1), future: [...previous.future, previous.draft] })
  }
  const redo = () => {
    const previous = current.current
    if (previous.future.length) publish({ ...previous, draft: previous.future.at(-1), past: [...previous.past.slice(-39), previous.draft], future: previous.future.slice(0, -1) })
  }
  const startNew = () => {
    const next = blankState()
    const error = persistWorking(next.draft)
    if (error) {
      // The explicit blank URL stays in place until the new tab can record its draft.
      if (startBlank) publish({ ...current.current, issue: error }, false)
      return error
    }
    publish(next, false)
    return ''
  }
  return {
    ...state,
    change,
    changePresentation,
    undo,
    redo,
    startNew,
    retryPersistence: () => publish(current.current),
    needsNewConfirmation: state.restoreFailed || !equal(state.draft, state.initialDraft),
  }
}
