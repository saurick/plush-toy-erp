import React, { createContext, useContext, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { getRuntimeAppDefinition } from '../config/appRegistry.mjs'
import { parseMobileRoleFromPath } from '../config/entryConfig.mjs'
import { getRoleWorkbench } from '../config/seedData.mjs'

const FALLBACK_ROLE_KEY = 'boss'

const ERPWorkspaceContext = createContext(null)

export function ERPWorkspaceProvider({ children }) {
  const location = useLocation()
  const appConfig = useMemo(() => getRuntimeAppDefinition(), [])
  const routeMobileRoleKey = parseMobileRoleFromPath(location.pathname)
  const activeRoleKey =
    appConfig.kind === 'mobile'
      ? appConfig.roleKey
      : routeMobileRoleKey || FALLBACK_ROLE_KEY
  const activeRole = getRoleWorkbench(activeRoleKey)
  const isMobileRoute = Boolean(routeMobileRoleKey)
  const isMobileExperience = appConfig.kind === 'mobile' || isMobileRoute

  const value = useMemo(
    () => ({
      appConfig,
      activeRoleKey,
      activeRole,
      isDesktopApp: appConfig.kind === 'desktop',
      isMobileApp: appConfig.kind === 'mobile',
      isMobileRoute,
      isMobileExperience,
    }),
    [activeRole, activeRoleKey, appConfig, isMobileExperience, isMobileRoute]
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
