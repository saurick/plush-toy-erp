export function createTaskProductImageLoader(download) {
  const cache = new Map()
  return function load({ attachmentID, productID, variant = 'thumbnail' }) {
    const key = `${productID}:${attachmentID}:${variant}`
    if (variant === 'thumbnail' && cache.has(key)) return cache.get(key)
    const request = download({
      id: attachmentID,
      ...(variant ? { variant } : {}),
    })
      .then((image) => {
        if (
          image?.id !== attachmentID ||
          image?.owner_type !== 'product' ||
          image?.owner_id !== productID ||
          !image?.content_base64 ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(image?.mime_type)
        ) {
          throw new Error('产品图片不可用')
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
}
