import { useEffect } from 'react'
import { persistPrintWorkspaceWindowState } from './printWorkspace.js'

// The route identifies the window; IndexedDB owns its draft, including images.
export default function usePrintWorkspaceWindowState({
  stateID = '',
  templateKey = '',
  workspaceURL = '',
}) {
  useEffect(() => {
    if (!stateID || typeof window === 'undefined') return
    persistPrintWorkspaceWindowState(stateID, { templateKey, workspaceURL })
  }, [stateID, templateKey, workspaceURL])
}
