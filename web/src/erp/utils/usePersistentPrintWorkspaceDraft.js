import { useCallback, useEffect, useRef, useState } from 'react'
import { persistPrintWorkspaceDraftSnapshot } from './printWorkspace.js'

let silentDraftUpdateDepth = 0

export function runSilentPrintWorkspaceDraftUpdate(callback) {
  silentDraftUpdateDepth += 1
  try {
    return callback()
  } finally {
    silentDraftUpdateDepth -= 1
  }
}

function resolveNextDraft(nextDraft, currentDraft) {
  return typeof nextDraft === 'function' ? nextDraft(currentDraft) : nextDraft
}

function blurActiveContentEditable(documentLike) {
  const activeElement = documentLike?.activeElement
  if (!activeElement) {
    return false
  }

  const editableElement =
    activeElement.isContentEditable === true
      ? activeElement
      : activeElement.closest?.('[contenteditable="true"]')
  if (!editableElement || typeof editableElement.blur !== 'function') {
    return false
  }

  editableElement.blur()
  return true
}

export function usePersistentPrintWorkspaceDraft(
  initialDraft,
  draftStorageKey
) {
  const [draft, setDraftState] = useState(initialDraft)
  const [persistenceStatus, setPersistenceStatus] = useState(
    draftStorageKey ? 'saving' : 'unavailable'
  )
  const draftRef = useRef(draft)

  const persistDraft = useCallback(
    (nextDraft = draftRef.current) => {
      if (!draftStorageKey || typeof window === 'undefined') {
        setPersistenceStatus('unavailable')
        return false
      }
      const saved = persistPrintWorkspaceDraftSnapshot(
        draftStorageKey,
        nextDraft
      )
      setPersistenceStatus(saved ? 'saved' : 'error')
      return saved
    },
    [draftStorageKey]
  )

  const setDraft = useCallback(
    (nextDraft) => {
      const resolvedDraft = resolveNextDraft(nextDraft, draftRef.current)
      draftRef.current = resolvedDraft
      const persisted = persistDraft(resolvedDraft)
      if (silentDraftUpdateDepth > 0) {
        return persisted
      }
      setDraftState(resolvedDraft)
      return persisted
    },
    [persistDraft]
  )

  const flushDraft = useCallback(() => {
    setDraftState((currentDraft) =>
      currentDraft === draftRef.current ? currentDraft : draftRef.current
    )
    return persistDraft(draftRef.current)
  }, [persistDraft])

  return [draft, setDraft, flushDraft, draftRef, persistenceStatus]
}

export function useFlushPrintWorkspaceDraftOnPageExit(flushDraft) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof flushDraft !== 'function') {
      return undefined
    }

    const handlePageExit = () => {
      blurActiveContentEditable(window.document)
      flushDraft()
    }

    window.addEventListener('pagehide', handlePageExit, true)
    window.addEventListener('beforeunload', handlePageExit, true)

    return () => {
      window.removeEventListener('pagehide', handlePageExit, true)
      window.removeEventListener('beforeunload', handlePageExit, true)
    }
  }, [flushDraft])
}
