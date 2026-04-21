import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { getRuntimeAppDefinition } from '../config/appRegistry.mjs'
import { getRoleWorkbench } from '../config/seedData.mjs'

const STORAGE_KEY = 'plush-erp.desktop-role'
const FALLBACK_ROLE_KEY = 'boss'

const ERPWorkspaceContext = createContext(null)

function readStoredRole() {
  if (typeof window === 'undefined') {
    return FALLBACK_ROLE_KEY
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return getRoleWorkbench(stored)?.key || FALLBACK_ROLE_KEY
}

export function ERPWorkspaceProvider({ children }) {
  const appConfig = useMemo(() => getRuntimeAppDefinition(), [])
  const [desktopRoleKey, setDesktopRoleKey] = useState(readStoredRole)

  useEffect(() => {
    if (appConfig.kind !== 'desktop' || typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(STORAGE_KEY, desktopRoleKey)
  }, [appConfig.kind, desktopRoleKey])

  const activeRoleKey =
    appConfig.kind === 'mobile' ? appConfig.roleKey : desktopRoleKey
  const activeRole = getRoleWorkbench(activeRoleKey)

  const value = useMemo(
    () => ({
      appConfig,
      activeRoleKey,
      activeRole,
      setDesktopRoleKey,
      isDesktopApp: appConfig.kind === 'desktop',
      isMobileApp: appConfig.kind === 'mobile',
    }),
    [activeRole, activeRoleKey, appConfig]
  )

  return (
    <ERPWorkspaceContext.Provider value={value}>
      {children}
    </ERPWorkspaceContext.Provider>
  )
}

export function useERPWorkspace() {
  const value = useContext(ERPWorkspaceContext)
  if (!value) {
    throw new Error('ERPWorkspaceProvider is missing')
  }
  return value
}
