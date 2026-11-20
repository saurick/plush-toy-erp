import { flushSync } from 'react-dom'

export const REVEAL_LINE_ITEM = 'erp:reveal-line-item'
export const REVEAL_LINE_ITEM_ERRORS = 'erp:reveal-line-item-errors'

export function lineItemFieldIndex(name, prefix = 'items') {
  const path = Array.isArray(prefix) ? prefix : [prefix]
  if (!Array.isArray(name) || !path.every((value, index) => name[index] === value)) return null
  const index = name[path.length]
  return Number.isInteger(index) && index >= 0 ? index : null
}

export function revealBusinessLineItemErrors(form, errorFields) {
  if (!form || !errorFields?.length || typeof document === 'undefined') return
  // Form 随后同步滚动和聚焦，先提交分组的可见状态。
  flushSync(() => document.dispatchEvent(new document.defaultView.CustomEvent(REVEAL_LINE_ITEM_ERRORS, {
    detail: { form, errorFields },
  })))
}

export function revealBusinessLineItemElement(element, index) {
  element?.dispatchEvent(new element.ownerDocument.defaultView.CustomEvent(REVEAL_LINE_ITEM, {
    bubbles: true,
    detail: { index },
  }))
}
