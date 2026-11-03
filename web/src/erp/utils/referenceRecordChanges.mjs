export const REFERENCE_RECORDS_CHANGED = 'erp-reference-records-changed'

// 只通知资料身份；读取方按自己的权限重读，不在编辑器之间传递业务快照。
export function notifyReferenceRecordsChanged(referenceType, id) {
  if (
    typeof window === 'undefined' ||
    typeof referenceType !== 'string' ||
    !referenceType ||
    !Number.isSafeInteger(id) ||
    id <= 0
  ) return
  window.dispatchEvent(new window.CustomEvent(REFERENCE_RECORDS_CHANGED, {
    detail: Object.freeze({ referenceType, id }),
  }))
}
