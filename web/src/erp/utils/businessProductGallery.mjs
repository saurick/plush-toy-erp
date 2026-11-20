import { AttachmentPolicy } from '../../common/consts/attachments.generated.mjs'

export const DOCUMENT_PRODUCT_SOURCES = AttachmentPolicy.documentProductPreviewSources
export const DOCUMENT_PRODUCT_GALLERY_COLUMN = Object.freeze({
  key: 'product_gallery',
  title: '产品图片',
  width: 180,
  defaultFirst: true,
  exportable: false,
})

export function normalizeGalleryProducts(items = []) {
  const products = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const productID = Number(item?.productID ?? item?.product_id ?? 0)
    if (!Number.isSafeInteger(productID) || productID <= 0 || products.has(productID)) continue
    products.set(productID, {
      productID,
      name: String(item.name || item.product_name_snapshot || item.product_name || item.requested_product_name || '产品已关联'),
      code: String(item.code || item.product_code_snapshot || item.product_no_snapshot || item.product_code || ''),
      imageAttachmentID: Number(item.imageAttachmentID || item.product_image_attachment_id || 0),
    })
  }
  return [...products.values()].sort((left, right) => left.productID - right.productID)
}

// Batch visible IDs. A revised order can share a queued read, but needs a new
// request once the previous read has started.
export function createDocumentProductPreviewLoader(list) {
  const groups = new Map()
  let scheduled = false
  function schedule() {
    if (scheduled) return
    scheduled = true
    setTimeout(flush, 0)
  }
  async function flush() {
    scheduled = false
    const requests = []
    for (const [source, group] of groups) {
      const entries = [...group.queued.entries()].slice(0, AttachmentPolicy.documentProductPreviewBatchLimit)
      if (!entries.length) continue
      for (const [id] of entries) group.queued.delete(id)
      requests.push((async () => {
        try {
          const rows = await list({ source_type: source, document_ids: entries.map(([id]) => id) })
          const result = new Map()
          const expected = new Set(entries.map(([id]) => id))
          for (const row of Array.isArray(rows) ? rows : []) {
            if (!expected.has(row?.document_id) || result.has(row.document_id) || !Number.isSafeInteger(row.product_count) || row.product_count < 0 || !Number.isSafeInteger(row.product_id) || row.product_id < 0 || (row.product_count > 0) !== (row.product_id > 0)) {
              throw new Error('单据产品数据不完整')
            }
            result.set(row.document_id, row)
          }
          if (result.size !== entries.length) throw new Error('单据产品数据不完整')
          for (const [id, request] of entries) request.resolve(result.get(id))
        } catch (error) {
          for (const [, request] of entries) request.reject(error)
        } finally {
          for (const [id, request] of entries) {
            if (group.pending.get(id) === request) group.pending.delete(id)
          }
        }
      })())
    }
    if ([...groups.values()].some((group) => group.queued.size)) schedule()
    await Promise.all(requests)
  }
  return (source, documentID, revision) => {
    if (!Object.values(DOCUMENT_PRODUCT_SOURCES).includes(source) || !Number.isSafeInteger(documentID) || documentID <= 0) return Promise.reject(new Error('单据产品参数无效'))
    if (!groups.has(source)) groups.set(source, { pending: new Map(), queued: new Map() })
    const group = groups.get(source)
    const queued = group.queued.get(documentID)
    if (queued) {
      queued.revision = revision
      return queued.promise
    }
    const pending = group.pending.get(documentID)
    if (pending && pending.revision === revision) return pending.promise
    let resolve
    let reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    const request = { revision, promise, resolve, reject }
    group.pending.set(documentID, request)
    group.queued.set(documentID, request)
    schedule()
    return promise
  }
}
