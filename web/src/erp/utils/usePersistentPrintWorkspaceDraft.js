import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { clearInitialPrintWorkspaceDraftCache } from './printWorkspace.js'
import {
  createPrintDraftWriter,
  writePrintDraft,
} from './printDraftStorage.mjs'

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
  const element = documentLike?.activeElement
  const editable = element?.isContentEditable
    ? element
    : element?.closest?.('[contenteditable="true"]')
  editable?.blur?.()
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
  const activeKey = useRef(draftStorageKey)
  const writer = useMemo(
    () =>
      createPrintDraftWriter({
        write: async (nextDraft) => {
          const saved = await writePrintDraft(draftStorageKey, nextDraft)
          if (saved) clearInitialPrintWorkspaceDraftCache(draftStorageKey)
          return saved
        },
        onStatus: (status) => {
          if (activeKey.current === draftStorageKey) {
            setPersistenceStatus(draftStorageKey ? status : 'unavailable')
          }
        },
      }),
    [draftStorageKey]
  )

  useLayoutEffect(() => {
    if (activeKey.current === draftStorageKey) return
    activeKey.current = draftStorageKey
    draftRef.current = resolveNextDraft(initialDraft, draftRef.current)
    setDraftState(draftRef.current)
    setPersistenceStatus(draftStorageKey ? 'saving' : 'unavailable')
  }, [draftStorageKey, initialDraft])

  useEffect(
    () => () => {
      writer.flush()
    },
    [writer]
  )

  const setDraft = useCallback(
    (nextDraft) => {
      draftRef.current = resolveNextDraft(nextDraft, draftRef.current)
      const saved = writer.save(draftRef.current)
      if (silentDraftUpdateDepth === 0) setDraftState(draftRef.current)
      return saved
    },
    [writer]
  )

  const flushDraft = useMemo(
    () =>
      Object.assign(
        async () => {
          setDraftState(draftRef.current)
          if (writer.unsaved && !writer.pending) writer.save(draftRef.current)
          return writer.flush()
        },
        { hasPending: () => writer.unsaved }
      ),
    [writer]
  )

  return [draft, setDraft, flushDraft, draftRef, persistenceStatus]
}

export function useFlushPrintWorkspaceDraftOnPageExit(flushDraft) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof flushDraft !== 'function') {
      return undefined
    }
    const handlePageExit = (event) => {
      const unsaved = flushDraft.hasPending?.()
      blurActiveContentEditable(window.document)
      if (event.type === 'beforeunload' && unsaved) {
        event.preventDefault()
        event.returnValue = ''
      }
      flushDraft()
    }
    const handleVisibility = () => {
      if (window.document.visibilityState === 'hidden') flushDraft()
    }
    window.addEventListener('pagehide', handlePageExit, true)
    window.addEventListener('beforeunload', handlePageExit, true)
    window.document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('pagehide', handlePageExit, true)
      window.removeEventListener('beforeunload', handlePageExit, true)
      window.document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [flushDraft])
}
