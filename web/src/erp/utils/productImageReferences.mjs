export const PRODUCT_IMAGES_CHANGED = 'erp-product-images-changed'

export function notifyProductImagesChanged(productID) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PRODUCT_IMAGES_CHANGED, {
        detail: Number(productID || 0),
      })
    )
  }
}

// Coalesce visible product references without putting originals in list responses.
export function createProductImageReferenceLoader(list) {
  const pending = new Map()
  const queued = new Map()
  let scheduled = false
  async function flush() {
    scheduled = false
    const entries = [...queued.entries()].slice(0, 80)
    if (!entries.length) return
    for (const [id] of entries) queued.delete(id)
    try {
      const rows = await list({ product_ids: entries.map(([id]) => id) })
      const refs = new Map()
      const requested = new Set(entries.map(([id]) => id))
      for (const row of Array.isArray(rows) ? rows : []) {
        if (
          !requested.has(row?.product_id) ||
          refs.has(row.product_id) ||
          !Number.isSafeInteger(row.image_attachment_id) ||
          row.image_attachment_id < 0
        ) {
          throw new Error('产品图片引用不完整')
        }
        refs.set(row.product_id, row.image_attachment_id)
      }
      if (refs.size !== entries.length) throw new Error('产品图片引用不完整')
      for (const [id, request] of entries) request.resolve(refs.get(id))
    } catch (error) {
      for (const [, request] of entries) request.reject(error)
    } finally {
      for (const [id, request] of entries) {
        if (pending.get(id) === request.promise) pending.delete(id)
      }
      if (queued.size && !scheduled) {
        scheduled = true
        setTimeout(flush, 0)
      }
    }
  }
  function read(productID) {
    if (!Number.isSafeInteger(productID) || productID <= 0) {
      return Promise.resolve(0)
    }
    if (pending.has(productID)) return pending.get(productID)
    let resolve
    let reject
    const promise = new Promise((yes, no) => {
      resolve = yes
      reject = no
    })
    pending.set(productID, promise)
    queued.set(productID, { promise, resolve, reject })
    if (!scheduled) {
      scheduled = true
      setTimeout(flush, 0)
    }
    return promise
  }
  read.invalidate = (productID) => {
    pending.delete(productID)
    const request = queued.get(productID)
    if (request) {
      queued.delete(productID)
      request.resolve(0)
    }
  }
  return read
}
