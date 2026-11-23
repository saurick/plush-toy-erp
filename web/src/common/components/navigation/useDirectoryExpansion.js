import { useState } from 'react'

export default function useDirectoryExpansion(branchKeys) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const isExpanded = (key) => !collapsed.has(key)

  return {
    isExpanded,
    allExpanded: branchKeys.every(isExpanded),
    expand: (key) => setCollapsed((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    }),
    toggle: (key) => setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    }),
    toggleAll: () => setCollapsed((current) => {
      const next = new Set(current)
      const expand = branchKeys.some((key) => current.has(key))
      for (const key of branchKeys) {
        if (expand) next.delete(key)
        else next.add(key)
      }
      return next
    }),
  }
}
