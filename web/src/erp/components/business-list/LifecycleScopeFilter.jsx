import React from 'react'

import { SelectFilter } from './BusinessListLayout.jsx'
import {
  LIFECYCLE_SCOPE_OPTIONS,
  normalizeLifecycleScope,
} from '../../utils/lifecycleScope.mjs'

export default function LifecycleScopeFilter({ value, onChange, ...props }) {
  return (
    <SelectFilter
      aria-label="记录范围"
      className="erp-business-filter-control--status"
      options={LIFECYCLE_SCOPE_OPTIONS}
      value={normalizeLifecycleScope(value)}
      onChange={(nextValue) => onChange?.(normalizeLifecycleScope(nextValue))}
      {...props}
    />
  )
}
