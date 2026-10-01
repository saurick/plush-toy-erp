import React from 'react'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import DevRuntimeRecoveryBoundary from './components/DevRuntimeRecoveryBoundary.jsx'

const DevWorkbenchRoutes = lazyWithDynamicImportRetry(
  () => import('./DevWorkbenchRoutes.jsx')
)

export default function DevWorkbenchBridge({ children }) {
  if (children !== undefined) {
    return <DevRuntimeRecoveryBoundary>{children}</DevRuntimeRecoveryBoundary>
  }
  return <DevWorkbenchRoutes />
}
