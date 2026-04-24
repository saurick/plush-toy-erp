import { useEffect, useRef } from 'react'
import {
  persistPrintWorkspaceWindowHTML,
  persistPrintWorkspaceWindowState,
  syncPrintWorkspaceShellHistory,
} from './printWorkspace.js'

const SNAPSHOT_PERSIST_DELAY_MS = 320
const SNAPSHOT_PERSIST_IDLE_TIMEOUT_MS = 1000
const PRINT_WORKSPACE_PREPARING_TEXT = '正在准备打印模板...'

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
  clonedRoot,
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

  const clonedHead = clonedRoot?.querySelector?.('head')
  const clonedBody = clonedRoot?.querySelector?.('body')

  if (clonedHead) {
    clonedHead.prepend(script)
  } else if (clonedBody) {
    clonedBody.prepend(script)
  }
}

function resetClonedPrintWorkspaceShellState(clonedRoot) {
  const printShell = clonedRoot?.querySelector?.('.erp-print-shell')
  if (!printShell) {
    return
  }

  printShell.classList.remove('erp-print-shell--ready')
  printShell.classList.add('erp-print-shell--preparing')

  if (!printShell.getAttribute('data-preparing-text')) {
    printShell.setAttribute(
      'data-preparing-text',
      PRINT_WORKSPACE_PREPARING_TEXT
    )
  }
}

export function buildPrintWorkspaceWindowHTML(documentLike, workspaceURL) {
  if (!documentLike?.documentElement) {
    return ''
  }

  const clonedRoot = documentLike.documentElement.cloneNode(true)
  resetClonedPrintWorkspaceShellState(clonedRoot)
  syncClonedFormState(documentLike, clonedRoot)
  injectWorkspaceBootstrapScript(documentLike, clonedRoot, workspaceURL)
  return `<!doctype html>${clonedRoot.outerHTML}`
}

export default function usePrintWorkspaceWindowSnapshot({
  stateID = '',
  templateKey = '',
  workspaceURL = '',
  observeNodeRef = null,
  suspended = false,
}) {
  const persistTimerRef = useRef(0)
  const persistIdleRef = useRef(0)

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
      suspended ||
      typeof window === 'undefined' ||
      !observedNode?.ownerDocument
    ) {
      return undefined
    }

    const doc = observedNode.ownerDocument
    const win = doc.defaultView || window

    const clearPersistHandles = () => {
      if (persistTimerRef.current) {
        win.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = 0
      }
      if (
        persistIdleRef.current &&
        typeof win.cancelIdleCallback === 'function'
      ) {
        win.cancelIdleCallback(persistIdleRef.current)
        persistIdleRef.current = 0
      }
    }

    const persistSnapshot = () => {
      persistTimerRef.current = 0
      persistIdleRef.current = 0
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
      clearPersistHandles()
      persistTimerRef.current = win.setTimeout(() => {
        persistTimerRef.current = 0
        if (typeof win.requestIdleCallback === 'function') {
          persistIdleRef.current = win.requestIdleCallback(persistSnapshot, {
            timeout: SNAPSHOT_PERSIST_IDLE_TIMEOUT_MS,
          })
          return
        }
        persistSnapshot()
      }, delayMs)
    }

    const mutationObserver =
      typeof win.MutationObserver === 'function'
        ? new win.MutationObserver(() => schedulePersist())
        : null
    mutationObserver?.observe(observedNode, {
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
      clearPersistHandles()
      mutationObserver?.disconnect()
      doc.removeEventListener('input', handleInput, true)
      doc.removeEventListener('change', handleInput, true)
      doc.removeEventListener('visibilitychange', handleVisibilityChange)
      win.removeEventListener('pagehide', persistSnapshot)
      win.removeEventListener('beforeunload', persistSnapshot)
    }
  }, [observeNodeRef, stateID, suspended, templateKey, workspaceURL])
}
