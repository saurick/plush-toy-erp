import { useEffect, useLayoutEffect, useRef } from 'react'
import { runSilentPrintWorkspaceDraftUpdate } from '../../utils/usePersistentPrintWorkspaceDraft.js'

export function usePrintEditableDraftSync({
  editableRef,
  commitElementValue,
  disabled = false,
  elementType,
}) {
  const commitRef = useRef(commitElementValue)
  useLayoutEffect(() => {
    commitRef.current = commitElementValue
  }, [commitElementValue])

  useEffect(() => {
    const element = editableRef.current
    if (!element || disabled) return undefined

    const ownerWindow = element.ownerDocument?.defaultView || window
    const commitSilentDraft = () => {
      runSilentPrintWorkspaceDraftUpdate(() => commitRef.current(element))
    }
    const observer = new ownerWindow.MutationObserver(commitSilentDraft)
    observer.observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    })
    element.dataset.printWorkspaceDraftReady = 'true'
    element.addEventListener('input', commitSilentDraft)

    return () => {
      element.removeEventListener('input', commitSilentDraft)
      observer.disconnect()
      delete element.dataset.printWorkspaceDraftReady
    }
  }, [disabled, editableRef, elementType])
}
