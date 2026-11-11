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

export function createProductImageReferenceLoader(list) {
  return createReferenceImageIDLoader(list, {
    requestField: 'product_ids',
    identityField: 'product_id',
    invalidResponse: '产品图片引用不完整',
  })
}

// Coalesce visible references without putting originals in list responses.
export function createReferenceImageIDLoader(list, { requestField, identityField, invalidResponse }) {
  const pending = new Map()
  const queued = new Map()
  let scheduled = false
  async function flush() {
    scheduled = false
    const entries = [...queued.entries()].slice(0, 80)
    if (!entries.length) return
    for (const [id] of entries) queued.delete(id)
    try {
      const rows = await list({ [requestField]: entries.map(([id]) => id) })
      const refs = new Map()
      const requested = new Set(entries.map(([id]) => id))
      for (const row of Array.isArray(rows) ? rows : []) {
        const id = row?.[identityField]
        if (
          !requested.has(id) ||
          refs.has(id) ||
          !Number.isSafeInteger(row.image_attachment_id) ||
          row.image_attachment_id < 0
        ) {
          throw new Error(invalidResponse)
        }
        refs.set(id, row.image_attachment_id)
      }
      if (refs.size !== entries.length) throw new Error(invalidResponse)
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
  function read(ownerID) {
    if (!Number.isSafeInteger(ownerID) || ownerID <= 0) {
      return Promise.resolve(0)
    }
    if (pending.has(ownerID)) return pending.get(ownerID)
    let resolve
    let reject
    const promise = new Promise((yes, no) => {
      resolve = yes
      reject = no
    })
    pending.set(ownerID, promise)
    queued.set(ownerID, { promise, resolve, reject })
    if (!scheduled) {
      scheduled = true
      setTimeout(flush, 0)
    }
    return promise
  }
  read.invalidate = (ownerID) => {
    pending.delete(ownerID)
    const request = queued.get(ownerID)
    if (request) {
      queued.delete(ownerID)
      request.resolve(0)
    }
  }
  return read
}
