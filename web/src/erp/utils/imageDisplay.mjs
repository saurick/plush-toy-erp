export function isUsableImageDimensions(image) {
  const width = Number(image?.naturalWidth)
  const height = Number(image?.naturalHeight)
  return width > 0 && height > 0 && (width > 1 || height > 1)
}
