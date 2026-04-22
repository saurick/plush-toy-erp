import React, { createContext, useContext, useMemo } from 'react'
import { getRuntimeAppDefinition } from '../config/appRegistry.mjs'
import { getRoleWorkbench } from '../config/seedData.mjs'

const FALLBACK_ROLE_KEY = 'boss'

const ERPWorkspaceContext = createContext(null)

export function ERPWorkspaceProvider({ children }) {
  const appConfig = useMemo(() => getRuntimeAppDefinition(), [])
  const activeRoleKey =
    appConfig.kind === 'mobile' ? appConfig.roleKey : FALLBACK_ROLE_KEY
  const activeRole = getRoleWorkbench(activeRoleKey)

  const value = useMemo(
    () => ({
      appConfig,
      activeRoleKey,
      activeRole,
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
