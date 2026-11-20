import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { lineItemFieldIndex, REVEAL_LINE_ITEM, REVEAL_LINE_ITEM_ERRORS } from './businessLineItemDisclosure.mjs'

function equalCounts(left, right) {
  return left.size === right.size && [...left].every(([key, count]) => right.get(key) === count)
}

const EMPTY_COUNTS = new Map()
const emptySnapshot = () => EMPTY_COUNTS
const emptySubscribe = () => () => {}

function createErrorCounts() {
  let counts = EMPTY_COUNTS
  const listeners = new Set()
  return {
    getSnapshot: () => counts,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    update: (next) => {
      if (equalCounts(counts, next)) return
      counts = next
      listeners.forEach((listener) => listener())
    },
  }
}

// 校验数量只更新标题与定位按钮，避免输入时重绘整张明细表。
export function useBusinessLineItemGroupErrors(controller) {
  return useSyncExternalStore(controller?.errors.subscribe || emptySubscribe, controller?.errors.getSnapshot || emptySnapshot, emptySnapshot)
}

export function useBusinessLineItemErrorCount(store, index) {
  return useSyncExternalStore(store?.subscribe || emptySubscribe, () => store?.getSnapshot().get(index) || 0, () => 0)
}

export default function useBusinessLineItemGroups({ form, groups, name = 'items', defaultExpanded = false }) {
  const rootRef = useRef(null)
  const [root, setRoot] = useState(null)
  const attachRoot = useCallback((node) => { rootRef.current = node; setRoot(node) }, [])
  const activeIndex = useRef(null)
  const current = useRef({ groups, name })
  current.current = { groups, name }
  const signature = groups.map((group) => `${group.id}:${group.indexes.join(',')}`).join('|')
  const previousSignature = useRef(signature)
  const initialized = useRef(groups.length > 0)
  const [collapsed, setCollapsed] = useState(() => new Set(defaultExpanded ? [] : groups.slice(1).map((group) => group.id)))
  const [errors] = useState(createErrorCounts)
  const [lineErrors] = useState(createErrorCounts)
  const [validationRevision, setValidationRevision] = useState(0)
  const changingGroup = previousSignature.current !== signature && rootRef.current?.contains(document.activeElement)
    ? groups.find((group) => group.indexes.includes(activeIndex.current))?.id
    : undefined

  useLayoutEffect(() => {
    if (!groups.length) {
      initialized.current = false
      setCollapsed((previous) => previous.size ? new Set() : previous)
    } else if (!initialized.current) {
      initialized.current = true
      setCollapsed(new Set(defaultExpanded ? [] : groups.slice(1).map((group) => group.id)))
    } else if (previousSignature.current !== signature) {
      const ids = new Set(groups.map((group) => group.id))
      setCollapsed((previous) => {
        const next = new Set([...previous].filter((id) => ids.has(id) && id !== changingGroup))
        return previous.size === next.size && [...previous].every((id) => next.has(id)) ? previous : next
      })
    }
    previousSignature.current = signature
  }, [changingGroup, defaultExpanded, groups, signature])

  const revealIndex = useCallback((index) => {
    const group = current.current.groups.find((entry) => entry.indexes.includes(index))
    if (!group) return
    setCollapsed((previous) => {
      if (!previous.has(group.id)) return previous
      const next = new Set(previous)
      next.delete(group.id)
      return next
    })
  }, [])
  const onRowFocus = useCallback((index) => { activeIndex.current = index }, [])

  useEffect(() => {
    if (!root) return undefined
    let queued = false
    let disposed = false
    const update = () => {
      queued = false
      if (disposed) return
      const counts = new Map()
      const rowCounts = new Map()
      const indexGroups = new Map()
      for (const group of current.current.groups) {
        for (const index of group.indexes) indexGroups.set(index, group.id)
      }
      for (const field of form.getFieldsError()) {
        if (!field.errors.length) continue
        const index = lineItemFieldIndex(field.name, current.current.name)
        const id = indexGroups.get(index)
        if (index !== null) rowCounts.set(index, (rowCounts.get(index) || 0) + 1)
        if (id !== undefined) counts.set(id, (counts.get(id) || 0) + 1)
      }
      errors.update(counts)
      lineErrors.update(rowCounts)
    }
    const schedule = () => {
      if (queued) return
      queued = true
      queueMicrotask(update)
    }
    const revealErrors = (event) => {
      if (event.detail?.form !== form) return
      const first = event.detail.errorFields.find((field) => lineItemFieldIndex(field.name, current.current.name) !== null)
      if (first) {
        revealIndex(lineItemFieldIndex(first.name, current.current.name))
        setValidationRevision((revision) => revision + 1)
      }
      update()
    }
    const revealRow = (event) => revealIndex(event.detail?.index)
    const observer = new MutationObserver(schedule)
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-invalid'] })
    document.addEventListener(REVEAL_LINE_ITEM_ERRORS, revealErrors)
    root.addEventListener(REVEAL_LINE_ITEM, revealRow)
    update()
    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener(REVEAL_LINE_ITEM_ERRORS, revealErrors)
      root.removeEventListener(REVEAL_LINE_ITEM, revealRow)
    }
  }, [errors, form, lineErrors, revealIndex, root, signature])

  return {
    rootRef: attachRoot,
    fieldName: name,
    errors,
    lineErrors,
    validationRevision,
    isCollapsed: (id) => collapsed.has(id) && id !== changingGroup,
    onRowFocus,
    onFocusCapture: (event) => {
      const row = event.target.closest?.('[data-line-item-index]')
      if (row) activeIndex.current = Number(row.dataset.lineItemIndex)
    },
    toggle: (id) => setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    }),
    expandAll: () => setCollapsed(new Set()),
    collapseAll: () => setCollapsed(new Set(groups.map((group) => group.id))),
    revealIndex,
  }
}
