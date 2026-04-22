import { useEffect, useRef } from 'react'
import {
  persistPrintWorkspaceWindowHTML,
  persistPrintWorkspaceWindowState,
  syncPrintWorkspaceShellHistory,
} from './printWorkspace.js'

const SNAPSHOT_PERSIST_DELAY_MS = 160

function syncClonedFormState(sourceDocument, clonedDocument) {
  const sourceFields = Array.from(
    sourceDocument.querySelectorAll('input, textarea, select')
  )
  const clonedFields = Array.from(
    clonedDocument.querySelectorAll('input, textarea, select')
  )

  sourceFields.forEach((sourceField, index) => {
    const clonedField = clonedFields[index]
    if (!clonedField) {
      return
    }

    const tagName = String(sourceField.tagName || '').toLowerCase()
    if (tagName === 'textarea') {
      clonedField.textContent = sourceField.value
      return
    }

    if (tagName === 'select') {
      Array.from(clonedField.options || []).forEach((option, optionIndex) => {
        const sourceOption = sourceField.options?.[optionIndex]
        const isSelected = Boolean(sourceOption?.selected)
        option.selected = isSelected
        if (isSelected) {
          option.setAttribute('selected', 'selected')
        } else {
          option.removeAttribute('selected')
        }
      })
      return
    }

    const inputType = String(sourceField.type || '').toLowerCase()
    if (inputType === 'checkbox' || inputType === 'radio') {
      clonedField.checked = sourceField.checked
      if (sourceField.checked) {
        clonedField.setAttribute('checked', 'checked')
      } else {
        clonedField.removeAttribute('checked')
      }
      return
    }

    clonedField.value = sourceField.value
    clonedField.setAttribute('value', sourceField.value)
  })
}

function injectWorkspaceBootstrapScript(
  sourceDocument,
  clonedDocument,
  workspaceURL
) {
  if (!workspaceURL) {
    return
  }

  const script = sourceDocument.createElement('script')
  script.setAttribute('data-print-workspace-bootstrap', 'true')
  script.textContent = `
;(() => {
  const workspaceURL = ${JSON.stringify(String(workspaceURL || ''))}
  if (!workspaceURL) {
    return
  }
  try {
    const targetURL = new URL(workspaceURL, window.location.origin)
    window.history.replaceState(
      null,
      '',
      \`\${targetURL.pathname}\${targetURL.search}\${targetURL.hash}\`
    )
  } catch (error) {
    // 忽略 URL 恢复失败，保留当前静态快照兜底。
  }
})()
`

  if (clonedDocument.head) {
    clonedDocument.head.prepend(script)
  } else if (clonedDocument.body) {
    clonedDocument.body.prepend(script)
  }
}

function buildPrintWorkspaceWindowHTML(documentLike, workspaceURL) {
  if (!documentLike?.documentElement) {
    return ''
  }

  const clonedDocument = documentLike.documentElement.cloneNode(true)
  syncClonedFormState(documentLike, clonedDocument)
  injectWorkspaceBootstrapScript(documentLike, clonedDocument, workspaceURL)
  return `<!doctype html>${clonedDocument.outerHTML}`
}

export default function usePrintWorkspaceWindowSnapshot({
  stateID = '',
  templateKey = '',
  workspaceURL = '',
  observeNodeRef = null,
}) {
  const persistTimerRef = useRef(0)

  useEffect(() => {
    if (!stateID || typeof window === 'undefined') {
      return
    }

    persistPrintWorkspaceWindowState(stateID, {
      templateKey,
      workspaceURL,
    })
    syncPrintWorkspaceShellHistory(stateID)
  }, [stateID, templateKey, workspaceURL])

  useEffect(() => {
    const observedNode = observeNodeRef?.current
    if (
      !stateID ||
      typeof window === 'undefined' ||
      !observedNode?.ownerDocument
    ) {
      return undefined
    }

    const doc = observedNode.ownerDocument
    const win = doc.defaultView || window

    const clearPersistTimer = () => {
      if (!persistTimerRef.current) {
        return
      }
      win.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = 0
    }

    const persistSnapshot = () => {
      clearPersistTimer()
      const windowHTML = buildPrintWorkspaceWindowHTML(doc, workspaceURL)
      if (!windowHTML) {
        return
      }
      persistPrintWorkspaceWindowHTML(stateID, {
        templateKey,
        workspaceURL,
        windowHTML,
      })
    }

    const schedulePersist = (delayMs = SNAPSHOT_PERSIST_DELAY_MS) => {
      clearPersistTimer()
      persistTimerRef.current = win.setTimeout(persistSnapshot, delayMs)
    }

    const mutationObserver =
      typeof win.MutationObserver === 'function'
        ? new win.MutationObserver(() => schedulePersist())
        : null
    mutationObserver?.observe(doc.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })

    const handleInput = () => schedulePersist()
    const handleVisibilityChange = () => {
      if (doc.visibilityState === 'hidden') {
        persistSnapshot()
      }
    }

    doc.addEventListener('input', handleInput, true)
    doc.addEventListener('change', handleInput, true)
    doc.addEventListener('visibilitychange', handleVisibilityChange)
    win.addEventListener('pagehide', persistSnapshot)
    win.addEventListener('beforeunload', persistSnapshot)

    schedulePersist(0)

    return () => {
      clearPersistTimer()
      mutationObserver?.disconnect()
      doc.removeEventListener('input', handleInput, true)
      doc.removeEventListener('change', handleInput, true)
      doc.removeEventListener('visibilitychange', handleVisibilityChange)
      win.removeEventListener('pagehide', persistSnapshot)
      win.removeEventListener('beforeunload', persistSnapshot)
    }
  }, [observeNodeRef, stateID, templateKey, workspaceURL])
}
