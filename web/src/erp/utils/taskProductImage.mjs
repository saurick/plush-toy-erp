export function createTaskProductImageLoader(download) {
  return createOwnedReferenceImageLoader(download, {
    ownerType: 'product',
    ownerKey: 'productID',
    invalidResponse: '产品图片不可用',
  })
}

export function createOwnedReferenceImageLoader(download, { ownerType, ownerKey, invalidResponse }) {
  const cache = new Map()
  function load({ attachmentID, [ownerKey]: ownerID, variant = 'thumbnail' }) {
    const key = `${ownerID}:${attachmentID}:${variant}`
    if (variant === 'thumbnail' && cache.has(key)) return cache.get(key)
    const request = download({
      id: attachmentID,
      ...(variant ? { variant } : {}),
    })
      .then((image) => {
        if (
          image?.id !== attachmentID ||
          image?.owner_type !== ownerType ||
          image?.owner_id !== ownerID ||
          !image?.content_base64 ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(image?.mime_type)
        ) {
          throw new Error(invalidResponse)
        }
        return `data:${image.mime_type};base64,${image.content_base64}`
      })
      .catch((error) => {
        if (cache.get(key) === request) cache.delete(key)
        throw error
      })
    if (variant === 'thumbnail') {
      cache.set(key, request)
      if (cache.size > 64) cache.delete(cache.keys().next().value)
    }
    return request
  }
  load.invalidate = ({ attachmentID, [ownerKey]: ownerID }) => {
    cache.delete(`${ownerID}:${attachmentID}:thumbnail`)
  }
  return load
}
