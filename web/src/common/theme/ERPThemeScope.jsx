import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ConfigProvider } from 'antd'
import { createERPAntdTheme } from './erpAntdTheme.mjs'
import { getERPThemeScopeStyle } from './erpThemePalette.mjs'

// Portals stay outside #root so modal background isolation never disables them.
export default function ERPThemeScope({ mode, accent, density, workbench = false, children, className }) {
  const scopeRef = useRef(null)
  const [portalRoot, setPortalRoot] = useState(null)
  useLayoutEffect(() => {
    const root = document.createElement('div')
    document.body.append(root)
    setPortalRoot(root)
    return () => root.remove()
  }, [])
  const getPopupContainer = useCallback((trigger) => {
    if (trigger && scopeRef.current?.contains(trigger)) return scopeRef.current
    return portalRoot
  }, [portalRoot])
  const isDark = mode === 'dark'
  const scopeStyle = useMemo(() => getERPThemeScopeStyle(isDark, accent), [isDark, accent])
  useLayoutEffect(() => {
    if (!portalRoot) return
    portalRoot.dataset.erpTheme = mode
    portalRoot.dataset.erpThemePortal = ''
    portalRoot.style.colorScheme = scopeStyle.colorScheme
    for (const [property, value] of Object.entries(scopeStyle)) {
      if (property.startsWith('--')) portalRoot.style.setProperty(property, value)
    }
  }, [portalRoot, mode, scopeStyle])

  if (!portalRoot) return null
  return (
    <ConfigProvider
      theme={createERPAntdTheme({ isDark, accent, density, workbench })}
      getPopupContainer={getPopupContainer}
    >
      <div data-erp-theme={mode} style={scopeStyle} ref={scopeRef} className={className}>
        {children}
      </div>
    </ConfigProvider>
  )
}
