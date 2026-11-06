import { createContext, useContext, useMemo } from 'react'

export const OverlayScopeContext = createContext(null)
export const OverlayDialogOpenContext = createContext(undefined)
export const useOverlayScope = () => useContext(OverlayScopeContext)

export function useOverlayPopupAlign(align) {
  const enabled = useOverlayScope()?.enabled
  return useMemo(() => enabled ? {
    ...align,
    htmlRegion: 'scroll',
    overflow: { adjustX: true, adjustY: true, shiftX: true, shiftY: true, ...align?.overflow },
  } : align, [align, enabled])
}

export function hasVisibleOverlayPopup(scope) {
  if (typeof document === 'undefined') return false
  const root = scope && (scope.portalScoped || scope.enabled || !scope.visible) ? scope.host : document
  return [...root.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')]
    .some((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
}

export function canRestoreOverlayFocus(scope) {
  if (!scope) return true
  if (!scope.visible) return false
  if (!scope.enabled) return true
  const active = document.activeElement
  return !active || active === document.body || scope.host.contains(active) || scope.containerRef.current?.contains(active)
}
